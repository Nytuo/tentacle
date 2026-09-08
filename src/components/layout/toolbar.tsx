import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  CircleX,
  GitBranch,
  GitMerge,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { confirmThat } from "@/components/ui/prompt-dialog";
import type { MergeStatus } from "@/lib/api";

function MergeStatusPill({
  ms,
  loading,
}: {
  ms: MergeStatus | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-muted text-muted-foreground text-xs font-medium">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        <span>Checking…</span>
      </div>
    );
  }
  if (!ms) return null;

  if (ms.status === "up_to_date" && ms.ahead === 0 && ms.behind === 0) {
    return null;
  }

  const aheadBehind = [
    ms.ahead > 0 ? `↑${ms.ahead}` : "",
    ms.behind > 0 ? `↓${ms.behind}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  let icon: React.ReactNode;
  let label: string;
  let pillCls: string;
  let tooltipText: string;

  switch (ms.status) {
    case "up_to_date":
      icon = <Check className="h-3.5 w-3.5 shrink-0" />;
      label = "Up to date";
      pillCls = "bg-green-500/15 text-green-500 border border-green-500/30";
      tooltipText = `Already in sync with ${ms.target_branch}`;
      break;
    case "fast_forward":
      icon = <GitMerge className="h-3.5 w-3.5 shrink-0" />;
      label = "Clean";
      pillCls = "bg-blue-500/15 text-blue-400 border border-blue-500/30";
      tooltipText = `Fast-forward merge into ${ms.target_branch} — no conflicts`;
      break;
    case "ok":
      icon = <GitMerge className="h-3.5 w-3.5 shrink-0" />;
      label = "Mergeable";
      pillCls = "bg-amber-500/15 text-amber-400 border border-amber-500/30";
      tooltipText = `Can merge into ${ms.target_branch} with a merge commit — no conflicts`;
      break;
    case "conflicts":
      icon = <CircleX className="h-3.5 w-3.5 shrink-0" />;
      label = "Conflicts";
      pillCls =
        "bg-destructive/15 text-destructive border border-destructive/30";
      tooltipText = `Merging into ${ms.target_branch} would produce conflicts`;
      break;
    default:
      return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 h-7 rounded-md text-xs font-medium cursor-default select-none",
            pillCls,
          )}
        >
          {icon}
          <span>{label}</span>
          {aheadBehind && (
            <span className="opacity-70 font-mono text-[10px]">
              {aheadBehind}
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1 text-xs">
          <p>{tooltipText}</p>
          {(ms.ahead > 0 || ms.behind > 0) && (
            <p className="text-muted-foreground">
              {ms.source_branch} is {ms.ahead > 0 ? `${ms.ahead} ahead` : ""}
              {ms.ahead > 0 && ms.behind > 0 ? ", " : ""}
              {ms.behind > 0 ? `${ms.behind} behind` : ""} {ms.target_branch}
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function Toolbar() {
  const {
    tab,
    fetchRemote,
    pushRemote,
    pullRemote,
    refreshAll,
    refreshDiffs,
    checkoutBranch,
    stashChanges,
    popStash,
  } = useGit();

  if (!tab) return null;

  const isLoading = (key: string) => tab.loading[key] ?? false;
  const repoState = tab.repo.state;
  const isMergeChecking = isLoading("merge-check");

  const localBranches = (tab.branches ?? [])
    .filter((b) => !b.is_remote)
    .sort((a, b) => (b.is_head ? 1 : 0) - (a.is_head ? 1 : 0));

  return (
    <div className="h-11 border-b flex items-center px-3 gap-1.5 shrink-0 bg-card">
      <div className="flex items-center gap-1.5">
        {tab.repo.head_branch && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                disabled={isLoading("checkout")}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 h-7 text-xs font-mono font-medium",
                  isLoading("checkout") && "opacity-60",
                )}
              >
                <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>{tab.repo.head_branch}</span>
                <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="min-w-[200px] max-h-80 overflow-y-auto"
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Switch branch
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {localBranches.map((branch) => (
                <DropdownMenuItem
                  key={branch.name}
                  className="flex items-center gap-2 font-mono text-xs"
                  onSelect={() => {
                    if (!branch.is_head) checkoutBranch(branch.name);
                  }}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      branch.is_head ? "opacity-100 text-primary" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{branch.name}</span>
                  {branch.ahead != null && branch.ahead > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      ↑{branch.ahead}
                    </span>
                  )}
                  {branch.behind != null && branch.behind > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      ↓{branch.behind}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
              {localBranches.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  No branches
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <MergeStatusPill
          ms={tab.mergeStatus ?? null}
          loading={isMergeChecking}
        />

        {repoState && repoState !== "clean" && (
          <div className="flex items-center gap-1.5 px-2.5 h-7 rounded-md bg-destructive/15 text-destructive text-xs font-medium">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {repoState}
          </div>
        )}
      </div>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading("fetch")}
              onClick={() => fetchRemote()}
              className={cn(
                "gap-1.5 h-8 text-xs px-2.5",
                isLoading("fetch") && "opacity-60",
              )}
            >
              <ArrowDownToLine
                className={cn(
                  "h-3.5 w-3.5",
                  isLoading("fetch") && "animate-pulse",
                )}
              />
              Fetch
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Fetch from remote</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading("pull")}
              onClick={() => pullRemote()}
              onContextMenu={(e) => {
                e.preventDefault();
                void pullRemote(undefined, true);
              }}
              className="gap-1.5 h-8 text-xs px-2.5"
            >
              <RotateCcw
                className={cn(
                  "h-3.5 w-3.5",
                  isLoading("pull") && "animate-spin",
                )}
              />
              Pull
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Pull from remote</TooltipContent>
        </Tooltip>

        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={isLoading("push")}
                onClick={() => pushRemote()}
                className="gap-1.5 h-8 text-xs pl-2.5 pr-1.5"
              >
                <ArrowUpFromLine
                  className={cn(
                    "h-3.5 w-3.5",
                    isLoading("push") && "animate-pulse",
                  )}
                />
                Push
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Push the current branch
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-5"
                disabled={isLoading("push")}
                aria-label="Push options"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => void pushRemote({ setUpstream: true })}
              >
                Push and set upstream
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => void pushRemote({ pushTags: true })}
              >
                Push with tags
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-xs text-destructive focus:text-destructive"
                onSelect={async () => {
                  const ok = await confirmThat({
                    title: "Force push?",
                    description:
                      "This overwrites the remote branch. Commits only on the remote are lost, " +
                      "and anyone who has pulled it will need to reset.",
                    confirmLabel: "Force push",
                    destructive: true,
                  });
                  if (ok) void pushRemote({ force: true });
                }}
              >
                Force push…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Separator orientation="vertical" className="h-5 mx-0.5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading("stash")}
              onClick={() => stashChanges()}
              className="gap-1.5 h-8 text-xs px-2.5"
            >
              <Archive
                className={cn(
                  "h-3.5 w-3.5",
                  isLoading("stash") && "animate-pulse",
                )}
              />
              Stash
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Stash working changes</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={isLoading("stash") || (tab.stashes?.length ?? 0) === 0}
              onClick={() => popStash()}
              className="gap-1.5 h-8 text-xs px-2.5"
            >
              <ArchiveRestore
                className={cn(
                  "h-3.5 w-3.5",
                  isLoading("stash") && "animate-pulse",
                )}
              />
              Pop
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Pop latest stash</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5 mx-0.5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await refreshAll();
                await refreshDiffs();
              }}
              className="gap-1.5 h-8 text-xs px-2.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Refresh repository</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex-1" />
    </div>
  );
}
