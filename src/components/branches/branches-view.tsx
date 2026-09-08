import { useState } from "react";
import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowRight,
  Check,
  GitBranch,
  GitMerge,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { confirmThat } from "@/components/ui/prompt-dialog";

export function BranchesView() {
  const { tab, checkoutBranch, mergeBranch, refreshAll, setError } = useGit();
  const [createOpen, setCreateOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [rebaseTarget, setRebaseTarget] = useState("");
  const [rebaseOpen, setRebaseOpen] = useState(false);
  const [filter, setFilter] = useState("");

  if (!tab) return null;

  const localBranches = tab.branches.filter((b) => !b.is_remote);
  const remoteBranches = tab.branches.filter((b) => b.is_remote);

  const filteredLocal = localBranches.filter((b) =>
    b.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const filteredRemote = remoteBranches.filter((b) =>
    b.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    try {
      await api.createBranch(newBranchName.trim());
      await refreshAll();
      setNewBranchName("");
      setCreateOpen(false);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleDeleteBranch = async (name: string) => {
    const ok = await confirmThat({
      title: `Delete branch ${name}?`,
      description:
        "Only the branch label is removed; its commits stay reachable from the reflog.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteBranch(name);
      await refreshAll();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRebase = async () => {
    if (!rebaseTarget) return;
    try {
      await api.rebaseOnto(rebaseTarget);
      await refreshAll();
      setRebaseOpen(false);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-2.5 py-2 border-b flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter branches..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-7 h-7 text-xs"
          />
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1 h-7 text-xs px-2.5">
              <Plus className="h-3 w-3" /> New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Branch</DialogTitle>
            </DialogHeader>
            <Input
              placeholder="Branch name..."
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateBranch()}
              autoFocus
            />
            <DialogFooter>
              <Button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={rebaseOpen} onOpenChange={setRebaseOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 h-7 text-xs px-2.5"
            >
              <ArrowRight className="h-3 w-3" /> Rebase
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rebase onto</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Select a branch to rebase the current branch onto:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {localBranches
                  .filter((b) => !b.is_head)
                  .map((b) => (
                    <Button
                      key={b.name}
                      variant={
                        rebaseTarget === b.name ? "secondary" : "outline"
                      }
                      size="sm"
                      onClick={() => setRebaseTarget(b.name)}
                    >
                      {b.name}
                    </Button>
                  ))}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleRebase} disabled={!rebaseTarget}>
                Rebase
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1.5">
          <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Local ({filteredLocal.length})
          </div>
          <div className="space-y-px">
            {filteredLocal.map((branch) => (
              <div
                key={branch.name}
                className={cn(
                  "flex items-center gap-2 px-2 h-8 rounded-md hover:bg-accent/60 group transition-colors",
                  branch.is_head && "bg-accent/40",
                )}
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate font-mono text-xs">
                  {branch.name}
                </span>
                {branch.is_head && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] h-4 px-1.5 gap-0.5"
                  >
                    <Check className="h-2.5 w-2.5" /> HEAD
                  </Badge>
                )}
                {branch.ahead != null && branch.ahead > 0 && (
                  <span className="text-xs text-added tabular-nums">
                    +{branch.ahead}
                  </span>
                )}
                {branch.behind != null && branch.behind > 0 && (
                  <span className="text-xs text-deleted tabular-nums">
                    -{branch.behind}
                  </span>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-accent rounded transition-opacity cursor-pointer">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-xs font-mono">
                      {branch.name}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {!branch.is_head && (
                      <DropdownMenuItem
                        onClick={() => checkoutBranch(branch.name)}
                      >
                        <Check className="h-3 w-3 mr-2" /> Checkout
                      </DropdownMenuItem>
                    )}
                    {!branch.is_head && (
                      <DropdownMenuItem
                        onClick={() => mergeBranch(branch.name)}
                      >
                        <GitMerge className="h-3 w-3 mr-2" /> Merge into current
                      </DropdownMenuItem>
                    )}
                    {!branch.is_head && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteBranch(branch.name)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-3 w-3 mr-2" /> Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>

        {filteredRemote.length > 0 && (
          <div className="px-1.5 pb-1.5 border-t pt-1.5">
            <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Remote ({filteredRemote.length})
            </div>
            <div className="space-y-px">
              {filteredRemote.map((branch) => (
                <div
                  key={branch.name}
                  className="flex items-center gap-2 px-2 h-8 rounded-md text-muted-foreground hover:bg-accent/40 transition-colors"
                >
                  <GitBranch className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate font-mono text-xs">
                    {branch.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
