import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { ZIP_UPLOAD_LIMIT_MB } from "@codemesh/shared";
import { extractRepoFiles, ZIP_IMPORT_LIMITS, validateZipArchive } from "../../apps/api/src/services/zipImport";

describe("ZIP validation", () => {
  it("rejects path traversal", () => {
    const archive = Buffer.from(zipSync({ "../evil.ts": strToU8("export const bad = true;") }));
    const result = validateZipArchive(archive);

    expect(result.accepted).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Path traversal/);
  });

  it("accepts a small TypeScript file", () => {
    const archive = Buffer.from(zipSync({ "src/index.ts": strToU8("export const ok = true;") }));
    const result = validateZipArchive(archive);

    expect(result.accepted).toBe(true);
    expect(result.files[0]?.path).toBe("src/index.ts");
  });

  it("enforces the configured compressed upload ceiling before extraction", () => {
    const archive = Buffer.from(zipSync({ "src/index.ts": strToU8("export const ok = true;") }));
    const result = validateZipArchive(archive, { ...ZIP_IMPORT_LIMITS, compressedBytes: archive.byteLength - 1 });

    expect(ZIP_UPLOAD_LIMIT_MB).toBe(100);
    expect(result.accepted).toBe(false);
    expect(result.errors.join(" ")).toMatch(/100 MB/);
  });

  it("skips sensitive files without rejecting the safe repository contents", () => {
    const archive = Buffer.from(
      zipSync({
        ".env": strToU8("REAL_SECRET=hidden"),
        ".env.example": strToU8("REAL_SECRET=replace-me"),
        "src/token.ts": strToU8("export const tokenKind = 'access';"),
        "src/index.ts": strToU8("export const ok = true;")
      })
    );
    const result = validateZipArchive(archive);

    expect(result.accepted).toBe(true);
    expect(result.files.map((file) => file.path)).toEqual([".env.example", "src/token.ts", "src/index.ts"]);
  });

  it("keeps source files across generated-looking folders and larger files", () => {
    const archive = Buffer.from(
      zipSync({
        "dist/generated.js": strToU8("export const generated = true;"),
        "build/server.go": strToU8("package main\n"),
        ".github/workflows/ci.yml": strToU8("name: CI\n"),
        Dockerfile: strToU8("FROM node:24\n"),
        "src/large.ts": strToU8(`export const large = "${"x".repeat(250_000)}";`),
        "node_modules/ignored.js": strToU8("module.exports = false;")
      })
    );
    const result = validateZipArchive(archive);

    expect(result.accepted).toBe(true);
    expect(result.files.map((file) => file.path)).toEqual(expect.arrayContaining([
      "dist/generated.js",
      "build/server.go",
      ".github/workflows/ci.yml",
      "Dockerfile",
      "src/large.ts"
    ]));
    expect(result.files.some((file) => file.path.includes("node_modules"))).toBe(false);
  });

  it("removes the GitHub archive wrapper folder without losing files", () => {
    const archive = Buffer.from(zipSync({
      "sample-main/src/index.ts": strToU8("export const ok = true;"),
      "sample-main/README.md": strToU8("# Sample")
    }));
    const files = extractRepoFiles("project-test", archive, { stripCommonRoot: true });

    expect(files.map((file) => file.path)).toEqual(["src/index.ts", "README.md"]);
  });
});
