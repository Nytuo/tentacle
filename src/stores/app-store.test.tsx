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
  it("starts with outbound provider requests turned off", () => {
    const { result } = renderHook(useStore, { wrapper });
    expect(result.current.state.allowNetwork).toBe(false);
  });

  it("never holds a token, only whether one is saved", () => {
    const { result } = renderHook(useStore, { wrapper });
    act(() =>
      result.current.dispatch({
        type: "SET_PROVIDER_TOKEN_SAVED",
        payload: true,
      }),
    );

    expect(result.current.state.providerTokenSaved).toBe(true);
    expect(Object.keys(result.current.state)).not.toContain("providerToken");
  });
});
