import { describe, expect, it } from "vitest";
import { buildGitHubBranchCandidates, parseGitHubRepository } from "../../apps/api/src/routes/projects";

describe("GitHub repository import", () => {
  it("accepts repository, .git, and branch URLs", () => {
    expect(parseGitHubRepository("https://github.com/acme/portal")).toMatchObject({ owner: "acme", name: "portal" });
    expect(parseGitHubRepository("https://github.com/acme/portal.git")).toMatchObject({ owner: "acme", name: "portal" });
    expect(parseGitHubRepository("https://github.com/acme/portal/tree/develop")).toMatchObject({ owner: "acme", name: "portal", branch: "develop" });
    expect(parseGitHubRepository("https://gitlab.com/acme/portal")).toBeNull();
  });

  it("tries the discovered default branch before compatibility fallbacks", () => {
    expect(buildGitHubBranchCandidates(undefined, undefined, "release")).toEqual(["release", "main", "master", "develop", "trunk"]);
    expect(buildGitHubBranchCandidates("feature/mesh", "main", "release")).toEqual(["feature/mesh"]);
  });
});
