import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { commandObservationSchema, safeEngineeringPath, type VerificationBundle, type VerificationResult } from "@codemesh/shared";
import { checkSystemFiles, systemHash } from "./systemAnalysis.js";

export function verificationDockerArgs(name: string, source: string, harness: string, image: string) {
  if (!/^[a-z0-9-]+$/.test(name) || !/^sha256:[a-f0-9]{64}$/.test(image) || [source, harness].some((value) => /[,\r\n]/.test(value))) throw new Error("Invalid container identity or mount");
  return ["run", "--rm", "--pull=never", "--name", name, "--interactive", "--network=none", "--read-only", "--user=65534:65534", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--pids-limit=64", "--memory=512m", "--memory-swap=512m", "--cpus=1", "--log-driver=none", "--ulimit=nofile=256:256", "--tmpfs=/tmp:rw,noexec,nosuid,size=32m", "--tmpfs=/work:rw,nosuid,size=128m,mode=1777", "--mount", `type=bind,src=${source},dst=/source,readonly`, "--mount", `type=bind,src=${harness},dst=/verify/harness.mjs,readonly`, "--entrypoint=node", image, "/verify/harness.mjs"];
}
async function docker(args: string[], input: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<{ output: string; code: number | null; capped: boolean }>((resolve, reject) => {
    const child = spawn("docker", args, { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = []; let bytes = 0, capped = false;
    const append = (chunk: Buffer) => { bytes += chunk.length; if (bytes > 40_000) { capped = true; child.kill(); } else chunks.push(chunk); };
    const abort = () => child.kill(); signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", append); child.stderr.on("data", append); child.stdin.on("error", () => undefined);
    child.once("error", (error) => { signal.removeEventListener("abort", abort); reject(error); });
    child.once("close", (code) => { signal.removeEventListener("abort", abort); resolve({ output: Buffer.concat(chunks).toString("utf8"), code, capped }); });
    child.stdin.end(input);
  });
}
export async function runVerificationContainers(bundle: VerificationBundle, image: string, harness: string, signal: AbortSignal): Promise<VerificationResult> {
  checkSystemFiles(bundle.files);
  const edits = new Map(bundle.edits.map((edit) => [edit.path, edit]));
  if (edits.size !== bundle.edits.length || bundle.edits.some((edit) => bundle.files.find((file) => file.path === edit.path)?.content !== edit.before) || new Set(bundle.stages).size !== bundle.stages.length) throw new Error("Verification source/edits do not match");
  const baseline: VerificationResult["baseline"] = [], proposed: VerificationResult["proposed"] = [];
  for (const variant of ["baseline", "proposed"] as const) for (const stage of bundle.stages) {
    signal.throwIfAborted();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codaventra-verify-")), name = `codaventra-verify-${randomUUID()}`;
    const deadline = AbortSignal.timeout(35_000), currentSignal = AbortSignal.any([deadline, signal]);
    const fallback = { stage, command: `npm run ${stage}`, status: "NOT_RUN" as const, exitCode: null, durationMs: 0, output: "", detail: "Container interrupted, exceeded limits or returned no valid observation" };
    try {
      await fs.chmod(directory, 0o755);
      for (const file of bundle.files) {
        if (!safeEngineeringPath(file.path)) throw new Error("Unsafe source path");
        const target = path.resolve(directory, ...file.path.split("/"));
        if (!target.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error("Escaping source path");
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
        await fs.writeFile(target, variant === "proposed" ? edits.get(file.path)?.after ?? file.content : file.content, { mode: 0o644 });
      }
      const result = await docker(verificationDockerArgs(name, directory, harness, image), JSON.stringify({ stage }), currentSignal);
      signal.throwIfAborted();
      const parsed = result.code === 0 && !result.capped && !deadline.aborted ? commandObservationSchema.safeParse(JSON.parse(result.output.trim())) : null;
      const observation = parsed?.success && parsed.data.stage === stage && parsed.data.command === fallback.command && (parsed.data.status !== "PASS" || parsed.data.exitCode === 0) ? parsed.data : fallback;
      (variant === "baseline" ? baseline : proposed).push(observation);
    } catch { signal.throwIfAborted(); (variant === "baseline" ? baseline : proposed).push(fallback); }
    finally {
      const cleanup = await docker(["rm", "--force", name], "", AbortSignal.timeout(8000)).catch(() => null);
      // These paths are mkdtemp-owned on the dedicated worker, never user-selected.
      if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("codaventra-verify-")) throw new Error("Unexpected cleanup target");
      await fs.rm(directory, { recursive: true, force: true });
      if (!cleanup || cleanup.code !== 0 && !cleanup.output.includes("No such container")) { const error = new Error("Container cleanup unconfirmed; operator inspection required"); error.name = "LabContainerCleanupError"; throw error; }
    }
  }
  return { bundleHash: systemHash(bundle), image, baseline, proposed };
}
