import { useEffect, useRef } from "react";
import { load } from "@tauri-apps/plugin-store";
import { useApp } from "@/stores/app-store";
import type { AppState } from "@/stores/app-store";
import * as api from "@/lib/api";

const STORE_FILE = "tentacle-state.json";

interface PersistedState {
  tabPaths: string[];
  activeTabPath: string | null;
  theme: "light" | "dark";
  providerType: AppState["providerType"];
  providerOwner: string;
  providerRepo: string;
  gitlabBaseUrl: string;

  allowNetwork: boolean;
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
        const data = await store.get<PersistedState>("state");
        if (!data) return;

        if (data.theme) {
          dispatch({ type: "SET_THEME_SILENT", payload: data.theme });
        }

        dispatch({
          type: "SET_PROVIDER_SETTINGS",
          payload: {
            providerType: data.providerType ?? null,
            providerOwner: data.providerOwner ?? "",
            providerRepo: data.providerRepo ?? "",
            gitlabBaseUrl: data.gitlabBaseUrl ?? "https://gitlab.com",
            allowNetwork: data.allowNetwork ?? false,
          },
        });

        if (data.providerType) {
          const saved = await api
            .secretHas(api.providerTokenKey(data.providerType))
            .catch(() => false);
          dispatch({ type: "SET_PROVIDER_TOKEN_SAVED", payload: saved });
        }

        for (const path of data.tabPaths ?? []) {
          try {
            const repo = await api.openRepo(path);
            dispatch({ type: "ADD_TAB", payload: repo });

            api.setActiveRepo(repo.path);
            const [branches, status, graph, stashes, tags, remotes] =
              await Promise.all([
                api.getBranches().catch(() => []),
                api.getStatus().catch(() => null),
                api.getCommitGraph({ max_count: 500 }).catch(() => null),
                api.getStashes().catch(() => []),
                api.getTags().catch(() => []),
                api.getRemotes().catch(() => []),
              ]);
            const [workingDiff, stagedDiff] = await Promise.all([
              api.getWorkingDiff().catch(() => []),
              api.getStagedDiff().catch(() => []),
            ]);

            dispatch({
              type: "UPDATE_TAB",
              tabId: repo.path,
              update: {
                branches,
                status,
                graph,
                stashes,
                tags,
                remotes,
                workingDiff,
                stagedDiff,
              },
            });
          } catch {}
        }

        if (data.activeTabPath) {
          dispatch({ type: "SET_ACTIVE_TAB", payload: data.activeTabPath });
        }
      } catch {
      } finally {
        dispatch({ type: "SET_RESTORED" });
      }
    })();
  }, [dispatch]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state.isRestored) return;

    const data: PersistedState = {
      tabPaths: state.tabs.map((t) => t.id),
      activeTabPath: state.activeTabId,
      theme: state.theme,
      providerType: state.providerType,
      providerOwner: state.providerOwner,
      providerRepo: state.providerRepo,
      gitlabBaseUrl: state.gitlabBaseUrl,
      allowNetwork: state.allowNetwork,
    };

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const store = await load(STORE_FILE);
        await store.set("state", data);
        await store.save();
      } catch {}
    }, 800);
  }, [
    state.isRestored,
    state.tabs,
    state.activeTabId,
    state.theme,
    state.providerType,
    state.providerOwner,
    state.providerRepo,
    state.gitlabBaseUrl,
    state.allowNetwork,
  ]);
}

export async function readStoredState(): Promise<PersistedState | null> {
  try {
    const store = await load(STORE_FILE);
    return (await store.get<PersistedState>("state")) ?? null;
  } catch {
    return null;
  }
}

export async function purgeStoredState(providers: string[]): Promise<void> {
  try {
    const store = await load(STORE_FILE);
    await store.clear();
    await store.save();
  } catch {}
  await Promise.all(
    providers.map((p) =>
      api.secretDelete(api.providerTokenKey(p)).catch(() => undefined),
    ),
  );
}
