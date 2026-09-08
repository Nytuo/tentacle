import { useCallback } from "react";
import { useActiveTab, useApp } from "@/stores/app-store";
import * as api from "@/lib/api";

export function useGit() {
  const { state, dispatch } = useApp();
  const tab = useActiveTab();

  const setLoading = useCallback(
    (key: string, value: boolean) => {
      dispatch({ type: "SET_LOADING", payload: { key, value } });
    },
    [dispatch],
  );

  const setError = useCallback(
    (error: string | null) => {
      dispatch({ type: "SET_ERROR", payload: error });
    },
    [dispatch],
  );

  const refreshAll = useCallback(async () => {
    const query = tab?.graphQuery ?? { max_count: 500 };
    const [branches, status, graph, stashes, tags, remotes] =
      await Promise.allSettled([
        api.getBranches(),
        api.getStatus(),
        api.getCommitGraph(query),
        api.getStashes(),
        api.getTags(),
        api.getRemotes(),
      ]);

    if (branches.status === "fulfilled") {
      dispatch({ type: "SET_BRANCHES", payload: branches.value });
    }
    if (status.status === "fulfilled") {
      dispatch({ type: "SET_STATUS", payload: status.value });
    }
    if (graph.status === "fulfilled") {
      dispatch({ type: "SET_GRAPH", payload: graph.value });
    }
    if (stashes.status === "fulfilled") {
      dispatch({ type: "SET_STASHES", payload: stashes.value });
    }
    if (tags.status === "fulfilled") {
      dispatch({ type: "SET_TAGS", payload: tags.value });
    }
    if (remotes.status === "fulfilled") {
      dispatch({ type: "SET_REMOTES", payload: remotes.value });
    }

    api
      .checkMergeStatus("")
      .then((ms) => dispatch({ type: "SET_MERGE_STATUS", payload: ms }))
      .catch(() => dispatch({ type: "SET_MERGE_STATUS", payload: null }));
  }, [dispatch, tab?.graphQuery]);

  const refreshDiffs = useCallback(async () => {
    const [working, staged] = await Promise.allSettled([
      api.getWorkingDiff(),
      api.getStagedDiff(),
    ]);
    if (working.status === "fulfilled") {
      dispatch({ type: "SET_WORKING_DIFF", payload: working.value });
    }
    if (staged.status === "fulfilled") {
      dispatch({ type: "SET_STAGED_DIFF", payload: staged.value });
    }
  }, [dispatch]);

  const refreshConflicts = useCallback(async () => {
    const conflicts = await api.getConflictDiff().catch(() => []);
    dispatch({ type: "SET_CONFLICT_FILES", payload: conflicts });
    if (conflicts.length > 0) {
      dispatch({ type: "SET_ACTIVE_VIEW", payload: "merge-tool" });
    }
    return conflicts;
  }, [dispatch]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await api.getStatus();
      dispatch({ type: "SET_STATUS", payload: status });
    } catch {}
  }, [dispatch]);

  const run = useCallback(
    async <T>(
      key: string,
      action: () => Promise<T>,
      after: "all" | "status" | "none" = "all",
    ): Promise<T | undefined> => {
      setLoading(key, true);
      setError(null);
      try {
        const result = await action();

        if (result && typeof result === "object" && "status" in result) {
          const op = result as unknown as api.OpResult;
          dispatch({ type: "SET_LAST_OP", payload: op });
          if (op.status === "conflicts") {
            await refreshAll();
            await refreshDiffs();
            await refreshConflicts();
            return result;
          }
        }

        if (after === "all") {
          await refreshAll();
          await refreshDiffs();
        } else if (after === "status") {
          await refreshStatus();
          await refreshDiffs();
        }
        return result;
      } catch (e) {
        setError(errorText(e));
        return undefined;
      } finally {
        setLoading(key, false);
      }
    },
    [
      dispatch,
      refreshAll,
      refreshConflicts,
      refreshDiffs,
      refreshStatus,
      setError,
      setLoading,
    ],
  );

  const openRepository = useCallback(
    async (path: string) => {
      setLoading("repo", true);
      setError(null);
      try {
        const repo = await api.openRepo(path);
        dispatch({ type: "ADD_TAB", payload: repo });
        return repo;
      } catch (e) {
        setError(errorText(e));
        return undefined;
      } finally {
        setLoading("repo", false);
      }
    },
    [dispatch, setError, setLoading],
  );

  const cloneRepository = useCallback(
    async (url: string, path: string) => {
      setLoading("clone", true);
      setError(null);
      try {
        const repo = await api.cloneRepo(url, path);
        dispatch({ type: "ADD_TAB", payload: repo });
        return repo;
      } catch (e) {
        setError(errorText(e));
        return undefined;
      } finally {
        setLoading("clone", false);
        dispatch({ type: "SET_TRANSFER", payload: null });
      }
    },
    [dispatch, setError, setLoading],
  );

  const createCommit = useCallback(
    (message: string, options?: api.CommitOptions) =>
      run("commit", () => api.createCommit(message, options)),
    [run],
  );

  const amendCommit = useCallback(
    (message?: string) => run("commit", () => api.amendCommit(message)),
    [run],
  );

  const stageFile = useCallback(
    (path: string) => run("stage", () => api.stageFile(path), "status"),
    [run],
  );
  const stageFiles = useCallback(
    (paths: string[]) => run("stage", () => api.stageFiles(paths), "status"),
    [run],
  );
  const unstageFile = useCallback(
    (path: string) => run("stage", () => api.unstageFile(path), "status"),
    [run],
  );
  const unstageFiles = useCallback(
    (paths: string[]) => run("stage", () => api.unstageFiles(paths), "status"),
    [run],
  );
  const stageAll = useCallback(
    () => run("stage", api.stageAll, "status"),
    [run],
  );
  const unstageAll = useCallback(
    () => run("stage", api.unstageAll, "status"),
    [run],
  );
  const discardFile = useCallback(
    (path: string) => run("discard", () => api.discardFile(path), "status"),
    [run],
  );
  const discardAll = useCallback(
    (includeUntracked?: boolean) =>
      run("discard", () => api.discardAll(includeUntracked), "status"),
    [run],
  );

  const stageHunks = useCallback(
    (path: string, selections: api.HunkSelection[]) =>
      run("stage", () => api.stageHunks(path, selections), "status"),
    [run],
  );
  const unstageHunks = useCallback(
    (path: string, selections: api.HunkSelection[]) =>
      run("stage", () => api.unstageHunks(path, selections), "status"),
    [run],
  );
  const discardHunks = useCallback(
    (path: string, selections: api.HunkSelection[]) =>
      run("discard", () => api.discardHunks(path, selections), "status"),
    [run],
  );

  const checkoutBranch = useCallback(
    async (name: string) => {
      const ok = await run("checkout", () => api.checkoutBranch(name));
      if (ok !== undefined) {
        const repo = await api.getRepoInfo().catch(() => null);
        if (repo) dispatch({ type: "SET_REPO", payload: repo });
      }
      return ok;
    },
    [dispatch, run],
  );

  const checkoutCommit = useCallback(
    async (oid: string) => {
      const ok = await run("checkout", () => api.checkoutCommit(oid));
      if (ok !== undefined) {
        const repo = await api.getRepoInfo().catch(() => null);
        if (repo) dispatch({ type: "SET_REPO", payload: repo });
      }
      return ok;
    },
    [dispatch, run],
  );

  const createBranch = useCallback(
    (name: string, startPoint?: string, checkout?: boolean) =>
      run("branch", () => api.createBranch(name, startPoint, checkout)),
    [run],
  );
  const deleteBranch = useCallback(
    (name: string, force?: boolean) =>
      run("branch", () => api.deleteBranch(name, force)),
    [run],
  );
  const renameBranch = useCallback(
    (oldName: string, newName: string) =>
      run("branch", () => api.renameBranch(oldName, newName)),
    [run],
  );
  const setUpstream = useCallback(
    (branch: string, upstream: string | null) =>
      run("branch", () => api.setUpstream(branch, upstream)),
    [run],
  );

  const mergeBranch = useCallback(
    (name: string, noFf?: boolean) =>
      run("merge", () => api.mergeBranch(name, noFf)),
    [run],
  );

  const rebaseOnto = useCallback(
    (ontoBranch: string) => run("rebase", () => api.rebaseOnto(ontoBranch)),
    [run],
  );
  const rebaseInteractive = useCallback(
    (onto: string, steps: api.RebaseStep[]) =>
      run("rebase", () => api.rebaseInteractive(onto, steps)),
    [run],
  );
  const continueRebase = useCallback(
    () => run("rebase", api.continueRebase),
    [run],
  );
  const abortRebase = useCallback(() => run("rebase", api.abortRebase), [run]);
  const cherryPick = useCallback(
    (oid: string) => run("cherry-pick", () => api.cherryPick(oid)),
    [run],
  );
  const revertCommit = useCallback(
    (oid: string) => run("revert", () => api.revertCommit(oid)),
    [run],
  );
  const resetToCommit = useCallback(
    (oid: string, mode: "soft" | "mixed" | "hard") =>
      run("reset", () => api.resetToCommit(oid, mode)),
    [run],
  );

  const abortOperation = useCallback(async () => {
    const result = await run("abort", api.abortOperation);
    dispatch({ type: "SET_CONFLICT_FILES", payload: [] });
    dispatch({ type: "SET_ACTIVE_VIEW", payload: "graph" });
    return result;
  }, [dispatch, run]);

  const fetchRemote = useCallback(
    (remoteName?: string) => run("fetch", () => api.fetchRemote(remoteName)),
    [run],
  );
  const fetchAll = useCallback(() => run("fetch", api.fetchAll), [run]);
  const pushRemote = useCallback(
    (options?: api.PushOptions) => run("push", () => api.pushRemote(options)),
    [run],
  );
  const pullRemote = useCallback(
    (remoteName?: string, rebase?: boolean) =>
      run("pull", () => api.pullRemote(remoteName, rebase)),
    [run],
  );
  const deleteRemoteBranch = useCallback(
    (remoteName: string, branch: string) =>
      run("push", () => api.deleteRemoteBranch(remoteName, branch)),
    [run],
  );

  const createTag = useCallback(
    (name: string, targetOid?: string, message?: string) =>
      run("tag", () => api.createTag(name, targetOid, message)),
    [run],
  );
  const deleteTag = useCallback(
    (name: string) => run("tag", () => api.deleteTag(name)),
    [run],
  );
  const pushTag = useCallback(
    (tag: string, remoteName?: string) =>
      run("push", () => api.pushTag(tag, remoteName)),
    [run],
  );

  const stashChanges = useCallback(
    (message?: string, includeUntracked = true, keepIndex = false) =>
      run("stash", () => api.createStash(message, includeUntracked, keepIndex)),
    [run],
  );
  const applyStash = useCallback(
    (index: number, drop = false) =>
      run("stash", () => api.applyStash(index, drop)),
    [run],
  );
  const popStash = useCallback(
    () => run("stash", () => api.applyStash(0, true)),
    [run],
  );
  const dropStash = useCallback(
    (index: number) => run("stash", () => api.dropStash(index)),
    [run],
  );
  const stashToBranch = useCallback(
    (index: number, branch: string) =>
      run("stash", () => api.stashToBranch(index, branch)),
    [run],
  );

  const resolveConflictFile = useCallback(
    async (filePath: string, resolvedContent: string) => {
      await run(
        "resolve",
        () => api.resolveConflictFile(filePath, resolvedContent),
        "status",
      );
      await refreshConflicts();
    },
    [refreshConflicts, run],
  );

  const resolveConflictWithSide = useCallback(
    async (filePath: string, side: "current" | "incoming" | "base") => {
      await run(
        "resolve",
        () => api.resolveConflictWithSide(filePath, side),
        "status",
      );
      await refreshConflicts();
    },
    [refreshConflicts, run],
  );

  const resolveConflictHunks = useCallback(
    async (filePath: string, choices: string[]) => {
      await run(
        "resolve",
        () => api.resolveConflictHunks(filePath, choices),
        "status",
      );
      await refreshConflicts();
    },
    [refreshConflicts, run],
  );

  const setGraphQuery = useCallback(
    async (query: api.CommitQuery) => {
      dispatch({ type: "SET_GRAPH_QUERY", payload: query });
      try {
        const graph = await api.getCommitGraph(query);
        dispatch({ type: "SET_GRAPH", payload: graph });
      } catch (e) {
        setError(errorText(e));
      }
    },
    [dispatch, setError],
  );

  const selectCommit = useCallback(
    async (oid: string | null) => {
      dispatch({ type: "SET_SELECTED_COMMIT", payload: oid });
      if (!oid) {
        dispatch({ type: "SET_SELECTED_COMMIT_INFO", payload: null });
        dispatch({ type: "SET_COMMIT_DIFF", payload: [] });
        return;
      }
      const [details, diff] = await Promise.allSettled([
        api.getCommitDetails(oid),
        api.getCommitDiff(oid),
      ]);
      if (details.status === "fulfilled") {
        dispatch({ type: "SET_SELECTED_COMMIT_INFO", payload: details.value });
      } else {
        setError(errorText(details.reason));
      }
      dispatch({
        type: "SET_COMMIT_DIFF",
        payload: diff.status === "fulfilled" ? diff.value : [],
      });
    },
    [dispatch, setError],
  );

  const showFileHistory = useCallback(
    async (filePath: string) => {
      dispatch({ type: "SET_INSPECTING_PATH", payload: filePath });
      dispatch({ type: "SET_ACTIVE_VIEW", payload: "history" });
      const history = await api.getFileHistory(filePath).catch((e) => {
        setError(errorText(e));
        return [];
      });
      dispatch({ type: "SET_FILE_HISTORY", payload: history });
    },
    [dispatch, setError],
  );

  const showBlame = useCallback(
    async (filePath: string, oid?: string) => {
      dispatch({ type: "SET_INSPECTING_PATH", payload: filePath });
      dispatch({ type: "SET_ACTIVE_VIEW", payload: "blame" });
      try {
        const blame = await api.getBlame(filePath, oid);
        dispatch({ type: "SET_BLAME", payload: blame });
      } catch (e) {
        dispatch({ type: "SET_BLAME", payload: null });
        setError(errorText(e));
      }
    },
    [dispatch, setError],
  );

  const refreshReflog = useCallback(async () => {
    const entries = await api.getReflog().catch(() => []);
    dispatch({ type: "SET_REFLOG", payload: entries });
  }, [dispatch]);

  const restoreFromReflog = useCallback(
    (oid: string, hard: boolean) =>
      run("reset", () => api.restoreFromReflog(oid, hard)),
    [run],
  );

  const refreshWorktrees = useCallback(async () => {
    const [worktrees, submodules, lfs] = await Promise.all([
      api.getWorktrees().catch(() => []),
      api.getSubmodules().catch(() => []),
      api.getLfsStatus().catch(() => null),
    ]);
    dispatch({ type: "SET_WORKTREES", payload: worktrees });
    dispatch({ type: "SET_SUBMODULES", payload: submodules });
    dispatch({ type: "SET_LFS", payload: lfs });
  }, [dispatch]);

  const addWorktree = useCallback(
    (name: string, path: string, branch?: string) =>
      run("worktree", () => api.addWorktree(name, path, branch), "none"),
    [run],
  );
  const removeWorktree = useCallback(
    (name: string) => run("worktree", () => api.removeWorktree(name), "none"),
    [run],
  );
  const updateSubmodules = useCallback(
    () => run("submodule", () => api.updateSubmodules(true), "none"),
    [run],
  );

  const ignorePath = useCallback(
    (pattern: string) =>
      run("ignore", () => api.addIgnorePattern(pattern), "status"),
    [run],
  );

  const setView = useCallback(
    (view: import("@/stores/app-store").ViewType) => {
      dispatch({ type: "SET_ACTIVE_VIEW", payload: view });
    },
    [dispatch],
  );

  return {
    state,
    tab,
    dispatch,

    openRepository,
    cloneRepository,
    refreshAll,
    refreshDiffs,
    refreshStatus,
    refreshConflicts,

    createCommit,
    amendCommit,
    selectCommit,

    stageFile,
    stageFiles,
    unstageFile,
    unstageFiles,
    stageAll,
    unstageAll,
    discardFile,
    discardAll,
    stageHunks,
    unstageHunks,
    discardHunks,

    checkoutBranch,
    checkoutCommit,
    createBranch,
    deleteBranch,
    renameBranch,
    setUpstream,
    mergeBranch,

    rebaseOnto,
    rebaseInteractive,
    continueRebase,
    abortRebase,
    cherryPick,
    revertCommit,
    resetToCommit,
    abortOperation,

    fetchRemote,
    fetchAll,
    pushRemote,
    pullRemote,
    deleteRemoteBranch,

    createTag,
    deleteTag,
    pushTag,
    stashChanges,
    applyStash,
    popStash,
    dropStash,
    stashToBranch,

    resolveConflictFile,
    resolveConflictWithSide,
    resolveConflictHunks,

    setGraphQuery,
    showFileHistory,
    showBlame,
    refreshReflog,
    restoreFromReflog,
    refreshWorktrees,
    addWorktree,
    removeWorktree,
    updateSubmodules,
    ignorePath,
    setView,
    setError,
    setLoading,
  };
}

export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
