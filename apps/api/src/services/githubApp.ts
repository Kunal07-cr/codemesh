import crypto from "node:crypto";
import { inferLanguage, isRepositoryTextFile } from "@codemesh/code-intelligence";
import { safeEngineeringPath, type PatchProposal, type RepoFile } from "@codemesh/shared";
import type { AppConfig } from "../config.js";

type PullRequestFile = {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed" | "copied" | "changed" | "unchanged";
  previous_filename?: string;
  additions: number;
  deletions: number;
  changes: number;
};

export class GitHubAppService {
  constructor(private readonly config: AppConfig) {}

  info() {
    return {
      configured: this.config.githubConfigured,
      appId: this.config.GITHUB_APP_ID ? "configured" : "missing",
      webhookVerification: Boolean(this.config.GITHUB_WEBHOOK_SECRET),
      capabilities: this.config.githubConfigured
        ? ["private repository access", "incremental content sync", "pull request checks", "line annotations"]
        : ["public repository import", "signed webhook support when configured"]
    };
  }

  publicationAllowed(repository: string, installationId: number) {
    return this.config.GITHUB_PUBLISH_ENABLED && this.config.githubConfigured &&
      (this.config.GITHUB_PUBLISH_REPOSITORIES ?? "").split(",").map((entry) => entry.trim().toLowerCase()).includes(`${repository.toLowerCase()}:${installationId}`);
  }

