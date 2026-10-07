import crypto from "node:crypto";
import { inferLanguage, isRepositoryTextFile } from "@codemesh/code-intelligence";
import type { RepoFile } from "@codemesh/shared";
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
        actions: [{ label: "Re-run CodeMesh", description: "Rebuild the graph review for this commit", identifier: "rerun_codemesh" }]
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
      "user-agent": "CodeMesh GitHub App",
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

