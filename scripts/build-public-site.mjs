import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const source = path.join(projectRoot, "apps", "web", "dist");
const destination = path.join(projectRoot, "dist");

if (!fs.existsSync(path.join(source, "index.html"))) {
  throw new Error("Build the web workspace before packaging the public site.");
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true, dereference: false });
console.log(`Copied web build to ${destination}`);
