import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubAppService } from "../../apps/api/src/services/githubApp";
import { loadConfig } from "../../apps/api/src/config";
import type { PatchProposal } from "../../packages/shared/src/index";

afterEach(() => vi.unstubAllGlobals());
describe("Approval-gated GitHub draft publishing", () => {
  const input = () => ({ repository: "example/repo", installationId: 42, base: "main", revision: "a".repeat(40), branch: "codaventra/12345678-1234-1234-1234-123456789abc", publicationId: "12345678-1234-1234-1234-123456789abc", title: "Approved fix", body: "Evidence", assertAllowed: vi.fn(),
    patch: { id: "proposal", projectId: "project", workspaceId: "main", title: "Fix", summary: "Fixture", files: [{ path: "script.ts", baseContent: "before", proposedContent: "after", baseHash: "hash" }], status: "proposed", suggestedVerification: [], executedVerification: [], createdAt: "2026-01-01T00:00:00Z" } as PatchProposal });
  function service() {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    return new GitHubAppService(loadConfig({ GITHUB_PUBLISH_ENABLED: "true", GITHUB_PUBLISH_REPOSITORIES: "example/repo:42", GITHUB_APP_ID: "1", GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "fixture", GITHUB_WEBHOOK_SECRET: "fixture", GITHUB_PRIVATE_KEY_BASE64: Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString("base64") }));
  }
  it("does not publish when disabled or a destination is not allowlisted", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(new GitHubAppService(loadConfig({})).publishDraft(input())).rejects.toThrow("allowlisted"); expect(fetch).not.toHaveBeenCalled();
    expect(service().publicationAllowed("other/repo", 42)).toBe(false);
  });
  it("preserves executable file mode, narrows the installation token and only creates a draft branch/PR", async () => {
    const calls: Array<{ url: string; method: string; body?: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      const suffix = new URL(url).pathname, method = init.method ?? "GET";
      let value: unknown;
      if (suffix.endsWith("access_tokens")) value = { token: "mock-installation-token" };
      else if (suffix.endsWith("/git/ref/heads/main")) value = { object: { sha: "a".repeat(40) } };
      else if (suffix.includes("/contents/")) value = { type: "file", encoding: "base64", content: Buffer.from("before").toString("base64") };
      else if (suffix.endsWith(`/git/commits/${"a".repeat(40)}`)) value = { tree: { sha: "b".repeat(40) } };
      else if (suffix.endsWith(`/git/trees/${"b".repeat(40)}`)) value = { tree: [{ path: "script.ts", type: "blob", mode: "100755", sha: "d".repeat(40) }] };
      else if (suffix.endsWith("/git/trees")) value = { sha: "e".repeat(40) };
      else if (suffix.includes("/git/ref/heads/codaventra")) return new Response("{}", { status: 404 });
      else if (suffix.endsWith("/git/commits")) value = { sha: "c".repeat(40) };
      else if (suffix.endsWith("/git/refs")) value = {};
      else if (suffix.endsWith("/pulls") && method === "GET") value = [];
      else if (suffix.endsWith("/pulls")) value = { html_url: "https://github.com/example/repo/pull/1", number: 1, head: { sha: "c".repeat(40) }, draft: true };
      else throw new Error(`Unexpected mock request ${suffix}`);
      return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
    }));
    expect((await service().publishDraft(input())).number).toBe(1);
    expect(calls.find((call) => call.url.endsWith("access_tokens"))?.body).toEqual({ repositories: ["repo"], permissions: { contents: "write", pull_requests: "write" } });
    expect(calls.find((call) => call.url.endsWith("/git/trees"))?.body.tree[0].mode).toBe("100755");
    expect(calls.find((call) => call.method === "POST" && call.url.endsWith("/pulls"))?.body.draft).toBe(true);
    expect(calls.filter((call) => call.method === "PATCH")).toEqual([]);
  });
  it("refuses an upstream base that changed before publication", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("access_tokens") ? { token: "fixture" } : { object: { sha: "f".repeat(40) } }), { status: 200 })));
    await expect(service().publishDraft(input())).rejects.toThrow("Upstream base moved");
  });
});
