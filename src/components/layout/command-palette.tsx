import { useEffect, useMemo, useRef, useState } from "react";
import { useGit } from "@/hooks/use-git";
import { SHORTCUTS } from "@/hooks/use-shortcuts";
import type { ViewType } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import {
  Archive,
  Download,
  FileClock,
  FileText,
  GitBranch,
  GitCommit,
  Layers,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Tag,
  Upload,
} from "lucide-react";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}
export function CommandPalette() {
  const git = useGit();
  const { state, dispatch, tab } = git;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const open = state.paletteOpen;
  const close = () => dispatch({ type: "SET_PALETTE_OPEN", payload: false });

  const commands = useMemo<Command[]>(() => {
    if (!tab) return [];

    const keyFor = (id: string) => SHORTCUTS.find((s) => s.id === id)?.keys;
    const view = (
      id: string,
      label: string,
      v: ViewType,
      icon: Command["icon"],
    ): Command => ({
      id,
      label,
      hint: keyFor(id),
      group: "Navigate",
      icon,
      run: () => git.setView(v),
    });

    const branchCommands: Command[] = tab.branches
      .filter((b) => !b.is_head)
      .slice(0, 40)
      .map((b) => ({
        id: `checkout:${b.name}`,
        label: `Switch to ${b.name}`,
        hint: b.is_remote ? "remote" : undefined,
        group: "Branches",
        icon: GitBranch,
        run: () => void git.checkoutBranch(b.name),
      }));

    return [
      view("view.graph", "Go to graph", "graph", GitCommit),
      view("view.changes", "Go to changes", "changes", FileText),
      view("view.branches", "Go to branches", "branches", GitBranch),
      view("view.reflog", "Go to reflog", "reflog", FileClock),
      view(
        "view.worktrees",
        "Go to worktrees & submodules",
        "worktrees",
        Layers,
      ),
      view("view.ignore", "Edit .gitignore", "ignore", FileText),
      view("view.settings", "Open settings", "settings", Settings),
      {
        id: "fetch",
        label: "Fetch",
        hint: keyFor("fetch"),
        group: "Git",
        icon: Download,
        run: () => void git.fetchRemote(),
      },
      {
        id: "fetchAll",
        label: "Fetch all remotes",
        group: "Git",
        icon: Download,
        run: () => void git.fetchAll(),
      },
      {
        id: "pull",
        label: "Pull",
        hint: keyFor("pull"),
        group: "Git",
        icon: Download,
        run: () => void git.pullRemote(),
      },
      {
        id: "pullRebase",
        label: "Pull (rebase)",
        group: "Git",
        icon: Download,
        run: () => void git.pullRemote(undefined, true),
      },
      {
        id: "push",
        label: "Push",
        hint: keyFor("push"),
        group: "Git",
        icon: Upload,
        run: () => void git.pushRemote(),
      },
      {
        id: "pushUpstream",
        label: "Push and set upstream",
        group: "Git",
        icon: Upload,
        run: () => void git.pushRemote({ setUpstream: true }),
      },
      {
        id: "pushTags",
        label: "Push tags",
        group: "Git",
        icon: Tag,
        run: () => void git.pushRemote({ pushTags: true }),
      },
      {
        id: "stageAll",
        label: "Stage everything",
        hint: keyFor("stageAll"),
        group: "Git",
        icon: FileText,
        run: () => void git.stageAll(),
      },
      {
        id: "stash",
        label: "Stash changes",
        hint: keyFor("stash"),
        group: "Git",
        icon: Archive,
        run: () => void git.stashChanges(),
      },
      {
        id: "popStash",
        label: "Pop latest stash",
        group: "Git",
        icon: Archive,
        run: () => void git.popStash(),
      },
      {
        id: "refresh",
        label: "Refresh",
        hint: keyFor("refresh"),
        group: "General",
        icon: RefreshCw,
        run: () => {
          void git.refreshAll();
          void git.refreshDiffs();
        },
      },
      ...(tab.repo.state !== "clean"
        ? [
            {
              id: "abort",
              label: `Abort ${tab.repo.state}`,
              group: "Git",
              icon: RotateCcw,
              run: () => void git.abortOperation(),
            } satisfies Command,
          ]
        : []),
      ...branchCommands,
    ];
  }, [git, tab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;

    return commands.filter((c) => {
      const label = c.label.toLowerCase();
      if (label.includes(q)) return true;
      let i = 0;
      for (const ch of label) {
        if (ch === q[i]) i++;
        if (i === q.length) return true;
      }
      return false;
    });
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(0);

      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  const runSelected = () => {
    const command = filtered[selected];
    if (!command) return;
    close();
    command.run();
  };

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={close}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-popover shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2 px-3 border-b">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command…"
            className="flex-1 h-11 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runSelected();
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          />
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          )}
          {filtered.map((command, index) => {
            const Icon = command.icon;
            const showGroup = command.group !== lastGroup;
            lastGroup = command.group;
            return (
              <div key={command.id}>
                {showGroup && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {command.group}
                  </div>
                )}
                <button
                  data-index={index}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 h-8 text-sm text-left transition-colors",
                    index === selected
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50",
                  )}
                  onMouseMove={() => setSelected(index)}
                  onClick={runSelected}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{command.label}</span>
                  {command.hint && (
                    <kbd className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">
                      {command.hint}
                    </kbd>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
