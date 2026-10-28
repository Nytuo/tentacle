import { useEffect } from "react";
import { useGit } from "@/hooks/use-git";
import type { ViewType } from "@/stores/app-store";

export interface Shortcut {
  id: string;
  label: string;
  keys: string;
  group: string;
}

const MOD =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘"
    : "Ctrl+";

export const SHORTCUTS: Shortcut[] = [
  {
    id: "palette",
    label: "Command palette",
    keys: `${MOD}K`,
    group: "General",
  },
  { id: "refresh", label: "Refresh", keys: `${MOD}R`, group: "General" },
  {
    id: "view.graph",
    label: "Go to graph",
    keys: `${MOD}1`,
    group: "Navigate",
  },
  {
    id: "view.changes",
    label: "Go to changes",
    keys: `${MOD}2`,
    group: "Navigate",
  },
  {
    id: "view.branches",
    label: "Go to branches",
    keys: `${MOD}3`,
    group: "Navigate",
  },
  {
    id: "view.reflog",
    label: "Go to reflog",
    keys: `${MOD}4`,
    group: "Navigate",
  },
  {
    id: "commit",
    label: "Commit staged changes",
    keys: `${MOD}Enter`,
    group: "Git",
  },
  { id: "stageAll", label: "Stage everything", keys: `${MOD}⇧A`, group: "Git" },
  { id: "fetch", label: "Fetch", keys: `${MOD}⇧F`, group: "Git" },
  { id: "pull", label: "Pull", keys: `${MOD}⇧P`, group: "Git" },
  { id: "push", label: "Push", keys: `${MOD}⇧U`, group: "Git" },
  { id: "stash", label: "Stash changes", keys: `${MOD}⇧S`, group: "Git" },
];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function useShortcuts() {
  const git = useGit();
  const { dispatch, tab, state } = git;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key.toLowerCase() === "k" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "SET_PALETTE_OPEN", payload: !state.paletteOpen });
        return;
      }
      if (isTyping(e.target)) return;
      if (!tab) return;

      const go = (view: ViewType) => {
        e.preventDefault();
        git.setView(view);
      };

      if (e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case "a":
            e.preventDefault();
            void git.stageAll();
            return;
          case "f":
            e.preventDefault();
            void git.fetchRemote();
            return;
          case "p":
            e.preventDefault();
            void git.pullRemote();
            return;
          case "u":
            e.preventDefault();
            void git.pushRemote();
            return;
          case "s":
            e.preventDefault();
            void git.stashChanges();
            return;
        }
        return;
      }

      switch (e.key) {
        case "1":
          return go("graph");
        case "2":
          return go("changes");
        case "3":
          return go("branches");
        case "4":
          return go("reflog");
        case "r":
          e.preventDefault();
          void git.refreshAll();
          void git.refreshDiffs();
          return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, git, state.paletteOpen, tab]);
}
