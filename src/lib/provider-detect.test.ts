import { describe, expect, it } from "vitest";
import { detectProvider } from "@/lib/provider-detect";

describe("detectProvider", () => {
  it.each([
    ["https://github.com/ada/engine.git", "github", "ada", "engine"],
    ["https://github.com/ada/engine", "github", "ada", "engine"],
    ["https://github.com:443/ada/engine.git", "github", "ada", "engine"],
    ["git@github.com:ada/engine.git", "github", "ada", "engine"],
    ["ssh://git@github.com/ada/engine.git", "github", "ada", "engine"],
    ["https://***@github.com/ada/engine.git", "github", "ada", "engine"],
    ["https://gitlab.com/group/sub/project.git", "gitlab", "group/sub", "project"],
    ["git@gitlab.example.org:team/app.git", "gitlab", "team", "app"],
    ["https://bitbucket.org/ws/repo.git", "bitbucket", "ws", "repo"],
  ])("reads %s", (url, type, owner, repo) => {
    expect(detectProvider(url)).toMatchObject({ providerType: type, owner, repo });
  });

  it("gives a base URL only for GitLab, where it may be self-hosted", () => {
    expect(detectProvider("git@gitlab.example.org:team/app.git")?.baseUrl).toBe(
      "https://gitlab.example.org",
    );
    expect(detectProvider("https://github.com/ada/engine")?.baseUrl).toBe("");
  });

  it.each([
    "/local/path/repo",
    "../relative/repo",
    "C:\\\\repos\\\\x",
    "https://example.com/a/b",
    "https://github.com/onlyowner",
    "",
  ])("ignores %j", url => {
    expect(detectProvider(url)).toBeNull();
  });
});
