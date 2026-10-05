import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { registerSchema } from "@codemesh/shared";
import { JsonStore } from "../../apps/api/src/db/store";

describe("account registration", () => {
  it("normalizes a new account and grants sample-project access", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "codemesh-registration-test-"));
    const filePath = path.join(directory, "state.json");

    try {
      const store = await new JsonStore(filePath).init();
      const input = registerSchema.parse({
        name: "  Kunal Pandey  ",
        email: "  New.CodeMesh.User@GMAIL.COM ",
        password: "CodeMesh123!"
      });
      const user = await store.createUser(input);

      expect(user.name).toBe("Kunal Pandey");
      expect(user.email).toBe("new.codemesh.user@gmail.com");
      expect(store.getRole("project-sample-taskpilot", user.id)).toBe("viewer");
      await expect(store.createUser(input)).rejects.toThrow("already exists");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
