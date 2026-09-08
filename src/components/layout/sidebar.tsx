import { useState } from "react";
import { useGit } from "@/hooks/use-git";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertTriangle,
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Cloud,
  EyeOff,
  FileClock,
  FileDiff,
  GitBranch,
  GitGraph,
  GitMerge,
  GitPullRequest,
  Globe,
  Layers,
  Settings,
  Tag,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewType } from "@/stores/app-store";
import * as api from "@/lib/api";
import { errorText } from "@/hooks/use-git";

interface NavItem {
  id: ViewType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: "graph", label: "History", icon: GitGraph },
  { id: "changes", label: "Changes", icon: FileDiff },
  { id: "branches", label: "Branches", icon: GitBranch },
  { id: "reflog", label: "Reflog", icon: FileClock },
  { id: "worktrees", label: "Worktrees", icon: Layers },
  { id: "prs", label: "Pull Requests", icon: GitPullRequest },
  { id: "remotes", label: "Remotes", icon: Globe },
  { id: "ignore", label: "Ignore rules", icon: EyeOff },
  { id: "settings", label: "Settings", icon: Settings },
];

const mergeToolItem: NavItem = {
  id: "merge-tool",
  label: "Merge Tool",
  icon: AlertTriangle,
};

function SectionHeader({
  open,
  onToggle,
  icon: Icon,
  label,
  count,
}: {
  open: boolean;
  onToggle: (v: boolean) => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <CollapsibleTrigger
      className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold
                 text-muted-foreground uppercase tracking-widest
                 hover:text-foreground transition-colors cursor-pointer select-none"
      onClick={() => onToggle(!open)}
    >
      {open ? (
        <ChevronDown className="h-3 w-3 shrink-0" />
      ) : (
        <ChevronRight className="h-3 w-3 shrink-0" />
      )}
      <Icon className="h-3 w-3 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && (
        <span className="font-normal normal-case tracking-normal tabular-nums opacity-50 text-[10px]">
          {count}
        </span>
      )}
    </CollapsibleTrigger>
  );
}

