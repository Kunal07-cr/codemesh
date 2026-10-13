import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { safeEngineeringPath } from "../packages/shared/src/engineering.js";
const exec = promisify(execFile);
const [directory, revision, repository] = process.argv.slice(2);
if (!directory || !/^[a-f0-9]{40}$/.test(revision ?? "") || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")) throw new Error("Usage: npm run history:export -- <checkout> <40-character commit> <owner/repository>");
const cwd = path.resolve(directory);
const git = (args: string[], maxBuffer = 2_000_000) => exec("git", ["--no-pager", ...args], { cwd, windowsHide: true, timeout: 15_000, maxBuffer, encoding: "buffer" });
const commit = (await git(["rev-parse", `${revision}^{commit}`])).stdout.toString("utf8").trim();
if (commit !== revision) throw new Error("Commit identity mismatch");
const names = (await git(["ls-tree", "-r", "-z", "--name-only", revision!])).stdout.toString("utf8").split("\0").filter(Boolean);
const files: Array<{ path: string; content: string }> = []; let bytes = 0;
for (const name of names) {
  if (!safeEngineeringPath(name)) continue;
  const value = (await git(["show", `${revision}:${name}`], 1_500_000)).stdout;
  if (value.includes(0) || value.byteLength > 250_000 || !Buffer.from(value.toString("utf8"), "utf8").equals(value)) continue;
  bytes += value.byteLength;
  if (bytes > 1_500_000 || files.length >= 2000) throw new Error("Export exceeds source capture limits; choose a smaller repository");
  files.push({ path: name, content: value.toString("utf8") });
}
process.stdout.write(JSON.stringify({ revision, repository, files, complete: false, capturedAt: new Date().toISOString() }));
