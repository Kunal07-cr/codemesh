import fs from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

export type PersistenceHealth = {
  ok: boolean;
  provider: "file" | "postgres";
  durable: boolean;
  detail: string;
  checkedAt: string;
};

export interface StatePersistence {
  readonly provider: PersistenceHealth["provider"];
  readonly durable: boolean;
  init(): Promise<void>;
  load(): Promise<string | null>;
  save(serialized: string): Promise<void>;
  health(): Promise<PersistenceHealth>;
  close(): Promise<void>;
}

export function createStatePersistence(filePath: string, databaseUrl?: string): StatePersistence {
  return databaseUrl ? new PostgresStatePersistence(databaseUrl) : new FileStatePersistence(filePath);
}

class FileStatePersistence implements StatePersistence {
  readonly provider = "file" as const;
  readonly durable = false;

  constructor(private readonly filePath: string) {}

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const backupPath = `${this.filePath}.bak`;
    const [primaryExists, backupExists] = await Promise.all([exists(this.filePath), exists(backupPath)]);
    if (!primaryExists && backupExists) {
      await fs.copyFile(backupPath, this.filePath);
      await fs.rm(backupPath, { force: true });
    }
    if (primaryExists && backupExists) {
      const validPrimary = await fs.readFile(this.filePath, "utf8").then((value) => isJson(value)).catch(() => false);
      if (!validPrimary) await fs.copyFile(backupPath, this.filePath);
      await fs.rm(backupPath, { force: true });
    }
  }

  async load() {
    try {
      return await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }

  async save(serialized: string) {
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const backupPath = `${this.filePath}.bak`;
    await writeAndSync(temporaryPath, serialized);
    if (process.platform === "win32") {
      const primaryExists = await exists(this.filePath);
      if (primaryExists) await fs.copyFile(this.filePath, backupPath);
      try {
        await fs.copyFile(temporaryPath, this.filePath);
        await syncFile(this.filePath);
        await fs.rm(backupPath, { force: true });
      } catch (error) {
        if (primaryExists && await exists(backupPath)) await fs.copyFile(backupPath, this.filePath).catch(() => undefined);
        throw error;
      } finally {
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      }
      return;
    }
    try {
      await fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async health(): Promise<PersistenceHealth> {
    try {
      await fs.access(path.dirname(this.filePath));
      return {
        ok: true,
        provider: this.provider,
        durable: this.durable,
        detail: "Atomic JSON persistence is available. Configure DATABASE_URL for durable multi-instance storage.",
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.provider,
        durable: this.durable,
        detail: error instanceof Error ? error.message : "Storage directory is unavailable.",
        checkedAt: new Date().toISOString()
      };
    }
  }

  async close() {}
}

class PostgresStatePersistence implements StatePersistence {
  readonly provider = "postgres" as const;
  readonly durable = true;
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined
    });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS codemesh_state (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        version BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async load() {
    const result = await this.pool.query<{ payload: unknown }>("SELECT payload FROM codemesh_state WHERE id = $1", ["primary"]);
    const payload = result.rows[0]?.payload;
    return payload === undefined ? null : JSON.stringify(payload);
  }

  async save(serialized: string) {
    await this.pool.query(
      `INSERT INTO codemesh_state (id, payload)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload,
           version = codemesh_state.version + 1,
           updated_at = NOW()`,
      ["primary", serialized]
    );
  }

  async health(): Promise<PersistenceHealth> {
    try {
      const result = await this.pool.query<{ now: string }>("SELECT NOW()::text AS now");
      return {
        ok: true,
        provider: this.provider,
        durable: this.durable,
        detail: `PostgreSQL responded at ${result.rows[0]?.now ?? "the current time"}.`,
        checkedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.provider,
        durable: this.durable,
        detail: error instanceof Error ? error.message : "PostgreSQL is unavailable.",
        checkedAt: new Date().toISOString()
      };
    }
  }

  async close() {
    await this.pool.end();
  }
}

function shouldUseSsl(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    return url.searchParams.get("sslmode") === "require" || !["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeAndSync(filePath: string, value: string) {
  const handle = await fs.open(filePath, "w");
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncFile(filePath: string) {
  const handle = await fs.open(filePath, "r+");
  try {
    await handle.sync().catch((error) => {
      if (!isNodeError(error) || !["EPERM", "EINVAL"].includes(error.code ?? "")) throw error;
    });
  } finally {
    await handle.close();
  }
}

function isJson(value: string) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
