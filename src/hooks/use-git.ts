import { useCallback } from "react";
import { useApp, useActiveTab } from "@/stores/app-store";
import type { RepoTab } from "@/stores/app-store";
import * as api from "@/lib/api";

export function useGit() {
  const { state, dispatch } = useApp();
  const tab = useActiveTab();

  const setLoading = useCallback((key: string, value: boolean) => {
    dispatch({ type: "SET_LOADING", payload: { key, value } });
  }, [dispatch]);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: "SET_ERROR", payload: error });
  }, [dispatch]);

  const refreshAll = useCallback(async () => {
    try {
      const [branches, status, graph, stashes, tags, remotes] = await Promise.all([
        api.getBranches().catch(() => []),
        api.getStatus().catch(() => null),
        api.getCommitGraph(500).catch(() => null),
        api.getStashes().catch(() => []),
        api.getTags().catch(() => []),
        api.getRemotes().catch(() => []),
      ]);
      dispatch({ type: "SET_BRANCHES", payload: branches });
      dispatch({ type: "SET_STATUS", payload: status });
      dispatch({ type: "SET_GRAPH", payload: graph });
      dispatch({ type: "SET_STASHES", payload: stashes });
      dispatch({ type: "SET_TAGS", payload: tags });
      dispatch({ type: "SET_REMOTES", payload: remotes });

      
      api.checkMergeStatus("").then(ms => {
        dispatch({ type: "SET_MERGE_STATUS", payload: ms });
      }).catch(() => {
        dispatch({ type: "SET_MERGE_STATUS", payload: null });
      });
    } catch (e) {
      setError(String(e));
    }
  }, [dispatch, setError]);

  const refreshDiffs = useCallback(async () => {
    try {
      const [working, staged] = await Promise.all([
        api.getWorkingDiff().catch(() => []),
        api.getStagedDiff().catch(() => []),
      ]);
      dispatch({ type: "SET_WORKING_DIFF", payload: working });
      dispatch({ type: "SET_STAGED_DIFF", payload: staged });
    } catch (e) {
      setError(String(e));
    }
  }, [dispatch, setError]);

  const refreshConflicts = useCallback(async () => {
    try {
      const conflicts = await api.getConflictDiff().catch(() => []);
      dispatch({ type: "SET_CONFLICT_FILES", payload: conflicts });
      
      if (conflicts.length > 0) {
        dispatch({ type: "SET_ACTIVE_VIEW", payload: "merge-tool" });
      }
    } catch (e) {
      dispatch({ type: "SET_CONFLICT_FILES", payload: [] });
    }
  }, [dispatch]);

  const openRepository = useCallback(async (path: string) => {
    setLoading("repo", true);
    try {
      const repo = await api.openRepo(path);
      dispatch({ type: "ADD_TAB", payload: repo });
      
      
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading("repo", false);
    }
  }, [dispatch, setError, setLoading]);

  const createCommit = useCallback(async (message: string) => {
    setLoading("commit", true);
    try {
      await api.createCommit(message);
      await refreshAll();
      await refreshDiffs();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading("commit", false);
    }
  }, [refreshAll, refreshDiffs, setError, setLoading]);

  const amendCommit = useCallback(async (message?: string) => {
    setLoading("commit", true);
    try {
      await api.amendCommit(message);
      await refreshAll();
      await refreshDiffs();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading("commit", false);
    }
  }, [refreshAll, refreshDiffs, setError, setLoading]);

  const stageFile = useCallback(async (path: string) => {
    try {
      await api.stageFile(path);
      const status = await api.getStatus();
      dispatch({ type: "SET_STATUS", payload: status });
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
  }, [dispatch, refreshDiffs, setError]);

  const unstageFile = useCallback(async (path: string) => {
    try {
      await api.unstageFile(path);
      const status = await api.getStatus();
      dispatch({ type: "SET_STATUS", payload: status });
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
  }, [dispatch, refreshDiffs, setError]);

  const stageAll = useCallback(async () => {
    try {
      await api.stageAll();
      const status = await api.getStatus();
      dispatch({ type: "SET_STATUS", payload: status });
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
  }, [dispatch, refreshDiffs, setError]);

  const unstageAll = useCallback(async () => {
    try {
      await api.unstageAll();
      const status = await api.getStatus();
      dispatch({ type: "SET_STATUS", payload: status });
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
  }, [dispatch, refreshDiffs, setError]);

  const discardFile = useCallback(async (path: string) => {
    try {
      await api.discardFile(path);
      const status = await api.getStatus();
      dispatch({ type: "SET_STATUS", payload: status });
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
  }, [dispatch, refreshDiffs, setError]);

  const checkoutBranch = useCallback(async (name: string) => {
    setLoading("checkout", true);
    try {
      await api.checkoutBranch(name);
      const repo = await api.getRepoInfo();
      dispatch({ type: "SET_REPO", payload: repo });
      await refreshAll();
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
    finally { setLoading("checkout", false); }
  }, [dispatch, refreshAll, refreshDiffs, setError, setLoading]);

  const mergeBranch = useCallback(async (name: string) => {
    setLoading("merge", true);
    try {
      const result = await api.mergeBranch(name);
      await refreshAll();
      await refreshDiffs();
      
      await refreshConflicts();
      return result;
    } catch (e) { setError(String(e)); return String(e); }
    finally { setLoading("merge", false); }
  }, [refreshAll, refreshDiffs, refreshConflicts, setError, setLoading]);

  const fetchRemote = useCallback(async (remoteName?: string) => {
    setLoading("fetch", true);
    try {
      await api.fetchRemote(remoteName);
      await refreshAll();
    } catch (e) { setError(String(e)); }
    finally { setLoading("fetch", false); }
  }, [refreshAll, setError, setLoading]);

  const pushRemote = useCallback(async (remoteName?: string, branch?: string) => {
    setLoading("push", true);
    try {
      await api.pushRemote(remoteName, branch);
      await refreshAll();
    } catch (e) { setError(String(e)); }
    finally { setLoading("push", false); }
  }, [refreshAll, setError, setLoading]);

  const pullRemote = useCallback(async (remoteName?: string) => {
    setLoading("pull", true);
    try {
      await api.pullRemote(remoteName);
      await refreshAll();
      await refreshDiffs();
      
      await refreshConflicts();
    } catch (e) { setError(String(e)); }
    finally { setLoading("pull", false); }
  }, [refreshAll, refreshDiffs, refreshConflicts, setError, setLoading]);

  const checkoutCommit = useCallback(async (oid: string) => {
    setLoading("checkout", true);
    try {
      await api.checkoutCommit(oid);
      const repo = await api.getRepoInfo();
      dispatch({ type: "SET_REPO", payload: repo });
      await refreshAll();
    } catch (e) { setError(String(e)); }
    finally { setLoading("checkout", false); }
  }, [dispatch, refreshAll, setError, setLoading]);

  const cherryPick = useCallback(async (oid: string) => {
    setLoading("cherry-pick", true);
    try {
      await api.cherryPick(oid);
      await refreshAll();
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
    finally { setLoading("cherry-pick", false); }
  }, [refreshAll, refreshDiffs, setError, setLoading]);

  const revertCommit = useCallback(async (oid: string) => {
    setLoading("revert", true);
    try {
      await api.revertCommit(oid);
      await refreshAll();
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
    finally { setLoading("revert", false); }
  }, [refreshAll, refreshDiffs, setError, setLoading]);

  const resetToCommit = useCallback(async (oid: string, mode: "soft" | "mixed" | "hard") => {
    setLoading("reset", true);
    try {
      await api.resetToCommit(oid, mode);
      await refreshAll();
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
    finally { setLoading("reset", false); }
  }, [refreshAll, refreshDiffs, setError, setLoading]);

  const createTag = useCallback(async (name: string, targetOid?: string, message?: string) => {
    try {
      await api.createTag(name, message, targetOid);
      await refreshAll();
    } catch (e) { setError(String(e)); }
  }, [refreshAll, setError]);

  const createBranch = useCallback(async (name: string, startPoint?: string) => {
    try {
      await api.createBranch(name, startPoint);
      await refreshAll();
    } catch (e) { setError(String(e)); }
  }, [refreshAll, setError]);

  const resolveConflictFile = useCallback(async (filePath: string, resolvedContent: string) => {
    try {
      await api.resolveConflictFile(filePath, resolvedContent);
      await refreshConflicts();
      await refreshDiffs();
      const status = await api.getStatus();
      dispatch({ type: "SET_STATUS", payload: status });
    } catch (e) { setError(String(e)); }
  }, [dispatch, refreshConflicts, refreshDiffs, setError]);

  const resolveConflictWithSide = useCallback(async (filePath: string, side: "current" | "incoming" | "base") => {
    try {
      await api.resolveConflictWithSide(filePath, side);
      await refreshConflicts();
      await refreshDiffs();
      const status = await api.getStatus();
      dispatch({ type: "SET_STATUS", payload: status });
    } catch (e) { setError(String(e)); }
  }, [dispatch, refreshConflicts, refreshDiffs, setError]);

  const stashChanges = useCallback(async (message?: string) => {
    setLoading("stash", true);
    try {
      await api.createStash(message, true);
      await refreshAll();
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
    finally { setLoading("stash", false); }
  }, [refreshAll, refreshDiffs, setError, setLoading]);

  const popStash = useCallback(async () => {
    setLoading("stash", true);
    try {
      await api.applyStash(0, true);
      await refreshAll();
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
    finally { setLoading("stash", false); }
  }, [refreshAll, refreshDiffs, setError, setLoading]);

  const abortMerge = useCallback(async () => {
    
    setLoading("merge", true);
    try {
      const repo = await api.getRepoInfo();
      
      await api.resetToCommit("HEAD", "hard");
      dispatch({ type: "SET_CONFLICT_FILES", payload: [] });
      dispatch({ type: "SET_ACTIVE_VIEW", payload: "graph" });
      await refreshAll();
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
    finally { setLoading("merge", false); }
  }, [dispatch, refreshAll, refreshDiffs, setError, setLoading]);

  const rebaseOnto = useCallback(async (ontoBranch: string) => {
    setLoading("rebase", true);
    try {
      await api.rebaseOnto(ontoBranch);
      await refreshAll();
      await refreshDiffs();
    } catch (e) { setError(String(e)); }
    finally { setLoading("rebase", false); }
  }, [refreshAll, refreshDiffs, setError, setLoading]);

  const selectCommit = useCallback(async (oid: string | null) => {
    dispatch({ type: "SET_SELECTED_COMMIT", payload: oid });
    if (oid) {
      
      const [detailsResult, diffResult] = await Promise.allSettled([
        api.getCommitDetails(oid),
        api.getCommitDiff(oid),
      ]);
      if (detailsResult.status === "fulfilled") {
        dispatch({ type: "SET_SELECTED_COMMIT_INFO", payload: detailsResult.value });
      } else {
        setError(String(detailsResult.reason));
      }
      if (diffResult.status === "fulfilled") {
        dispatch({ type: "SET_COMMIT_DIFF", payload: diffResult.value });
      } else {
        dispatch({ type: "SET_COMMIT_DIFF", payload: [] });
        
        if (detailsResult.status !== "rejected") {
          setError(String(diffResult.reason));
        }
      }
    } else {
      dispatch({ type: "SET_SELECTED_COMMIT_INFO", payload: null });
      dispatch({ type: "SET_COMMIT_DIFF", payload: [] });
    }
  }, [dispatch, setError]);

  return {
    state,
    tab,
    dispatch,
    openRepository,
    refreshAll,
    refreshDiffs,
    createCommit,
    amendCommit,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    discardFile,
    checkoutBranch,
    checkoutCommit,
    createBranch,
    mergeBranch,
    rebaseOnto,
    cherryPick,
    revertCommit,
    resetToCommit,
    createTag,
    fetchRemote,
    pushRemote,
    pullRemote,
    selectCommit,
    refreshConflicts,
    resolveConflictFile,
    resolveConflictWithSide,
    abortMerge,
    stashChanges,
    popStash,
    setError,
    setLoading,
  };
}
