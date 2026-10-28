import { newWorkspace, effectiveRepoSettings } from "@/stores/app-store";
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { AppProvider, useActiveTab, useApp } from "@/stores/app-store";
import type { RepoInfo } from "@/lib/api";
import type { ReactNode } from "react";

function repo(path: string): RepoInfo {
  return {
    path,
    name: path.split("/").pop() ?? path,
    head_branch: "main",
    is_bare: false,
    is_empty: false,
    is_detached: false,
    state: "clean",
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AppProvider>{children}</AppProvider>
);

function useStore() {
  const { state, dispatch } = useApp();
  return { state, dispatch, tab: useActiveTab() };
}

describe("tab management", () => {
  it("opens a tab and makes it active", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() =>
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") }),
    );

    expect(result.current.state.tabs).toHaveLength(1);
    expect(result.current.state.activeTabId).toBe("/a");
    expect(result.current.tab?.repo.name).toBe("a");
  });

  it("focuses an already-open repository rather than duplicating it", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/b") });
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
    });

    expect(result.current.state.tabs.map((t) => t.id)).toEqual(["/a", "/b"]);
    expect(result.current.state.activeTabId).toBe("/a");
  });

  it("moves focus to a neighbour when the active tab closes", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/b") });
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/c") });
      result.current.dispatch({ type: "SET_ACTIVE_TAB", payload: "/b" });
      result.current.dispatch({ type: "CLOSE_TAB", payload: "/b" });
    });

    expect(result.current.state.tabs.map((t) => t.id)).toEqual(["/a", "/c"]);
    expect(result.current.state.activeTabId).toBe("/c");
  });

  it("leaves no active tab once the last one closes", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
      result.current.dispatch({ type: "CLOSE_TAB", payload: "/a" });
    });
    expect(result.current.state.activeTabId).toBeNull();
    expect(result.current.tab).toBeNull();
  });
});

describe("per-tab state isolation", () => {
  it("keeps each repository's data on its own tab", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/b") });
    });

    act(() =>
      result.current.dispatch({
        type: "SET_GRAPH_QUERY",
        payload: { max_count: 500, text: "fix" },
      }),
    );

    const [a, b] = result.current.state.tabs;
    expect(b.graphQuery.text).toBe("fix");
    expect(a.graphQuery.text).toBeUndefined();
  });

  it("addresses UPDATE_TAB by id, not by which tab is focused", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/b") });
      result.current.dispatch({
        type: "UPDATE_TAB",
        tabId: "/a",
        update: { reflog: [], inspectingPath: "src/x.ts" },
      });
    });

    expect(result.current.state.tabs[0].inspectingPath).toBe("src/x.ts");
    expect(result.current.state.tabs[1].inspectingPath).toBeNull();
  });
});

describe("privacy defaults", () => {
  it("starts with provider requests off and repositories remembered", () => {
    const { result } = renderHook(useStore, { wrapper });
    expect(result.current.state.allowNetwork).toBe(false);
    expect(result.current.state.ephemeral).toBe(false);
  });

  it("holds no secret of any kind in application state", () => {
    const { result } = renderHook(useStore, { wrapper });
    const suspicious = Object.keys(result.current.state).filter(k => /token|secret|password/i.test(k));
    expect(suspicious).toEqual([]);
  });
});

