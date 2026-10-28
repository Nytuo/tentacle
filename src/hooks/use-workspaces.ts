import { useCallback } from "react";
import { useApp, useActiveWorkspace, newWorkspace } from "@/stores/app-store";
import { cancelWorkspaceLoad, openWorkspaceRepos } from "@/hooks/use-persistence";
import * as api from "@/lib/api";

export function useWorkspaces() {
  const { state, dispatch } = useApp();
  const active = useActiveWorkspace();

  const releaseTabs = useCallback(() => {
    for (const t of state.tabs) api.closeRepo(t.id).catch(() => undefined);
  }, [state.tabs]);

  const switchTo = useCallback(
    async (id: string) => {
      if (id === state.activeWorkspaceId) return;
      const target = state.workspaces.find(w => w.id === id);
      if (!target) return;
      releaseTabs();
      dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: id });
      await openWorkspaceRepos(dispatch, target.repoPaths, target.activeRepo);
    },
    [dispatch, releaseTabs, state.activeWorkspaceId, state.workspaces],
  );

  const create = useCallback(
    (name: string) => {
      const workspace = newWorkspace(name.trim() || "Untitled");
      cancelWorkspaceLoad();
      releaseTabs();
      dispatch({ type: "CREATE_WORKSPACE", payload: workspace });
      dispatch({ type: "SET_ACTIVE_WORKSPACE", payload: workspace.id });
      return workspace.id;
    },
    [dispatch, releaseTabs],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (trimmed) dispatch({ type: "RENAME_WORKSPACE", payload: { id, name: trimmed } });
    },
    [dispatch],
  );

  const remove = useCallback(
    async (id: string) => {
      if (state.workspaces.length <= 1) return;
      if (id === state.activeWorkspaceId) {
        const next = state.workspaces.find(w => w.id !== id);
        if (next) await switchTo(next.id);
      }
      dispatch({ type: "DELETE_WORKSPACE", payload: id });
    },
    [dispatch, state.activeWorkspaceId, state.workspaces, switchTo],
  );

  return { workspaces: state.workspaces, active, switchTo, create, rename, remove };
}