  async publishDraft(input: { repository: string; installationId: number; base: string; revision: string; branch: string; publicationId: string; title: string; patch: PatchProposal; body: string; assertAllowed(): void }) {
    if (!this.publicationAllowed(input.repository, input.installationId) || !/^[\w.-]+\/[\w.-]+$/.test(input.repository) || !/^[a-f0-9]{40}$/.test(input.revision) || !/^codaventra\/[a-f0-9-]{36}$/.test(input.branch)) throw new Error("Publication destination not allowlisted or source identity invalid");
    if (input.patch.files.some((file) => !safeEngineeringPath(file.path) || /^\.github\/workflows\//.test(file.path))) throw new Error("Unsafe publication path; workflow changes require a separate review");
    const appJwt = createAppJwt(this.config.GITHUB_APP_ID!, this.config.GITHUB_PRIVATE_KEY_BASE64!);
    const token = await this.request<{ token: string }>(`/app/installations/${input.installationId}/access_tokens`, appJwt, { method: "POST", body: JSON.stringify({ repositories: [input.repository.split("/")[1]], permissions: { contents: "write", pull_requests: "write" } }) });
    const root = `/repos/${input.repository}`;
    const request = <T = Record<string, unknown>>(suffix: string, init: RequestInit = {}) => { input.assertAllowed(); return this.request<T>(`${root}${suffix}`, token.token, init); };
    const optional = async <T>(suffix: string): Promise<T | null> => {
      input.assertAllowed();
      const response = await fetch(`https://api.github.com${root}${suffix}`, { headers: this.headers(token.token), signal: AbortSignal.timeout(20_000), redirect: "error" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("GitHub publication lookup failed");
      return response.json() as Promise<T>;
    };
    const base = await request<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(input.base)}`);
    if (base.object.sha !== input.revision) throw new Error("Upstream base moved; capture a fresh run before publication");
    const message = `Codaventra reviewed proposal ${input.publicationId}`;
    for (const file of input.patch.files) {
      const current = await request<{ encoding: string; content: string; type: string }>(`/contents/${file.path.split("/").map(encodeURIComponent).join("/")}?ref=${input.revision}`);
      if (current.type !== "file" || current.encoding !== "base64" || Buffer.from(current.content.replace(/\s/g, ""), "base64").toString("utf8") !== file.baseContent) throw new Error("Upstream file differs from reviewed proposal");
    }
    const baseCommit = await request<{ tree: { sha: string } }>(`/git/commits/${input.revision}`);
    type TreeEntry = { path: string; type: string; mode: string; sha: string };
    const trees = new Map<string, TreeEntry[]>();
    async function modeFor(filePath: string) {
      let sha = baseCommit.tree.sha; const parts = filePath.split("/");
      for (let position = 0; position < parts.length; position++) {
        let entries = trees.get(sha);
        if (!entries) { const tree = await request<{ tree: TreeEntry[]; truncated?: boolean }>(`/git/trees/${sha}`); if (tree.truncated) throw new Error("Cannot verify the complete base tree"); entries = tree.tree; trees.set(sha, entries); }
        const entry = entries.find((item) => item.path === parts[position]);
        if (!entry || position < parts.length - 1 && entry.type !== "tree") throw new Error("Base file identity missing");
        if (position === parts.length - 1) { if (entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) throw new Error("Symlink/submodule publication is unsupported"); return entry.mode; }
        sha = entry.sha;
      }
      throw new Error("Invalid file identity");
    }
    const edits = [];
    for (const file of input.patch.files) edits.push({ path: file.path, mode: await modeFor(file.path), type: "blob", content: file.proposedContent });
    const expectedTree = await request<{ sha: string }>("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: edits }) });
    const existing = await optional<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(input.branch)}`);
    let commitSha = existing?.object.sha;
    if (commitSha) {
      const commit = await request<{ message: string; parents: Array<{ sha: string }>; tree: { sha: string } }>(`/git/commits/${commitSha}`);
      if (commit.message !== message || commit.parents.length !== 1 || commit.parents[0]?.sha !== input.revision || commit.tree.sha !== expectedTree.sha) throw new Error("Publication branch identity changed");
      for (const file of input.patch.files) {
        const current = await request<{ content: string; encoding: string }>(`/contents/${file.path.split("/").map(encodeURIComponent).join("/")}?ref=${commitSha}`);
        if (current.encoding !== "base64" || Buffer.from(current.content.replace(/\s/g, ""), "base64").toString("utf8") !== file.proposedContent) throw new Error("Existing branch differs from approved patch");
      }
    } else {
      const created = await request<{ sha: string }>("/git/commits", { method: "POST", body: JSON.stringify({ message, tree: expectedTree.sha, parents: [input.revision] }) });
      commitSha = created.sha;
      const latest = await request<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(input.base)}`);
      if (latest.object.sha !== input.revision) throw new Error("Upstream moved before branch creation");
      await request("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: commitSha }) });
    }
    const pulls = await request<Array<{ html_url: string; number: number; head: { sha: string }; draft: boolean }>>(`/pulls?state=all&head=${encodeURIComponent(`${input.repository.split("/")[0]}:${input.branch}`)}&base=${encodeURIComponent(input.base)}`);
    const pull = pulls[0] ?? await request<{ html_url: string; number: number; head: { sha: string }; draft: boolean }>("/pulls", { method: "POST", body: JSON.stringify({ title: input.title, head: input.branch, base: input.base, body: input.body, draft: true, maintainer_can_modify: false }) });
    if (pull.head.sha !== commitSha || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(pull.html_url)) throw new Error("Unexpected PR identity");
    return { commitSha, url: pull.html_url, number: pull.number };
  }

  async listPullRequestFiles(repository: string, pullNumber: number, installationId: number) {
    const token = await this.getInstallationToken(installationId);
    const files: PullRequestFile[] = [];
    for (let page = 1; page <= 4; page += 1) {
      const response = await this.request<PullRequestFile[]>(
        `/repos/${repository}/pulls/${pullNumber}/files?per_page=100&page=${page}`,
        token
      );
      files.push(...response);
      if (response.length < 100) break;
    }
    return files;
  }

  async fetchChangedFiles(input: {
    projectId: string;
    repository: string;
    commitSha: string;
    installationId: number;
    paths: string[];
  }) {
    const token = await this.getInstallationToken(input.installationId);
    const files: RepoFile[] = [];
    for (const path of [...new Set(input.paths)].slice(0, 150)) {
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const response = await fetch(`https://api.github.com/repos/${input.repository}/contents/${encodedPath}?ref=${encodeURIComponent(input.commitSha)}`, {
        headers: this.headers(token),
        signal: AbortSignal.timeout(15_000)
      });
      if (response.status === 404) continue;
      if (!response.ok) throw new Error(`GitHub content request failed for ${path} (${response.status}).`);
      const payload = await response.json() as { type?: string; encoding?: string; content?: string; size?: number };
      if (payload.type !== "file" || payload.encoding !== "base64" || typeof payload.content !== "string") continue;
      const content = Buffer.from(payload.content.replace(/\s/g, ""), "base64");
      if (!isRepositoryTextFile(path, content.byteLength) || content.includes(0)) continue;
      files.push({
        projectId: input.projectId,
        path: normalizePath(path),
        language: inferLanguage(path),
        size: content.byteLength,
        binary: false,
        sensitive: isSensitivePath(path),
        content: content.toString("utf8"),
        updatedAt: new Date().toISOString()
      });
    }
    return files;
  }

  async createCheckRun(input: {
    repository: string;
    installationId: number;
    headSha: string;
    title: string;
    summary: string;
    conclusion: "success" | "neutral" | "failure" | "action_required";
    annotations: Array<{ path: string; line: number; level: "notice" | "warning" | "failure"; title: string; message: string }>;
  }) {
    const token = await this.getInstallationToken(input.installationId);
    return this.request(`/repos/${input.repository}/check-runs`, token, {
      method: "POST",
      body: JSON.stringify({
        // Existing branch protections may require this exact check context.
        name: "CodeMesh repository intelligence",
        head_sha: input.headSha,
        status: "completed",
        conclusion: input.conclusion,
        completed_at: new Date().toISOString(),
        output: {
          title: input.title,
          summary: input.summary.slice(0, 65_535),
          annotations: input.annotations.slice(0, 50).map((annotation) => ({
            path: annotation.path,
            start_line: Math.max(1, annotation.line),
            end_line: Math.max(1, annotation.line),
            annotation_level: annotation.level,
            title: annotation.title.slice(0, 255),
            message: annotation.message.slice(0, 65_535)
          }))
        },
        actions: [{ label: "Re-run Codaventra", description: "Rebuild the graph review for this commit", identifier: "rerun_codemesh" }]
      })
    });
  }

  private async getInstallationToken(installationId: number) {
    if (!this.config.githubConfigured || !this.config.GITHUB_APP_ID || !this.config.GITHUB_PRIVATE_KEY_BASE64) {
      throw new Error("GitHub App credentials are not configured.");
    }
    const jwt = createAppJwt(this.config.GITHUB_APP_ID, this.config.GITHUB_PRIVATE_KEY_BASE64);
    const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: this.headers(jwt),
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) throw new Error(`GitHub installation token request failed (${response.status}).`);
    const payload = await response.json() as { token?: string };
    if (!payload.token) throw new Error("GitHub did not return an installation token.");
    return payload.token;
  }

  private request<T = Record<string, unknown>>(apiPath: string, token: string, init: RequestInit = {}) {
    return fetch(`https://api.github.com${apiPath}`, {
      ...init,
      headers: { ...this.headers(token), ...(init.headers ?? {}) },
      signal: init.signal ?? AbortSignal.timeout(20_000)
    }).then(async (response) => {
      if (!response.ok) throw new Error(`GitHub API request failed (${response.status}) for ${apiPath}.`);
      return response.json() as Promise<T>;
    });
  }

  private headers(token: string) {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "Codaventra GitHub App",
      "x-github-api-version": "2022-11-28"
    };
  }
}

export function createAppJwt(appId: string, privateKeyBase64: string, now = Math.floor(Date.now() / 1000)) {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }));
  const unsigned = `${header}.${payload}`;
  const privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf8");
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isSensitivePath(value: string) {
  return /(^|\/)(\.env|\.npmrc|\.pypirc|id_rsa|id_ed25519|credentials)(\.|$|\/)/i.test(value);
}
