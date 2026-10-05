import { afterEach, describe, expect, it, vi } from "vitest";
import { api, API_URL, jsonBody } from "../apps/web/src/lib/api";

describe("web API session recovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refreshes an expired access token and retries with the rotated CSRF token", async () => {
    const documentState = { cookie: "cm_csrf=old-token" };
    vi.stubGlobal("document", documentState);

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      if (url === `${API_URL}/api/auth/refresh`) {
        expect(headers.get("x-csrf-token")).toBe("old-token");
        documentState.cookie = "cm_csrf=new-token";
        return Response.json({ data: { user: { id: "user-1" } } });
      }

      const importAttempts = fetchMock.mock.calls.filter(([candidate]) => String(candidate).includes("/import/github")).length;
      if (importAttempts === 1) {
        return Response.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
      }

      expect(headers.get("x-csrf-token")).toBe("new-token");
      return Response.json({ data: { files: 4, commitSha: "github-test" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api<{ files: number }>("/api/projects/project-1/import/github", {
      method: "POST",
      body: jsonBody({ url: "https://github.com/example/repository" })
    });

    expect(result.files).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
