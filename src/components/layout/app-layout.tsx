import { useCallback, useEffect, useRef, useState } from "react";
import { useGit } from "@/hooks/use-git";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WelcomeScreen } from "@/components/repo/welcome-screen";
import { Sidebar } from "@/components/layout/sidebar";
import { Toolbar } from "@/components/layout/toolbar";
import { GraphView } from "@/components/graph/graph-view";
import { ChangesView } from "@/components/commit/changes-view";
import { BranchesView } from "@/components/branches/branches-view";
import { PrView } from "@/components/pr/pr-view";
import { RemotesView } from "@/components/remote/remotes-view";
import { SettingsView } from "@/components/settings/settings-view";
import { MergeToolView } from "@/components/merge/merge-tool-view";
import { HistoryView } from "@/components/history/history-view";
import { BlameView } from "@/components/history/blame-view";
import { ReflogView } from "@/components/history/reflog-view";
import { WorktreesView } from "@/components/worktrees/worktrees-view";
import { IgnoreView } from "@/components/settings/ignore-view";
import { CommandPalette } from "@/components/layout/command-palette";
import { TransferBar } from "@/components/layout/transfer-bar";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useRepoWatcher } from "@/hooks/use-repo-watcher";
import { DiffViewer } from "@/components/diff/diff-viewer";
import { CommitDetailPanel } from "@/components/graph/graph-view";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { ArrowLeft, GitBranch, Moon, Plus, Sun, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { open as openDirectory } from "@tauri-apps/plugin-dialog";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { errorText } from "@/hooks/use-git";

const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 260;

export function AppLayout() {
  const {
    state,
    tab,
    dispatch,
    setError,
    refreshAll,
    refreshDiffs,
    openRepository,
  } = useGit();
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const prevTabId = useRef<string | null>(null);

  useShortcuts();
  useRepoWatcher();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  useEffect(() => {
    api.setActiveRepo(tab?.id ?? null);
  }, [tab?.id]);

  useEffect(() => {
    if (!state.isRestored) return;
    if (!tab) {
      prevTabId.current = null;
      return;
    }
    if (tab.id === prevTabId.current) return;
    prevTabId.current = tab.id;

    (async () => {
      try {
        await refreshAll();
        await refreshDiffs();
      } catch (e) {
        setError(errorText(e));
      }
    })();
  }, [tab?.id, state.isRestored]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = sidebarWidth;

      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = ev.clientX - startX.current;
        setSidebarWidth(
          Math.min(
            SIDEBAR_MAX,
            Math.max(SIDEBAR_MIN, startWidth.current + delta),
          ),
        );
      };
      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [sidebarWidth],
  );

  if (!state.isRestored) {
    return null;
  }

  if (state.tabs.length === 0) {
    return (
      <TooltipProvider>
        <WelcomeScreen />
      </TooltipProvider>
    );
  }

  const activeView = tab?.activeView ?? "graph";

  function renderView() {
    if (!tab) return null;

    if (tab.viewingDiffFile) {
      return (
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel minSize="400px">
            <div className="flex flex-col h-full">
              <div className="h-10 border-b flex items-center px-3 gap-2 shrink-0 bg-card">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                  onClick={() =>
                    dispatch({ type: "SET_VIEWING_DIFF_FILE", payload: null })
                  }
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to commit
                </Button>
                <span className="text-xs font-mono text-muted-foreground truncate">
                  {tab.viewingDiffFile.new_path || tab.viewingDiffFile.old_path}
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                <DiffViewer files={[tab.viewingDiffFile]} />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle />
          <ResizablePanel defaultSize="420px" minSize="280px" maxSize="700px">
            <CommitDetailPanel
              onClose={() =>
                dispatch({ type: "SET_VIEWING_DIFF_FILE", payload: null })
              }
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      );
    }

    switch (activeView) {
      case "graph":
        return <GraphView />;
      case "changes":
        return <ChangesView />;
      case "branches":
        return <BranchesView />;
      case "prs":
        return <PrView />;
      case "remotes":
        return <RemotesView />;
      case "settings":
        return <SettingsView />;
      case "merge-tool":
        return <MergeToolView />;
      case "history":
        return <HistoryView />;
      case "blame":
        return <BlameView />;
      case "reflog":
        return <ReflogView />;
      case "worktrees":
        return <WorktreesView />;
      case "ignore":
        return <IgnoreView />;
      default:
        return <GraphView />;
    }
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        <div
          className="h-9 bg-card border-b flex items-stretch shrink-0 select-none"
          data-tauri-drag-region
        >
          <div
            className="flex items-center gap-2 pl-3 pr-3 shrink-0 border-r"
            data-tauri-drag-region
          >
            <img
              src="/logo.png"
              alt=""
              className="h-5 w-5 object-contain shrink-0"
            />
            <span className="text-xs font-semibold tracking-tight">
              Tentacle
            </span>
          </div>

          <div className="flex items-stretch overflow-x-auto flex-1 min-w-0">
            {state.tabs.map((t) => {
              const isActive = t.id === state.activeTabId;
              return (
                <button
                  key={t.id}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 px-3 text-xs border-r transition-colors cursor-pointer whitespace-nowrap group shrink-0",
                    isActive
                      ? "bg-background text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/40",
                  )}
                  onClick={() =>
                    dispatch({ type: "SET_ACTIVE_TAB", payload: t.id })
                  }
                >
                  {isActive && (
                    <span className="absolute top-0 left-0 right-0 h-0.5 bg-primary rounded-b" />
                  )}
                  <GitBranch
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="max-w-[144px] truncate">{t.repo.name}</span>
                  {t.repo.head_branch && (
                    <span
                      className={cn(
                        "font-mono text-[10px] px-1.5 py-px rounded",
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {t.repo.head_branch}
                    </span>
                  )}
                  <span
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity ml-0.5"
                    onClick={(e) => {
                      e.stopPropagation();

                      api.unwatchRepo(t.id).catch(() => undefined);
                      api.closeRepo(t.id).catch(() => undefined);
                      dispatch({ type: "CLOSE_TAB", payload: t.id });
                    }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
            <div className="flex-1 min-w-8" data-tauri-drag-region />
          </div>

          <div className="flex items-center gap-0.5 px-1.5 shrink-0 border-l">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    dispatch({
                      type: "SET_THEME",
                      payload: state.theme === "dark" ? "light" : "dark",
                    })
                  }
                  aria-label="Toggle theme"
                >
                  {state.theme === "dark" ? (
                    <Sun className="h-3.5 w-3.5" />
                  ) : (
                    <Moon className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Toggle theme</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={async () => {
                    const selected = await openDirectory({
                      directory: true,
                      multiple: false,
                    });
                    if (selected) await openRepository(selected as string);
                  }}
                  aria-label="Open repository"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open a repository</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {tab && <Toolbar />}

        {tab ? (
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div
              className="shrink-0 flex flex-col overflow-hidden border-r bg-card"
              style={{ width: sidebarWidth }}
            >
              <Sidebar />
            </div>

            <div
              className="w-px shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary transition-colors"
              onMouseDown={onDragStart}
            />

            <div className="flex-1 min-w-0 overflow-hidden bg-background">
              {renderView()}
            </div>
          </div>
        ) : (
          <WelcomeScreen />
        )}

        <TransferBar />
        <CommandPalette />

        {state.error && (
          <div className="border-t border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive flex items-center gap-3 shrink-0">
            <span className="flex-1 truncate">{state.error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="shrink-0 gap-1 h-7 text-xs text-destructive hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" /> Dismiss
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
