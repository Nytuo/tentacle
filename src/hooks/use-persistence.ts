import { useEffect, useRef } from "react";
import { load } from "@tauri-apps/plugin-store";
import { useApp } from "@/stores/app-store";
import type { AppState } from "@/stores/app-store";
import * as api from "@/lib/api";

const STORE_FILE = "tentacle-state.json";

/** Data shape persisted to disk */
interface PersistedState {
  /** Repo paths in tab order */
  tabPaths: string[];
  /** Path of the active tab */
  activeTabPath: string | null;
  /** Theme */
  theme: "light" | "dark";
  /** Provider settings */
  providerType: AppState["providerType"];
  providerToken: string;
  providerOwner: string;
  providerRepo: string;
  gitlabBaseUrl: string;
}

/**
 * Persists opened tabs, active tab, theme, and provider settings
 * to disk via tauri-plugin-store. Restores on first mount.
 */
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
        console.log("[persistence] loaded data:", JSON.stringify(data));
        if (!data) {
          console.log("[persistence] no data, starting fresh");
          dispatch({ type: "SET_RESTORED" });
          return;
        }

        
        if (data.theme) {
          dispatch({ type: "SET_THEME_SILENT", payload: data.theme });
        }

        
        if (data.providerType !== undefined) {
          dispatch({
            type: "SET_PROVIDER_SETTINGS",
            payload: {
              providerType: data.providerType,
              providerToken: data.providerToken ?? "",
              providerOwner: data.providerOwner ?? "",
              providerRepo: data.providerRepo ?? "",
              gitlabBaseUrl: data.gitlabBaseUrl ?? "https://gitlab.com",
            },
          });
        }

        
        
        
        
        if (data.tabPaths && data.tabPaths.length > 0) {
          for (const path of data.tabPaths) {
            try {
              console.log("[persistence] opening repo:", path);
              const repo = await api.openRepo(path);
              
              dispatch({ type: "ADD_TAB", payload: repo });
              const tabId = repo.path;

              
              const [branches, status, graph, stashes, tags, remotes] = await Promise.all([
                api.getBranches().catch(() => []),
                api.getStatus().catch(() => null),
                api.getCommitGraph(500).catch(() => null),
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
                tabId,
                update: { branches, status, graph, stashes, tags, remotes, workingDiff, stagedDiff },
              });
            } catch {
              
            }
          }

          
          
          
          if (data.activeTabPath) {
            dispatch({ type: "SET_ACTIVE_TAB", payload: data.activeTabPath });
          }
        }
      } catch {
        
      } finally {
        dispatch({ type: "SET_RESTORED" });
      }
    })();
    
  }, []);

  
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    
    if (!state.isRestored) return;

    const data: PersistedState = {
      tabPaths: state.tabs.map(t => t.id),
      activeTabPath: state.activeTabId,
      theme: state.theme,
      providerType: state.providerType,
      providerToken: state.providerToken,
      providerOwner: state.providerOwner,
      providerRepo: state.providerRepo,
      gitlabBaseUrl: state.gitlabBaseUrl,
    };

    
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const store = await load(STORE_FILE);
        await store.set("state", data);
        await store.save();
        console.log("[persistence] saved:", JSON.stringify(data));
      } catch (e) {
        console.error("[persistence] save error:", e);
      }
    }, 800);
  }, [
    state.isRestored,
    state.tabs, state.activeTabId, state.theme,
    state.providerType, state.providerToken, state.providerOwner,
    state.providerRepo, state.gitlabBaseUrl,
  ]);
}
