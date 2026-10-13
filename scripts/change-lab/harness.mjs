import { pathToFileURL } from "node:url";
import path from "node:path";
import { performance } from "node:perf_hooks";

// This file is mounted read-only. It executes only inside disposable worker containers.
const started = performance.now();
const write = process.stdout.write.bind(process.stdout);
const stringify = JSON.stringify.bind(JSON);
const chunks = []; let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length; chunks.push(Buffer.from(chunk));
  if (size > 40_000) throw new Error("Probe input exceeded its limit");
}
const input = Buffer.concat(chunks).toString("utf8");
const { filePath, exportName, args, root = "/repo" } = JSON.parse(input);
const events = [{ kind: "call", filePath, exportName, detail: stringify(args).slice(0, 4000), offsetMs: 0 }];
const event = (kind, detail) => {
  if (events.length < 30) events.push({ kind, filePath, exportName, detail: detail.slice(0, 4000), offsetMs: performance.now() - started });
};
for (const method of ["log", "info", "warn", "error", "debug"]) {
  console[method] = (...values) => {
    let detail;
    try { detail = values.map((value) => typeof value === "string" ? value : stringify(value)).join(" "); }
    catch { detail = "Unserializable console output"; }
    event("console", detail.slice(0, 1000));
  };
}
let result;
try {
  const module = await import(pathToFileURL(path.resolve(root, filePath)).href);
  if (typeof module[exportName] !== "function") throw new Error("The selected export is not a function");
  let value;
  try { value = await module[exportName](...args); } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    event("throw", message); result = { status: "threw", error: message.slice(0, 4000) };
  }
  if (!result) {
    try {
      const serialized = stringify(value, (_key, item) => {
        if (typeof item === "number" && !Number.isFinite(item) || ["undefined", "bigint", "symbol", "function"].includes(typeof item)) throw new TypeError("Non-JSON result");
        return item;
      });
      if (serialized === undefined || serialized.length > 16_000) throw new TypeError("A JSON-serializable return value of at most 16000 characters is required");
      const normalized = JSON.parse(serialized);
      event("return", serialized); result = { status: "returned", value: normalized };
    } catch {
      const message = "Return value cannot be captured as bounded JSON";
      event("blocked", message); result = { status: "blocked", error: message };
    }
  }
} catch (error) {
  const message = `Module loading failed: ${error instanceof Error ? error.message : String(error)}`;
  event("blocked", message); result = { status: "blocked", error: message.slice(0, 4000) };
}
write(`\nCODEMESH_LAB_RESULT:${stringify({ ...result, durationMs: performance.now() - started, events })}\n`);
process.exit(0);
