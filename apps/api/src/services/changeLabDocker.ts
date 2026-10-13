import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { labOutcomeSchema, labSafeFilePath, type LabBundle, type LabOutcome, type LabProbe } from "@codemesh/shared";

export function labDockerArgs(name: string, directory: string, harness: string, imageId: string) {
  if (!/^[a-z0-9-]+$/.test(name) || !/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error("Invalid execution identity");
  if ([directory, harness].some((value) => value.includes(",") || value.includes("\n"))) throw new Error("Unsupported mount path");
  return [
    "run", "--rm", "--pull=never", "--name", name, "--interactive", "--network=none", "--read-only",
    "--user=65534:65534", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=32",
    "--memory=256m", "--memory-swap=256m", "--cpus=0.5", "--ulimit=nofile=128:128", "--log-driver=none",
    "--tmpfs=/tmp:rw,noexec,nosuid,size=16m", "--env=HOME=/tmp", "--env=TZ=UTC", "--workdir=/repo",
    "--mount", `type=bind,src=${directory},dst=/repo,readonly`,
    "--mount", `type=bind,src=${harness},dst=/lab/harness.mjs,readonly`,
    imageId, "node", "--no-warnings", "/lab/harness.mjs"
  ];
}

function docker(command: string[], input: string, signal: AbortSignal, maximum = 80_000) {
  return new Promise<{ output: string; code: number | null; exceeded: boolean }>((resolve, reject) => {
    signal.throwIfAborted();
    const child = spawn("docker", command, { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "", bytes = 0, exceeded = false;
    const decoder = new StringDecoder("utf8");
    const append = (chunk: Buffer) => { bytes += chunk.length; if (bytes > maximum) { exceeded = true; child.kill(); } else output += decoder.write(chunk); };
    const abort = () => child.kill();
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", append); child.stderr.on("data", append);
    child.stdin.on("error", () => undefined);
    child.once("error", (error) => { signal.removeEventListener("abort", abort); reject(error); });
    child.once("close", (code) => { signal.removeEventListener("abort", abort); output += decoder.end(); resolve({ output, code, exceeded }); });
    child.stdin.end(input);
  });
}

export async function resolveLabImage(image: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/@:-]{0,250}$/.test(image)) throw new Error("Invalid image name");
  const result = await docker(["image", "inspect", image, "--format", "{{.Id}}"], "", AbortSignal.timeout(8000));
  const id = result.output.trim();
  if (result.code !== 0 || !/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error("Docker engine or pre-pulled lab image unavailable");
  return id;
}

export async function executeLabContainer(files: LabBundle["files"], probe: LabProbe, target: { filePath: string; exportName: string }, imageId: string, harness: string, jobSignal: AbortSignal): Promise<LabOutcome> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-lab-"));
  const name = `codemesh-lab-${randomUUID()}`;
  const started = Date.now(), timer = AbortSignal.timeout(4000), signal = AbortSignal.any([jobSignal, timer]);
  try {
    const paths = new Set<string>();
    for (const file of files) {
      if (!labSafeFilePath(file.path) || paths.has(file.path.toLowerCase())) throw new Error("Unsafe or colliding file path");
      paths.add(file.path.toLowerCase());
      const destination = path.resolve(directory, ...file.path.split("/"));
      if (!destination.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error("Path escaped snapshot");
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
      await fs.writeFile(destination, file.content, { encoding: "utf8", mode: 0o644 });
    }
    await fs.chmod(directory, 0o755);
    const result = await docker(labDockerArgs(name, directory, harness, imageId), JSON.stringify({ ...target, args: probe.args }), signal);
    jobSignal.throwIfAborted();
    if (timer.aborted) return unavailable("timeout", "Probe exceeded the four-second container deadline");
    if (result.exceeded || result.code !== 0) return unavailable("blocked", result.exceeded ? "Container output limit exceeded" : "Container execution failed; no result inferred");
    const line = result.output.split(/\r?\n/).filter((value) => value.startsWith("CODEMESH_LAB_RESULT:")).at(-1);
    if (!line) return unavailable("blocked", "No harness result received");
    const parsed = labOutcomeSchema.safeParse(JSON.parse(line.slice("CODEMESH_LAB_RESULT:".length)));
    if (!parsed.success || parsed.data.events.some((event) => event.filePath !== target.filePath || event.exportName !== target.exportName)) return unavailable("blocked", "Invalid harness result");
    return { ...parsed.data, durationMs: Date.now() - started };
  } catch (error) {
    jobSignal.throwIfAborted();
    return unavailable(timer.aborted ? "timeout" : "blocked", timer.aborted ? "Container deadline exceeded" : "Worker could not execute this module");
  } finally {
    // Remove the container before deleting its mount, including timeout/cancellation paths.
    const cleanup = await docker(["rm", "--force", name], "", AbortSignal.timeout(8000)).catch(() => null);
    await fs.rm(directory, { recursive: true, force: true });
    if (!cleanup || cleanup.code !== 0 && !cleanup.output.includes("No such container")) {
      const error = new Error("Container cleanup could not be confirmed; stop worker execution and inspect the dedicated host");
      error.name = "LabContainerCleanupError"; throw error;
    }
  }
  function unavailable(status: "timeout" | "blocked", error: string): LabOutcome {
    return { status, error, durationMs: Math.min(Date.now() - started, 120_000), events: [{ kind: status, ...target, detail: error, offsetMs: Math.min(Date.now() - started, 120_000) }] };
  }
}
