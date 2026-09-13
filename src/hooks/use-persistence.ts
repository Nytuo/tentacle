import { useEffect, useRef } from "react";
import { load } from "@tauri-apps/plugin-store";
import {
  useApp, newWorkspace, DEFAULT_AI, DEFAULT_WORKSPACE_ID,
  type Action, type AppState, type RepoSettings, type Workspace,
} from "@/stores/app-store";
import * as api from "@/lib/api";

const STORE_FILE = "tentacle-state.json";

export interface PersistedState {
  version: 2;
  theme: "light" | "dark";
  allowNetwork: boolean;
  ephemeral: boolean;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  repoSettings: Record<string, RepoSettings>;
}

interface PersistedV1 {
  tabPaths?: unknown;
  activeTabPath?: unknown;
  theme?: unknown;
  providerType?: unknown;
  providerOwner?: unknown;
  providerRepo?: unknown;
  gitlabBaseUrl?: unknown;
  allowNetwork?: unknown;
}

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const providerOf = (v: unknown): RepoSettings["providerType"] =>
  v === "github" || v === "gitlab" || v === "bitbucket" ? v : null;

export function migratePersisted(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  if (r.version === 2) {
    const workspaces: Workspace[] = (Array.isArray(r.workspaces) ? r.workspaces : [])
      .filter((w): w is Record<string, unknown> => !!w && typeof w === "object")
      .map(w => ({
        id: str(w.id) || newWorkspace("").id,
        name: str(w.name, "Untitled"),
        repoPaths: strings(w.repoPaths),
        activeRepo: typeof w.activeRepo === "string" ? w.activeRepo : null,
        ai: { ...DEFAULT_AI, ...(w.ai && typeof w.ai === "object" ? (w.ai as object) : {}) },
      }));
    if (workspaces.length === 0) workspaces.push(newWorkspace("Default", DEFAULT_WORKSPACE_ID));

    const activeWorkspaceId = workspaces.some(w => w.id === r.activeWorkspaceId)
      ? (r.activeWorkspaceId as string)
      : workspaces[0].id;

    const repoSettings: Record<string, RepoSettings> = {};
    if (r.repoSettings && typeof r.repoSettings === "object") {
      for (const [path, v] of Object.entries(r.repoSettings as Record<string, unknown>)) {
        if (!v || typeof v !== "object") continue;
        const s = v as Record<string, unknown>;
        repoSettings[path] = {
          providerType: providerOf(s.providerType),
          providerOwner: str(s.providerOwner),
          providerRepo: str(s.providerRepo),
          gitlabBaseUrl: str(s.gitlabBaseUrl),
        };
      }
    }

    return {
      version: 2,
      theme: r.theme === "light" ? "light" : "dark",
      allowNetwork: r.allowNetwork === true,
      ephemeral: r.ephemeral === true,
      workspaces,
      activeWorkspaceId,
      repoSettings,
    };
  }

  const v1 = r as PersistedV1;
  const workspace = newWorkspace("Default", DEFAULT_WORKSPACE_ID);
  workspace.repoPaths = strings(v1.tabPaths);
  workspace.activeRepo = typeof v1.activeTabPath === "string" ? v1.activeTabPath : null;

  const repoSettings: Record<string, RepoSettings> = {};
  const provider = providerOf(v1.providerType);
  if (provider && workspace.activeRepo) {
    repoSettings[workspace.activeRepo] = {
      providerType: provider,
      providerOwner: str(v1.providerOwner),
      providerRepo: str(v1.providerRepo),
      gitlabBaseUrl: str(v1.gitlabBaseUrl),
    };
  }

  return {
    version: 2,
    theme: v1.theme === "light" ? "light" : "dark",
    allowNetwork: v1.allowNetwork === true,
    ephemeral: false,
    workspaces: [workspace],
    activeWorkspaceId: workspace.id,
    repoSettings,
  };
}

