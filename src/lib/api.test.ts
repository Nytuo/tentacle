import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import * as api from "@/lib/api";

const mockInvoke = vi.mocked(invoke);

describe("repository routing", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    api.setActiveRepo(null);
  });

  it("refuses repository commands when no repository is open", async () => {
    await expect(api.getStatus()).rejects.toThrow(/no repository is open/);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("stamps the active repository onto every repository command", async () => {
    api.setActiveRepo("/repos/alpha");
    await api.stageFile("src/a.ts");

    expect(mockInvoke).toHaveBeenCalledWith("stage_file", {
      repoPath: "/repos/alpha",
      filePath: "src/a.ts",
    });
  });

  it("binds the repository at call time, so a later switch cannot redirect it", async () => {
    api.setActiveRepo("/repos/alpha");
    const inFlight = api.getStatus();

    api.setActiveRepo("/repos/beta");
    await inFlight;

    expect(mockInvoke).toHaveBeenCalledWith("get_status", {
      repoPath: "/repos/alpha",
    });
  });

  it("routes tab-scoped commands to the named repository, not the active one", async () => {
    api.setActiveRepo("/repos/alpha");
    await api.closeRepo("/repos/beta");

    expect(mockInvoke).toHaveBeenCalledWith("close_repo", {
      repoPath: "/repos/beta",
    });
  });

  it("sends repository-free commands without a path", async () => {
    api.setActiveRepo(null);
    await api.openRepo("/repos/gamma");

    expect(mockInvoke).toHaveBeenCalledWith("open_repo", {
      path: "/repos/gamma",
    });
  });

  it("keeps secrets out of the repository channel", async () => {
    api.setActiveRepo(null);
    await api.secretHas(api.providerTokenKey("github"));

    expect(mockInvoke).toHaveBeenCalledWith("secret_has", {
      key: "provider:github",
    });
  });
});

describe("keychain key naming", () => {
  it("namespaces provider and host keys apart", () => {
    expect(api.providerTokenKey("github")).toBe("provider:github");
    expect(api.hostTokenKey("github.com")).toBe("git:github.com");
    expect(api.providerTokenKey("github")).not.toBe(api.hostTokenKey("github"));
  });
});

describe("push options", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    api.setActiveRepo("/repos/alpha");
  });

  it("passes force and upstream flags through", async () => {
    await api.pushRemote({ force: true, setUpstream: true });
    expect(mockInvoke).toHaveBeenCalledWith("push_remote", {
      repoPath: "/repos/alpha",
      remoteName: undefined,
      branch: undefined,
      force: true,
      setUpstream: true,
      pushTags: undefined,
    });
  });

  it("defaults to a plain push of the current branch", async () => {
    await api.pushRemote();
    const [, args] = mockInvoke.mock.calls[0];
    expect(args).toMatchObject({ force: undefined, setUpstream: undefined });
  });
});