export function Sidebar() {
  const {
    tab,
    dispatch,
    checkoutBranch,
    mergeBranch,
    refreshAll,
    setError,
    setGraphQuery,
  } = useGit();

  const solo = (branch: string) => {
    void setGraphQuery({ ...(tab?.graphQuery ?? {}), max_count: 500, branch });
    dispatch({ type: "SET_ACTIVE_VIEW", payload: "graph" });
  };
  const [branchesOpen, setBranchesOpen] = useState(true);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [stashesOpen, setStashesOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  const [remotesOpen, setRemotesOpen] = useState(false);

  if (!tab) return null;

  const changeCount =
    (tab.status?.staged_count ?? 0) +
    (tab.status?.unstaged_count ?? 0) +
    (tab.status?.untracked_count ?? 0);

  const localBranches = tab.branches.filter((b) => !b.is_remote);
  const remoteBranches = tab.branches.filter((b) => b.is_remote);

  const handleDeleteBranch = async (name: string) => {
    try {
      await api.deleteBranch(name);
      await refreshAll();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const handleApplyStash = async (index: number) => {
    try {
      await api.applyStash(index, false);
      await refreshAll();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const handleDropStash = async (index: number) => {
    try {
      await api.dropStash(index);
      await refreshAll();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const handleDeleteTag = async (name: string) => {
    try {
      await api.deleteTag(name);
      await refreshAll();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const conflictCount = tab.conflictFiles?.length ?? 0;
  const allNavItems =
    conflictCount > 0
      ? [navItems[0], navItems[1], mergeToolItem, ...navItems.slice(2)]
      : navItems;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      <nav className="px-1.5 py-1.5 space-y-px shrink-0">
        {allNavItems.map((item) => {
          const Icon = item.icon;
          const active = tab.activeView === item.id;
          const isMergeTool = item.id === "merge-tool";
          return (
            <button
              key={item.id}
              onClick={() =>
                dispatch({ type: "SET_ACTIVE_VIEW", payload: item.id })
              }
              className={cn(
                "w-full flex items-center gap-2.5 px-2.5 h-8 rounded-md text-sm font-medium",
                "transition-colors cursor-pointer",
                active
                  ? isMergeTool
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-accent text-accent-foreground"
                  : isMergeTool
                    ? "text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === "changes" && changeCount > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 px-1.5 text-[10px] font-mono tabular-nums"
                >
                  {changeCount}
                </Badge>
              )}
              {isMergeTool && conflictCount > 0 && (
                <Badge className="h-5 min-w-5 px-1.5 text-[10px] font-mono tabular-nums bg-amber-500/20 text-amber-400 hover:bg-amber-500/20">
                  {conflictCount}
                </Badge>
              )}
              {item.id === "prs" && tab.pullRequests.length > 0 && (
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 px-1.5 text-[10px] font-mono tabular-nums"
                >
                  {tab.pullRequests.length}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>

      <div className="h-px bg-border mx-1.5 my-0.5 shrink-0" />

      <ScrollArea className="flex-1 min-h-0">
        <div className="px-1.5 py-1 space-y-px">
          <Collapsible open={branchesOpen} onOpenChange={setBranchesOpen}>
            <SectionHeader
              open={branchesOpen}
              onToggle={setBranchesOpen}
              icon={GitBranch}
              label="Local"
              count={localBranches.length}
            />
            <CollapsibleContent>
              {localBranches.map((branch) => (
                <ContextMenu key={branch.name}>
                  <ContextMenuTrigger asChild>
                    <button
                      onDoubleClick={() =>
                        !branch.is_head && checkoutBranch(branch.name)
                      }
                      className={cn(
                        "w-full flex items-center gap-1.5 pl-6 pr-2 h-7 rounded-md text-xs transition-colors cursor-pointer text-left",
                        branch.is_head
                          ? "text-foreground font-medium hover:bg-accent/60"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
                      )}
                    >
                      {branch.is_head ? (
                        <Check className="h-3 w-3 shrink-0 text-primary" />
                      ) : (
                        <span className="w-3 shrink-0" />
                      )}
                      <span className="truncate flex-1 font-mono">
                        {branch.name}
                      </span>
                      <span className="flex gap-0.5 shrink-0">
                        {(branch.ahead ?? 0) > 0 && (
                          <span className="text-[10px] text-green-500 tabular-nums">
                            ↑{branch.ahead}
                          </span>
                        )}
                        {(branch.behind ?? 0) > 0 && (
                          <span className="text-[10px] text-orange-400 tabular-nums">
                            ↓{branch.behind}
                          </span>
                        )}
                      </span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => solo(branch.name)}>
                      <CircleSlash className="h-4 w-4 mr-2" /> Show only this
                      branch
                    </ContextMenuItem>
                    {!branch.is_head && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => checkoutBranch(branch.name)}
                        >
                          <Check className="h-4 w-4 mr-2" /> Checkout
                        </ContextMenuItem>
                        <ContextMenuItem
                          onClick={() => mergeBranch(branch.name)}
                        >
                          <GitMerge className="h-4 w-4 mr-2" /> Merge into
                          current
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          onClick={() => handleDeleteBranch(branch.name)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </CollapsibleContent>
          </Collapsible>

          {remoteBranches.length > 0 && (
            <Collapsible open={remoteOpen} onOpenChange={setRemoteOpen}>
              <SectionHeader
                open={remoteOpen}
                onToggle={setRemoteOpen}
                icon={Globe}
                label="Remote"
                count={remoteBranches.length}
              />
              <CollapsibleContent>
                {remoteBranches.map((b) => (
                  <ContextMenu key={b.name}>
                    <ContextMenuTrigger asChild>
                      <button
                        className="w-full flex items-center gap-1.5 pl-6 pr-2 h-7 rounded-md text-xs font-mono text-muted-foreground truncate hover:bg-accent/60 hover:text-accent-foreground transition-colors text-left"
                        onDoubleClick={() => checkoutBranch(b.name)}
                        title={`${b.name} — double-click to check out a local copy`}
                      >
                        <Cloud className="h-3 w-3 shrink-0 text-sky-400/70" />
                        <span className="truncate flex-1">{b.name}</span>
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onClick={() => solo(b.name)}>
                        <CircleSlash className="h-4 w-4 mr-2" /> Show only this
                        branch
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => checkoutBranch(b.name)}>
                        <Check className="h-4 w-4 mr-2" /> Check out locally
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => mergeBranch(b.name)}>
                        <GitMerge className="h-4 w-4 mr-2" /> Merge into current
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {tab.stashes.length > 0 && (
            <Collapsible open={stashesOpen} onOpenChange={setStashesOpen}>
              <SectionHeader
                open={stashesOpen}
                onToggle={setStashesOpen}
                icon={Archive}
                label="Stashes"
                count={tab.stashes.length}
              />
              <CollapsibleContent>
                {tab.stashes.map((stash) => (
                  <ContextMenu key={stash.index}>
                    <ContextMenuTrigger asChild>
                      <div
                        className="flex items-center pl-6 pr-2 h-7 rounded-md text-xs text-muted-foreground truncate
                                      cursor-default hover:bg-accent/60 hover:text-accent-foreground transition-colors"
                      >
                        {stash.message || `stash@{${stash.index}}`}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={() => handleApplyStash(stash.index)}
                      >
                        Apply
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => handleDropStash(stash.index)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Drop
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {tab.tags.length > 0 && (
            <Collapsible open={tagsOpen} onOpenChange={setTagsOpen}>
              <SectionHeader
                open={tagsOpen}
                onToggle={setTagsOpen}
                icon={Tag}
                label="Tags"
                count={tab.tags.length}
              />
              <CollapsibleContent>
                {tab.tags.map((tag) => (
                  <ContextMenu key={tag.name}>
                    <ContextMenuTrigger asChild>
                      <div
                        className="flex items-center pl-6 pr-2 h-7 rounded-md text-xs font-mono text-muted-foreground truncate
                                      cursor-default hover:bg-accent/60 hover:text-accent-foreground transition-colors"
                      >
                        {tag.name}
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={() => handleDeleteTag(tag.name)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {tab.remotes.length > 0 && (
            <Collapsible open={remotesOpen} onOpenChange={setRemotesOpen}>
              <SectionHeader
                open={remotesOpen}
                onToggle={setRemotesOpen}
                icon={Globe}
                label="Remotes"
                count={tab.remotes.length}
              />
              <CollapsibleContent>
                {tab.remotes.map((remote) => (
                  <div
                    key={remote.name}
                    className="pl-6 pr-2 py-1.5 rounded-md"
                  >
                    <div className="text-xs font-medium text-foreground">
                      {remote.name}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                      {remote.url}
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
