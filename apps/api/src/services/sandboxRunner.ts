import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RepoFile } from "@codemesh/shared";
import type { AppConfig } from "../config.js";

export type VerificationPreset = "tests" | "typecheck" | "build";
export type VerificationReport = {
  mode: "static-isolated" | "process-isolated";
  preset: VerificationPreset;
  status: "passed" | "attention" | "blocked" | "failed";
  command?: string;
  durationMs: number;
  checks: Array<{ label: string; status: "passed" | "attention" | "blocked"; detail: string }>;
  logs: string[];
  disclaimer: string;
};

export class SandboxRunner {
  constructor(private readonly config: AppConfig) {}

  info() {
    return {
      enabled: this.config.SANDBOX_EXECUTION_ENABLED,
      timeoutMs: this.config.SANDBOX_TIMEOUT_MS,
      mode: this.config.SANDBOX_EXECUTION_ENABLED ? "process-isolated" : "static-isolated",
      boundary: this.config.SANDBOX_EXECUTION_ENABLED
        ? "Temporary workspace, command allowlist, restricted environment, output cap, and hard timeout. Use a dedicated container worker for untrusted repositories."
        : "Static verification only. Configure a dedicated sandbox worker before enabling repository commands in production."
    };
  }

  async verify(files: RepoFile[], preset: VerificationPreset): Promise<VerificationReport> {
    const startedAt = Date.now();
    const packageFile = files.find((file) => file.path === "package.json" && !file.binary);
    const scripts = readScripts(packageFile?.content);
    const scriptName = resolveScript(preset, scripts);
    const checks: VerificationReport["checks"] = [
      { label: "Repository materialization", status: files.length ? "passed" : "blocked", detail: files.length ? `${files.length} safe text files are available.` : "No repository files are available." },
      { label: "Sensitive-file boundary", status: files.some((file) => file.sensitive) ? "attention" : "passed", detail: files.some((file) => file.sensitive) ? "Sensitive files are excluded from execution context." : "No sensitive files enter the verification workspace." },
      { label: "Command allowlist", status: scriptName ? "passed" : "attention", detail: scriptName ? `The ${scriptName} package script is available.` : `No ${preset} script is declared in package.json.` }
    ];

    if (!this.config.SANDBOX_EXECUTION_ENABLED || !scriptName || files.length === 0) {
      return {
        mode: "static-isolated",
        preset,
        status: files.length === 0 ? "blocked" : checks.some((check) => check.status === "attention") ? "attention" : "passed",
        durationMs: Date.now() - startedAt,
        checks,
        logs: [
          this.config.SANDBOX_EXECUTION_ENABLED ? `Skipped execution because package.json has no ${preset} script.` : "Execution is disabled on this host; static gates completed.",
          "Set SANDBOX_EXECUTION_ENABLED=true only on a dedicated, restricted worker."
        ],
        disclaimer: "Static verification does not execute repository code or prove runtime correctness."
      };
    }

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-verify-"));
    try {
      await materialize(directory, files.filter((file) => !file.binary && !file.sensitive));
      const executable = process.platform === "win32" ? "npm.cmd" : "npm";
      const command = `npm run ${scriptName}`;
      const execution = await runProcess(executable, ["run", scriptName], directory, this.config.SANDBOX_TIMEOUT_MS);
      checks.push({
        label: "Command result",
        status: execution.code === 0 ? "passed" : "blocked",
        detail: execution.timedOut ? `Timed out after ${this.config.SANDBOX_TIMEOUT_MS} ms.` : `Exited with code ${execution.code ?? "unknown"}.`
      });
      return {
        mode: "process-isolated",
        preset,
        status: execution.code === 0 ? "passed" : "failed",
        command,
        durationMs: Date.now() - startedAt,
        checks,
        logs: execution.output.split(/\r?\n/).filter(Boolean).slice(-160),
        disclaimer: "This runner restricts commands, time, files, environment, and output. Untrusted code should run in a separately isolated container or microVM worker."
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
}

function readScripts(content?: string) {
  if (!content) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(content) as { scripts?: unknown };
    if (!parsed.scripts || typeof parsed.scripts !== "object") return {};
    return Object.fromEntries(Object.entries(parsed.scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {} as Record<string, string>;
  }
}

function resolveScript(preset: VerificationPreset, scripts: Record<string, string>) {
  const candidates: Record<VerificationPreset, string[]> = {
    tests: ["test", "test:ci"],
    typecheck: ["typecheck", "check", "lint"],
    build: ["build"]
  };
  return candidates[preset].find((name) => scripts[name]);
}

async function materialize(directory: string, files: RepoFile[]) {
  for (const file of files) {
    const normalized = file.path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) continue;
    const target = path.resolve(directory, normalized);
    if (!target.startsWith(`${path.resolve(directory)}${path.sep}`)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, "utf8");
  }
}

function runProcess(command: string, args: string[], cwd: string, timeoutMs: number) {
  return new Promise<{ code: number | null; timedOut: boolean; output: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: {
        PATH: process.env.PATH,
        Path: process.env.Path,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        HOME: directoryHome(cwd),
        CI: "1",
        CODEMESH_SANDBOX: "1",
        NO_UPDATE_NOTIFIER: "1",
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_update_notifier: "false"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let timedOut = false;
    const append = (chunk: Buffer) => {
      if (output.length < 120_000) output += chunk.toString("utf8").slice(0, 120_000 - output.length);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", reject);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, output });
    });
  });
}

function directoryHome(cwd: string) {
  return path.join(cwd, ".home");
}