describe("workspaces", () => {
  it("records each opened repository in the active workspace", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/b") });
    });
    const [ws] = result.current.state.workspaces;
    expect(ws.repoPaths).toEqual(["/a", "/b"]);
    expect(ws.activeRepo).toBe("/b");
  });

  it("switching empties the tabs and leaves the other workspace's list alone", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
      result.current.dispatch({ type: "CREATE_WORKSPACE", payload: newWorkspace("Other", "other") });
      result.current.dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: "other" });
    });
    expect(result.current.state.tabs).toEqual([]);
    expect(result.current.state.activeWorkspaceId).toBe("other");

    act(() => result.current.dispatch({ type: "ADD_TAB", payload: repo("/z") }));
    const byId = Object.fromEntries(result.current.state.workspaces.map(w => [w.id, w.repoPaths]));
    expect(byId.default).toEqual(["/a"]);
    expect(byId.other).toEqual(["/z"]);
  });

  it("only an explicit close removes a repository from the workspace", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/b") });
      result.current.dispatch({ type: "CLOSE_TAB", payload: "/a" });
    });
    expect(result.current.state.workspaces[0].repoPaths).toEqual(["/b"]);
  });

  it("refuses to delete the last workspace", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => result.current.dispatch({ type: "DELETE_WORKSPACE", payload: "default" }));
    expect(result.current.state.workspaces).toHaveLength(1);
  });

  it("deleting the active workspace moves to another and clears the tabs", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "CREATE_WORKSPACE", payload: newWorkspace("Other", "other") });
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
      result.current.dispatch({ type: "DELETE_WORKSPACE", payload: "default" });
    });
    expect(result.current.state.activeWorkspaceId).toBe("other");
    expect(result.current.state.tabs).toEqual([]);
  });

  it("keeps AI settings per workspace", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "CREATE_WORKSPACE", payload: newWorkspace("Other", "other") });
      result.current.dispatch({
        type: "SET_WORKSPACE_AI",
        payload: { id: "other", ai: { model: "llama3.2" } },
      });
    });
    const byId = Object.fromEntries(result.current.state.workspaces.map(w => [w.id, w.ai.model]));
    expect(byId).toEqual({ default: "", other: "llama3.2" });
  });

  it("closes settings when a view is picked", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "ADD_TAB", payload: repo("/a") });
      result.current.dispatch({ type: "OPEN_SETTINGS", payload: "workspace" });
    });
    expect(result.current.state.settingsOpen).toBe(true);
    expect(result.current.state.settingsSection).toBe("workspace");

    act(() => result.current.dispatch({ type: "SET_ACTIVE_VIEW", payload: "changes" }));
    expect(result.current.state.settingsOpen).toBe(false);
  });
});

describe("effectiveRepoSettings", () => {
  const origin = (url: string) => [{ name: "origin", url, push_url: null }];

  it("fills provider, owner and repository from the origin remote", () => {
    const s = effectiveRepoSettings(undefined, origin("git@github.com:ada/engine.git"));
    expect(s).toMatchObject({
      providerType: "github",
      providerOwner: "ada",
      providerRepo: "engine",
      detected: true,
    });
  });

  it("lets an explicit value win, field by field", () => {
    const s = effectiveRepoSettings(
      { providerType: null, providerOwner: "fork", providerRepo: "", gitlabBaseUrl: "" },
      origin("https://github.com/ada/engine"),
    );
    expect(s).toMatchObject({ providerType: "github", providerOwner: "fork", providerRepo: "engine" });
  });

  it("drops detected owner and repository when the user picks a different forge", () => {
    const s = effectiveRepoSettings(
      { providerType: "gitlab", providerOwner: "", providerRepo: "", gitlabBaseUrl: "" },
      origin("https://github.com/ada/engine"),
    );
    expect(s).toMatchObject({
      providerType: "gitlab",
      providerOwner: "",
      providerRepo: "",
      gitlabBaseUrl: "https://gitlab.com",
      detected: false,
    });
  });

  it("prefers origin over other remotes", () => {
    const s = effectiveRepoSettings(undefined, [
      { name: "upstream", url: "https://github.com/big/project", push_url: null },
      { name: "origin", url: "https://github.com/me/project", push_url: null },
    ]);
    expect(s.providerOwner).toBe("me");
  });

  it("is empty when nothing is configured or detectable", () => {
    expect(effectiveRepoSettings(undefined, []).providerType).toBeNull();
  });
});

describe("workspace ids", () => {
  it("ignores a second workspace with an id already in use", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() => {
      result.current.dispatch({ type: "CREATE_WORKSPACE", payload: newWorkspace("A", "dup") });
      result.current.dispatch({ type: "CREATE_WORKSPACE", payload: newWorkspace("B", "dup") });
    });
    const dups = result.current.state.workspaces.filter(w => w.id === "dup");
    expect(dups).toHaveLength(1);
    expect(dups[0].name).toBe("A");
  });
});
