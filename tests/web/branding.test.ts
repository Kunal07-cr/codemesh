import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : /\.(tsx?|css)$/.test(entry.name) ? [file] : [];
  });
}

describe("Codaventra branding", () => {
  it("uses the new name in project metadata, the browser title and the main heading", () => {
    const manifest = JSON.parse(read("package.json"));
    const lock = JSON.parse(read("package-lock.json"));
    expect(manifest.name).toBe("codaventra");
    expect(manifest.description).toContain("Codaventra");
    expect(lock.name).toBe(manifest.name);
    expect(lock.packages[""].name).toBe(manifest.name);
    expect(read("apps/web/index.html")).toContain("<title>Codaventra</title>");
    expect(read("apps/web/src/pages/LandingPage.tsx")).toMatch(/<h1[^>]*>\s*<span>Codaventra<\/span>\s*<\/h1>/);
  });

  it("does not leave old product labels in web source, assistant copy or editor labels", () => {
    for (const file of sourceFiles(path.join(root, "apps/web/src"))) {
      expect(readFileSync(file, "utf8"), path.relative(root, file)).not.toMatch(/\bCodeMesh\b|\bMesh AI\b/);
    }
    expect(read("packages/ai/src/index.ts")).toContain("You are Codaventra, a careful repository assistant.");
    const extension = JSON.parse(read("apps/vscode-extension/package.json"));
    expect(extension.displayName).toBe("Codaventra");
    expect(extension.contributes.commands.every((command: { title: string }) => command.title.startsWith("Codaventra:"))).toBe(true);
  });

  it("preserves existing login, package, storage and integration identifiers", () => {
    expect(JSON.parse(read("apps/web/package.json")).name).toBe("@codemesh/web");
    expect(read("apps/web/src/components/AuthPanel.tsx")).toContain('useState("CodeMesh123!")');
    expect(read("apps/api/src/db/store.ts")).toContain('email: "owner@codemesh.dev"');
    expect(read("apps/web/src/lib/workspaceDrafts.ts")).toContain('"codemesh-draft:v1:"');
    expect(read("apps/web/src/components/RepositoryAssistant.tsx")).toContain("codemesh-assistant:v2:");
    expect(read("apps/web/src/lib/proofLab.ts")).toContain('z.literal("codemesh-proof-v1")');
    expect(read("apps/api/src/services/githubApp.ts")).toContain('name: "CodeMesh repository intelligence"');
    const extension = JSON.parse(read("apps/vscode-extension/package.json"));
    expect(extension.contributes.commands[0].command).toBe("codemesh.openGraph");
    expect(extension.contributes.configuration.properties).toHaveProperty("codemesh.endpoint");
  });
});
