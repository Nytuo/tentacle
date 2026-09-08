import { useEffect } from "react";
import { useGit } from "@/hooks/use-git";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { confirmThat, promptFor } from "@/components/ui/prompt-dialog";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  FolderTree,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

export function WorktreesView() {
  const {
    tab,
    refreshWorktrees,
    addWorktree,
    removeWorktree,
    updateSubmodules,
    openRepository,
  } = useGit();

  useEffect(() => {
    void refreshWorktrees();
  }, [refreshWorktrees]);

  const worktrees = tab?.worktrees ?? [];
  const submodules = tab?.submodules ?? [];
  const lfs = tab?.lfs;

  return (
    <ScrollArea className="h-full">
      <div className="max-w-2xl mx-auto px-5 py-5 space-y-6">
        <section className="space-y-2">
          <header className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold flex-1">Worktrees</h2>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={async () => {
                const name = await promptFor({
                  title: "New worktree",
                  description:
                    "A second checkout of this repository, so you can work on another " +
                    "branch without stashing.",
                  label: "Name",
                  placeholder: "hotfix",
                });
                if (!name) return;
                const path = await promptFor({
                  title: "Worktree location",
                  label: "Path",
                  placeholder: `../${name}`,
                  defaultValue: `../${name}`,
                });
                if (!path) return;
                const branch = await promptFor({
                  title: "Branch to check out",
                  description:
                    "Must be an existing local branch. Leave blank for a detached checkout.",
                  label: "Branch",
                  validate: () => null,
                });
                await addWorktree(name, path, branch || undefined);
                await refreshWorktrees();
              }}
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          </header>

          {worktrees.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              None. The main checkout is not listed as a worktree.
            </p>
          ) : (
            <ul className="space-y-1">
              {worktrees.map((wt) => (
                <li
                  key={wt.name}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">
                        {wt.name}
                      </span>
                      {wt.branch && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] font-mono"
                        >
                          {wt.branch}
                        </Badge>
                      )}
                      {wt.is_locked && (
                        <Badge variant="outline" className="text-[10px]">
                          locked
                        </Badge>
                      )}
                      {wt.is_prunable && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] gap-1"
                        >
                          <AlertTriangle className="h-2.5 w-2.5" /> missing
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {wt.path}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] shrink-0"
                    onClick={() => void openRepository(wt.path)}
                  >
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={async () => {
                      const ok = await confirmThat({
                        title: `Remove worktree ${wt.name}?`,
                        description:
                          "Its directory is deleted. Commits stay in the repository.",
                        confirmLabel: "Remove",
                        destructive: true,
                      });
                      if (!ok) return;
                      await removeWorktree(wt.name);
                      await refreshWorktrees();
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <header className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold flex-1">Submodules</h2>
            {submodules.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={async () => {
                  await updateSubmodules();
                  await refreshWorktrees();
                }}
              >
                <RefreshCw className="h-3 w-3" /> Update all
              </Button>
            )}
          </header>

          {submodules.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This repository has no submodules.
            </p>
          ) : (
            <ul className="space-y-1">
              {submodules.map((sm) => (
                <li
                  key={sm.path}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">
                        {sm.path}
                      </span>
                      {!sm.initialized && (
                        <Badge variant="outline" className="text-[10px]">
                          not initialized
                        </Badge>
                      )}
                      {sm.modified && (
                        <Badge variant="secondary" className="text-[10px]">
                          modified
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {sm.url ?? "no url"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[10px] shrink-0",
                      sm.modified ? "text-amber-500" : "text-muted-foreground",
                    )}
                  >
                    {sm.workdir_oid?.slice(0, 7) ??
                      sm.head_oid?.slice(0, 7) ??
                      "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <header className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold flex-1">Git LFS</h2>
          </header>

          {!lfs ? (
            <p className="text-xs text-muted-foreground">Checking…</p>
          ) : !lfs.enabled ? (
            <p className="text-xs text-muted-foreground">
              This repository does not track anything with LFS.
            </p>
          ) : (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={lfs.installed ? "secondary" : "destructive"}
                  className="text-[10px]"
                >
                  {lfs.installed ? "git-lfs installed" : "git-lfs missing"}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {lfs.tracked_patterns.length} tracked pattern
                  {lfs.tracked_patterns.length === 1 ? "" : "s"}
                </span>
              </div>
              {!lfs.installed && (
                <p className="text-[11px] text-destructive leading-relaxed">
                  This repository stores files with LFS but <code>git-lfs</code>{" "}
                  is not on your PATH. Those files will appear as small pointer
                  text rather than their real contents — install Git LFS before
                  committing changes to them.
                </p>
              )}
              <ul className="text-[11px] font-mono text-muted-foreground space-y-0.5">
                {lfs.tracked_patterns.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}
