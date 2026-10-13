import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { stage } = JSON.parse(input);
if (!["build", "lint", "test"].includes(stage)) throw new Error("Unsupported stage");
const command = `npm run ${stage}`;
const report = (status, exitCode, detail, output = "", durationMs = 0) => console.log(JSON.stringify({ stage, command, status, exitCode, detail, output, durationMs }));
try {
  await fs.cp("/source", "/work/repo", { recursive: true, dereference: false });
  const manifest = JSON.parse(await fs.readFile("/work/repo/package.json", "utf8"));
  if (typeof manifest.scripts?.[stage] !== "string") {
    report("NOT_RUN", null, `No package.json ${stage} script.`);
  } else {
    const dependencies = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    if (dependencies.length) {
      const lock = await fs.readFile("/work/repo/package-lock.json");
      const expected = (await fs.readFile("/opt/codaventra/lock.sha256", "utf8")).trim();
      if (createHash("sha256").update(lock).digest("hex") !== expected) throw new Error("Operator image dependencies do not match the source lockfile");
      await fs.access("/opt/codaventra/node_modules");
      await fs.symlink("/opt/codaventra/node_modules", "/work/repo/node_modules");
    }
    const started = Date.now();
    const child = spawn("npm", ["run", stage], {
      cwd: "/work/repo", shell: false, env: { PATH: process.env.PATH, HOME: "/tmp", CI: "true", NODE_ENV: "test", npm_config_cache: "/tmp/npm-cache", npm_config_update_notifier: "false", npm_config_ignore_scripts: "true" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "", bytes = 0, exceeded = false;
    const append = (chunk) => { bytes += chunk.length; if (bytes > 16_000) { exceeded = true; child.kill("SIGKILL"); } else output += chunk.toString("utf8"); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    report(exceeded ? "NOT_RUN" : code === 0 ? "PASS" : "FAIL", code, exceeded ? "Output cap exceeded" : "Selected npm script exit observed", output, Date.now() - started);
  }
} catch {
  report("NOT_RUN", null, "Source, package manifest, or matching operator-provisioned dependencies unavailable");
}