export async function rescueLegacyToken(raw: unknown): Promise<void> {
  if (!raw || typeof raw !== "object") return;
  const r = raw as Record<string, unknown>;
  const provider = providerOf(r.providerType);
  const token = r.providerToken;
  if (!provider || typeof token !== "string" || !token) return;
  const key = api.providerTokenKey(provider);
  const exists = await api.secretHas(key).catch(() => true);
  if (!exists) await api.secretSet(key, token).catch(() => undefined);
}

export function toPersisted(state: AppState): PersistedState {
  const strip = state.ephemeral;
  return {
    version: 2,
    theme: state.theme,
    allowNetwork: state.allowNetwork,
    ephemeral: state.ephemeral,
    workspaces: state.workspaces.map(w =>
      strip ? { ...w, repoPaths: [], activeRepo: null } : w,
    ),
    activeWorkspaceId: state.activeWorkspaceId,
    repoSettings: strip ? {} : state.repoSettings,
  };
}

let loadGeneration = 0;

export function cancelWorkspaceLoad() {
  loadGeneration++;
}

export async function openWorkspaceRepos(
  dispatch: React.Dispatch<Action>,
  paths: string[],
  activeRepo: string | null,
) {
  const generation = ++loadGeneration;
  for (const path of paths) {
    if (generation !== loadGeneration) return;
    try {
      const repo = await api.openRepo(path);
      if (generation !== loadGeneration) return;
      dispatch({ type: "ADD_TAB", payload: repo });

      api.setActiveRepo(repo.path);
      const [branches, status, graph, stashes, tags, remotes] = await Promise.all([
        api.getBranches().catch(() => []),
        api.getStatus().catch(() => null),
        api.getCommitGraph({ max_count: 500 }).catch(() => null),
        api.getStashes().catch(() => []),
        api.getTags().catch(() => []),
        api.getRemotes().catch(() => []),
      ]);
      if (generation !== loadGeneration) return;
      dispatch({
        type: "UPDATE_TAB",
        tabId: repo.path,
        update: { branches, status, graph, stashes, tags, remotes },
      });
    } catch {
      // A repository that has moved or whose drive is unmounted just does not
      // open. It stays listed in the workspace for next time.
    }
  }
  if (generation === loadGeneration && activeRepo) {
    dispatch({ type: "SET_ACTIVE_TAB", payload: activeRepo });
  }
}

export function usePersistence() {
  const { state, dispatch } = useApp();
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    (async () => {
      try {
        const store = await load(STORE_FILE);
        const raw = await store.get<unknown>("state");
        await rescueLegacyToken(raw);
        const data = migratePersisted(raw);
        if (!data) return;

        dispatch({
          type: "RESTORE_SETTINGS",
          payload: {
            theme: data.theme,
            allowNetwork: data.allowNetwork,
            ephemeral: data.ephemeral,
            workspaces: data.workspaces,
            activeWorkspaceId: data.activeWorkspaceId,
            repoSettings: data.repoSettings,
          },
        });

        const active = data.workspaces.find(w => w.id === data.activeWorkspaceId);
        if (active) await openWorkspaceRepos(dispatch, active.repoPaths, active.activeRepo);
      } catch {
        // A corrupt or unreadable store must not stop the app from starting.
      } finally {
        dispatch({ type: "SET_RESTORED" });
      }
    })();
  }, [dispatch]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state.isRestored) return;
    const data = toPersisted(state);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const store = await load(STORE_FILE);
        await store.set("state", data);
        await store.save();
      } catch {
        // Failing to persist window state is not worth interrupting the user.
      }
    }, 800);
  }, [
    state.isRestored,
    state.theme,
    state.allowNetwork,
    state.ephemeral,
    state.workspaces,
    state.activeWorkspaceId,
    state.repoSettings,
  ]);
}

export async function readStoredState(): Promise<unknown> {
  try {
    const store = await load(STORE_FILE);
    return (await store.get<unknown>("state")) ?? null;
  } catch {
    return null;
  }
}

export async function purgeStoredState(providers: string[]): Promise<void> {
  try {
    const store = await load(STORE_FILE);
    await store.clear();
    await store.save();
  } catch {
    // Nothing to clear.
  }
  await Promise.all(
    providers.map(p => api.secretDelete(api.providerTokenKey(p)).catch(() => undefined)),
  );
}
