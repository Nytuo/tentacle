import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { migratePersisted, rescueLegacyToken, toPersisted } from "@/hooks/use-persistence";
import { initialAppState, newWorkspace, type AppState } from "@/stores/app-store";

describe("migratePersisted", () => {
  it("folds the flat v1 tab list into a Default workspace", () => {
    const out = migratePersisted({
      tabPaths: ["/a", "/b"],
      activeTabPath: "/b",
      theme: "light",
      providerType: "github",
      providerOwner: "ada",
      providerRepo: "engine",
      gitlabBaseUrl: "",
      allowNetwork: true,
    })!;
    expect(out.workspaces).toHaveLength(1);
    expect(out.workspaces[0]).toMatchObject({ name: "Default", repoPaths: ["/a", "/b"], activeRepo: "/b" });
    expect(out.theme).toBe("light");
    expect(out.allowNetwork).toBe(true);
    expect(out.repoSettings["/b"]).toMatchObject({ providerType: "github", providerOwner: "ada" });
  });

  it("never carries a v1 plaintext token forward", () => {
    const out = migratePersisted({ providerType: "github", providerToken: "ghp_plaintext" });
    expect(JSON.stringify(out)).not.toContain("ghp_plaintext");
  });

  it("repairs v2: fills AI defaults and a missing active workspace", () => {
    const out = migratePersisted({
      version: 2,
      workspaces: [{ id: "w", name: "Work", repoPaths: ["/a", 7], ai: { model: "m" } }],
      activeWorkspaceId: "gone",
    })!;
    expect(out.activeWorkspaceId).toBe("w");
    expect(out.workspaces[0].repoPaths).toEqual(["/a"]);
    expect(out.workspaces[0].ai).toMatchObject({ enabled: true, model: "m", allowRemote: false });
  });

  it("creates a workspace when a v2 file has none", () => {
    expect(migratePersisted({ version: 2, workspaces: [] })!.workspaces).toHaveLength(1);
  });

  it.each([null, "x", [], 5])("rejects %j", raw => {
    expect(migratePersisted(raw)).toBeNull();
  });
});

describe("toPersisted", () => {
  function stateWith(ephemeral: boolean): AppState {
    const ws = { ...newWorkspace("Client", "w"), repoPaths: ["/secret/client-project"], activeRepo: "/secret/client-project" };
    return {
      ...initialAppState(),
      ephemeral,
      workspaces: [ws],
      activeWorkspaceId: "w",
      repoSettings: {
        "/secret/client-project": { providerType: "github", providerOwner: "c", providerRepo: "p", gitlabBaseUrl: "" },
      },
    };
  }

  it("keeps repository paths off disk in ephemeral mode", () => {
    const written = JSON.stringify(toPersisted(stateWith(true)));
    expect(written).not.toContain("client-project");
    expect(written).toContain("Client");
  });

  it("round-trips through migration unchanged", () => {
    const out = toPersisted(stateWith(false));
    expect(migratePersisted(JSON.parse(JSON.stringify(out)))).toEqual(out);
  });
});

describe("rescueLegacyToken", () => {
  const mockInvoke = vi.mocked(invoke);
  beforeEach(() => mockInvoke.mockReset());

  it("moves a plaintext token from an old settings file into the keychain", async () => {
    mockInvoke.mockImplementation(async cmd => (cmd === "secret_has" ? false : undefined));
    await rescueLegacyToken({ providerType: "github", providerToken: "ghp_old" });
    expect(mockInvoke).toHaveBeenCalledWith("secret_set", { key: "provider:github", value: "ghp_old" });
  });

  it("never overwrites a token saved since", async () => {
    mockInvoke.mockImplementation(async cmd => (cmd === "secret_has" ? true : undefined));
    await rescueLegacyToken({ providerType: "github", providerToken: "ghp_old" });
    expect(mockInvoke).not.toHaveBeenCalledWith("secret_set", expect.anything());
  });

  it("does nothing for a file without a token", async () => {
    await rescueLegacyToken({ version: 2 });
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
