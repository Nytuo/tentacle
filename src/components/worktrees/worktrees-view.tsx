import { useEffect, useState } from "react";
import { useGit, errorText } from "@/hooks/use-git";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { confirmThat, promptFor } from "@/components/ui/prompt-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  ExternalLink,
  FolderOpen,
  FolderTree,
  GitBranch,
  Layers,
  Lock,
  Package,
  Plus,
  RefreshCw,
  Trash2,
  Unlock,
  Wrench,
} from "lucide-react";
import * as api from "@/lib/api";

export function WorktreesView() {
  const {
    tab,
    refreshWorktrees,
    addWorktree,
    removeWorktree,
    lockWorktree,
    unlockWorktree,
    pruneWorktrees,
    updateSubmodules,
    addSubmodule,
    initSubmodule,
    syncSubmodule,
    deinitSubmodule,
    openRepository,
    setError,
  } = useGit();

  const [activeTab, setActiveTab] = useState<"worktrees" | "submodules" | "lfs">("worktrees");
  const [addWorktreeOpen, setAddWorktreeOpen] = useState(false);
  const [addSubmoduleOpen, setAddSubmoduleOpen] = useState(false);

  // Add worktree form state
  const [wtName, setWtName] = useState("");
  const [wtPath, setWtPath] = useState("");
  const [wtBranch, setWtBranch] = useState("");
  const [wtCreateNewBranch, setWtCreateNewBranch] = useState(false);

  // Add submodule form state
  const [smUrl, setSmUrl] = useState("");
  const [smPath, setSmPath] = useState("");

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshWorktrees();
  }, [refreshWorktrees]);

  const worktrees = tab?.worktrees ?? [];
  const submodules = tab?.submodules ?? [];
  const lfs = tab?.lfs;
  const localBranches = (tab?.branches ?? []).filter((b) => !b.is_remote);

  const handleOpenAddWorktree = () => {
    const repoBase = tab?.repo.path.split(/[/\\]/).filter(Boolean).pop() ?? "repo";
    const defaultBranch = localBranches.find((b) => !b.is_head)?.name || "";
    const defaultName = defaultBranch ? defaultBranch.replace(/\//g, "-") : "worktree-1";
    setWtName(defaultName);
    setWtBranch(defaultBranch);
    setWtPath(`../${repoBase}-${defaultName}`);
    setWtCreateNewBranch(false);
    setAddWorktreeOpen(true);
  };

  const handleCreateWorktree = async () => {
    if (!wtName.trim() || !wtPath.trim()) return;
    setBusy(true);
    try {
      if (wtCreateNewBranch && wtBranch.trim()) {
        await api.createBranch(wtBranch.trim());
      }
      await addWorktree(wtName.trim(), wtPath.trim(), wtBranch.trim() || undefined);
      await refreshWorktrees();
      setAddWorktreeOpen(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSubmodule = async () => {
    if (!smUrl.trim() || !smPath.trim()) return;
    setBusy(true);
    try {
      await addSubmodule(smUrl.trim(), smPath.trim());
      await refreshWorktrees();
      setSmUrl("");
      setSmPath("");
      setAddSubmoduleOpen(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePrune = async () => {
    try {
      const count = await api.pruneWorktrees();
      await refreshWorktrees();
      if (count > 0) {
        // Successfully pruned
      }
    } catch (e) {
      setError(errorText(e));
    }
  };

  const handleOpenEditor = async (path: string, editor: string) => {
    try {
      await api.openInEditor(path, editor);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/20">
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === "worktrees" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs gap-2 font-medium"
            onClick={() => setActiveTab("worktrees")}
          >
            <FolderTree className="h-3.5 w-3.5 text-primary" />
            Worktrees
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {worktrees.length}
            </Badge>
          </Button>

          <Button
            variant={activeTab === "submodules" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs gap-2 font-medium"
            onClick={() => setActiveTab("submodules")}
          >
            <Layers className="h-3.5 w-3.5 text-primary" />
            Submodules
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {submodules.length}
            </Badge>
          </Button>

          <Button
            variant={activeTab === "lfs" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 text-xs gap-2 font-medium"
            onClick={() => setActiveTab("lfs")}
          >
            <Package className="h-3.5 w-3.5" />
            Git LFS
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "worktrees" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handlePrune}
                title="Prune worktrees with missing working directories"
              >
                <Wrench className="h-3 w-3" /> Prune Stale
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleOpenAddWorktree}
              >
                <Plus className="h-3.5 w-3.5" /> New Worktree
              </Button>
            </>
          )}

          {activeTab === "submodules" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={async () => {
                  await updateSubmodules();
                  await refreshWorktrees();
                }}
              >
                <RefreshCw className="h-3 w-3" /> Update All
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setAddSubmoduleOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Add Submodule
              </Button>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-6">
          {/* WORKTREES VIEW */}
          {activeTab === "worktrees" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Active Git Worktrees
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Check out and run tests on multiple branches simultaneously from independent folders without stashing.
                  </p>
                </div>
              </div>

              {worktrees.length === 0 ? (
                <div className="border border-dashed rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3">
                  <FolderTree className="h-10 w-10 text-muted-foreground/40" />
                  <div>
                    <h4 className="text-sm font-medium">No additional worktrees</h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      You are currently working in the primary repository checkout.
                      Create a worktree to switch to another branch instantly.
                    </p>
                  </div>
                  <Button size="sm" onClick={handleOpenAddWorktree} className="mt-2 text-xs gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Create Worktree
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {worktrees.map((wt) => (
                    <div
                      key={wt.name}
                      className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4 hover:border-primary/40 transition-colors shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">
                              {wt.name}
                            </span>

                            {wt.branch ? (
                              <Badge variant="secondary" className="font-mono text-xs gap-1">
                                <GitBranch className="h-3 w-3 text-primary" />
                                {wt.branch}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Detached HEAD
                              </Badge>
                            )}

                            {wt.is_dirty ? (
                              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 gap-1">
                                <AlertTriangle className="h-2.5 w-2.5" /> Uncommitted changes
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30 gap-1">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Clean
                              </Badge>
                            )}

                            {wt.is_locked && (
                              <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-400/30 gap-1">
                                <Lock className="h-2.5 w-2.5" /> Locked
                              </Badge>
                            )}

                            {wt.is_prunable && (
                              <Badge variant="destructive" className="text-[10px] gap-1">
                                <AlertTriangle className="h-2.5 w-2.5" /> Missing Directory
                              </Badge>
                            )}
                          </div>

                          <p className="text-xs font-mono text-muted-foreground truncate" title={wt.path}>
                            {wt.path}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs gap-1.5 font-medium"
                            onClick={() => void openRepository(wt.path)}
                            title="Open this worktree in Tentacle"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            Open Repo
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1"
                                title="Open in code editor"
                              >
                                <Code2 className="h-3.5 w-3.5" />
                                Editor
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              <DropdownMenuItem onClick={() => void handleOpenEditor(wt.path, "code")}>
                                VS Code
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleOpenEditor(wt.path, "cursor")}>
                                Cursor
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => void handleOpenEditor(wt.path, "zed")}>
                                Zed
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title={wt.is_locked ? "Unlock worktree" : "Lock worktree from pruning"}
                            onClick={async () => {
                              if (wt.is_locked) {
                                await unlockWorktree(wt.name);
                              } else {
                                const reason = await promptFor({
                                  title: `Lock worktree ${wt.name}?`,
                                  label: "Reason (optional)",
                                  placeholder: "Working on sensitive changes",
                                  validate: () => null,
                                });
                                await lockWorktree(wt.name, reason || undefined);
                              }
                              await refreshWorktrees();
                            }}
                          >
                            {wt.is_locked ? (
                              <Unlock className="h-3.5 w-3.5" />
                            ) : (
                              <Lock className="h-3.5 w-3.5" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive/80 hover:text-destructive hover:bg-destructive/10"
                            title="Remove worktree"
                            onClick={async () => {
                              const ok = await confirmThat({
                                title: `Remove worktree ${wt.name}?`,
                                description:
                                  "The directory and its working state will be removed. All committed git history stays safe in the repository.",
                                confirmLabel: "Remove Worktree",
                                destructive: true,
                              });
                              if (!ok) return;
                              await removeWorktree(wt.name);
                              await refreshWorktrees();
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUBMODULES VIEW */}
          {activeTab === "submodules" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Configured Submodules
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sub-repositories checked out inside this project tracking specific commits.
                </p>
              </div>

              {submodules.length === 0 ? (
                <div className="border border-dashed rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3">
                  <Layers className="h-10 w-10 text-muted-foreground/40" />
                  <div>
                    <h4 className="text-sm font-medium">No submodules in this repository</h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      Embed another repository inside this workspace at a specific directory.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setAddSubmoduleOpen(true)} className="mt-2 text-xs gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add Submodule
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {submodules.map((sm) => (
                    <div
                      key={sm.path}
                      className="flex flex-col gap-3 rounded-xl border bg-card/60 p-4 hover:border-primary/40 transition-colors shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">
                              {sm.path}
                            </span>

                            {sm.initialized ? (
                              <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">
                                Initialized
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                                Uninitialized
                              </Badge>
                            )}

                            {sm.modified && (
                              <Badge variant="secondary" className="text-[10px]">
                                Changes detected
                              </Badge>
                            )}
                          </div>

                          {sm.url && (
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {sm.url}
                            </p>
                          )}

                          <div className="flex items-center gap-3 text-[11px] font-mono text-muted-foreground pt-1">
                            {sm.head_oid && (
                              <span>Index: {sm.head_oid.slice(0, 7)}</span>
                            )}
                            {sm.workdir_oid && (
                              <span>HEAD: {sm.workdir_oid.slice(0, 7)}</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-8 text-xs gap-1.5 font-medium"
                            onClick={() => {
                              const absPath = `${tab?.repo.path}/${sm.path}`;
                              void openRepository(absPath);
                            }}
                            title="Open submodule as a repository in Tentacle"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            Open Repo
                          </Button>

                          {!sm.initialized ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              onClick={async () => {
                                await initSubmodule(sm.path);
                                await refreshWorktrees();
                              }}
                            >
                              Initialize
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              onClick={async () => {
                                await syncSubmodule(sm.path);
                                await refreshWorktrees();
                              }}
                            >
                              Sync URL
                            </Button>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs px-2"
                              >
                                More
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              <DropdownMenuItem
                                onClick={() => void handleOpenEditor(`${tab?.repo.path}/${sm.path}`, "code")}
                              >
                                <Code2 className="h-3.5 w-3.5 mr-2" /> Open in VS Code
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  const ok = await confirmThat({
                                    title: `Deinitialize submodule ${sm.path}?`,
                                    description: "Removes submodule working directory and clears config cache.",
                                    confirmLabel: "Deinit",
                                    destructive: true,
                                  });
                                  if (!ok) return;
                                  await deinitSubmodule(sm.path);
                                  await refreshWorktrees();
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Deinitialize
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LFS VIEW */}
          {activeTab === "lfs" && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Git Large File Storage (LFS)
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Replaces audio, video, datasets, and binaries with text pointers in Git.
                </p>
              </div>

              <div className="rounded-xl border bg-card/60 p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold">Git LFS Binary</p>
                    <p className="text-[11px] text-muted-foreground">
                      {lfs?.installed ? "Installed and operational on this machine" : "Not detected in system PATH"}
                    </p>
                  </div>
                  <Badge variant={lfs?.installed ? "default" : "destructive"}>
                    {lfs?.installed ? "Installed" : "Missing"}
                  </Badge>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs font-medium mb-2">Tracked LFS Patterns</p>
                  {(lfs?.tracked_patterns.length ?? 0) === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No patterns tracked by LFS in .gitattributes.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {lfs?.tracked_patterns.map((p) => (
                        <Badge key={p} variant="secondary" className="font-mono text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* NEW WORKTREE DIALOG */}
      <Dialog open={addWorktreeOpen} onOpenChange={setAddWorktreeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FolderTree className="h-4 w-4 text-primary" />
              Create New Worktree
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Worktree Identifier / Name</label>
              <Input
                value={wtName}
                onChange={(e) => {
                  const val = e.target.value;
                  setWtName(val);
                  const repoBase = tab?.repo.path.split(/[/\\]/).filter(Boolean).pop() ?? "repo";
                  setWtPath(`../${repoBase}-${val}`);
                }}
                placeholder="e.g. feature-login"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Target Branch</label>
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline cursor-pointer"
                  onClick={() => setWtCreateNewBranch(!wtCreateNewBranch)}
                >
                  {wtCreateNewBranch ? "Select existing branch" : "Create new branch instead"}
                </button>
              </div>

              {wtCreateNewBranch ? (
                <Input
                  value={wtBranch}
                  onChange={(e) => setWtBranch(e.target.value)}
                  placeholder="new-branch-name"
                  className="h-8 text-xs font-mono"
                />
              ) : (
                <select
                  value={wtBranch}
                  onChange={(e) => {
                    setWtBranch(e.target.value);
                    if (e.target.value) {
                      setWtName(e.target.value.replace(/\//g, "-"));
                      const repoBase = tab?.repo.path.split(/[/\\]/).filter(Boolean).pop() ?? "repo";
                      setWtPath(`../${repoBase}-${e.target.value.replace(/\//g, "-")}`);
                    }
                  }}
                  className="w-full h-8 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm"
                >
                  <option value="">Detached HEAD (No branch)</option>
                  {localBranches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} {b.is_head ? "(current HEAD)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Directory Location</label>
              <Input
                value={wtPath}
                onChange={(e) => setWtPath(e.target.value)}
                placeholder="../project-feature"
                className="h-8 text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Path on your filesystem where this worktree checkout will reside.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddWorktreeOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateWorktree}
              disabled={busy || !wtName.trim() || !wtPath.trim()}
              className="text-xs gap-1.5"
            >
              {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Create Worktree
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NEW SUBMODULE DIALOG */}
      <Dialog open={addSubmoduleOpen} onOpenChange={setAddSubmoduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-primary" />
              Add Git Submodule
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Repository URL</label>
              <Input
                value={smUrl}
                onChange={(e) => {
                  setSmUrl(e.target.value);
                  if (!smPath) {
                    const guessedName = e.target.value.split("/").pop()?.replace(/\.git$/, "") ?? "";
                    setSmPath(guessedName);
                  }
                }}
                placeholder="https://github.com/org/repo.git"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Destination Directory Path</label>
              <Input
                value={smPath}
                onChange={(e) => setSmPath(e.target.value)}
                placeholder="packages/shared-lib"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddSubmoduleOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateSubmodule}
              disabled={busy || !smUrl.trim() || !smPath.trim()}
              className="text-xs gap-1.5"
            >
              {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Add Submodule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
