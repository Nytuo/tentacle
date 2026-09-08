import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "@/stores/app-store";
import { useGit } from "@/hooks/use-git";
import * as api from "@/lib/api";

export function useRepoWatcher() {
  const { state, dispatch } = useApp();
  const { refreshAll, refreshDiffs, refreshStatus } = useGit();

  const handlers = useRef({ refreshAll, refreshDiffs, refreshStatus });
  handlers.current = { refreshAll, refreshDiffs, refreshStatus };

  const activeTabId = state.activeTabId;
  const activeRef = useRef(activeTabId);
  activeRef.current = activeTabId;

  const watched = useRef<Set<string>>(new Set());
  useEffect(() => {
    const open = new Set(state.tabs.map((t) => t.id));

    for (const id of open) {
      if (!watched.current.has(id)) {
        watched.current.add(id);
        api.watchRepo(id).catch(() => watched.current.delete(id));
      }
    }
    for (const id of [...watched.current]) {
      if (!open.has(id)) {
        watched.current.delete(id);
        api.unwatchRepo(id).catch(() => undefined);
      }
    }
  }, [state.tabs]);

  useEffect(() => {
    const unlisten = listen<api.RepoChanged>("git://changed", (event) => {
      if (event.payload.repo_path !== activeRef.current) return;

      if (event.payload.scope === "index") {
        void handlers.current.refreshAll();
        void handlers.current.refreshDiffs();
      } else {
        void handlers.current.refreshStatus();
        void handlers.current.refreshDiffs();
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<api.TransferProgress>("git://progress", (event) => {
      const p = event.payload;
      const done = p.total_objects > 0 && p.received_objects >= p.total_objects;
      dispatch({ type: "SET_TRANSFER", payload: done ? null : p });
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [dispatch]);
}
