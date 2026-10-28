import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useGit, errorText } from "@/hooks/use-git";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import {
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  GripVertical,
  ListOrdered,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";

const ACTIONS = [
  {
    value: "pick",
    label: "Pick",
    blurb: "Keep commit as is",
    color: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  {
    value: "reword",
    label: "Reword",
    blurb: "Keep changes, edit message",
    color: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
  {
    value: "squash",
    label: "Squash",
    blurb: "Fold into commit above, combining messages",
    color: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  {
    value: "fixup",
    label: "Fixup",
    blurb: "Fold into commit above, discarding message",
    color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  },
  {
    value: "drop",
    label: "Drop",
    blurb: "Remove commit entirely",
    color: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
] as const;

type Action = (typeof ACTIONS)[number]["value"];

interface Step extends api.RebaseStep {
  action: Action;
  summary: string;
  short_oid: string;
}

export function InteractiveRebaseDialog({
  fromOid,
  onClose,
}: {
  fromOid: string;
  onClose: () => void;
}) {
  const { rebaseInteractive, setError } = useGit();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [onto, setOnto] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const target = await api.getCommitDetails(fromOid);

        const base = target.parent_oids[0];
        if (!base) {
          setError("Cannot rebase the root commit interactively.");
          onClose();
          return;
        }

        const commits = await api.getCommits({
          max_count: 200,
          branch: "HEAD",
        });
        const cut = commits.findIndex((c) => c.oid === base);
        const picked = cut >= 0 ? commits.slice(0, cut) : commits;

        if (cancelled) return;
        setOnto(base);

        setSteps(
          picked
            .slice()
            .reverse()
            .map((c) => ({
              oid: c.oid,
              short_oid: c.short_oid,
              summary: c.summary,
              action: "pick" as Action,
              message: null,
            })),
        );
      } catch (e) {
        if (!cancelled) {
          setError(errorText(e));
          onClose();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromOid, onClose, setError]);

  const move = (index: number, delta: number) => {
    setSteps((prev) => {
      if (!prev) return prev;
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    setSteps((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const [item] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const update = (index: number, patch: Partial<Step>) => {
    setSteps(
      (prev) =>
        prev?.map((s, i) => (i === index ? { ...s, ...patch } : s)) ?? prev,
    );
  };

  const apply = async () => {
    if (!steps) return;
    setBusy(true);
    const result = await rebaseInteractive(
      onto,
      steps.map((s) => ({
        oid: s.oid,
        action: s.action,
        message:
          s.action === "reword" || s.action === "squash"
            ? (s.message ?? null)
            : null,
      })),
    );
    setBusy(false);
    if (result) onClose();
  };

  const firstIsFold =
    steps?.[0] && (steps[0].action === "squash" || steps[0].action === "fixup");
  const remaining = steps?.filter((s) => s.action !== "drop").length ?? 0;

  const handleQuickSquashAll = () => {
    setSteps((prev) =>
      prev?.map((s, i) => (i === 0 ? { ...s, action: "pick" } : { ...s, action: "squash" })) ?? null
    );
  };

  const handleResetToPick = () => {
    setSteps((prev) => prev?.map((s) => ({ ...s, action: "pick", message: null })) ?? null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Interactive rebase"
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-xl border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b px-5 py-3.5 bg-muted/20">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <ListOrdered className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">Interactive Rebase</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reordering and restructuring commits onto base{" "}
              <span className="font-mono text-primary">{onto.slice(0, 7) || "…"}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] px-2 gap-1"
              onClick={handleQuickSquashAll}
              title="Squash all commits into the first commit"
            >
              <Sparkles className="h-3 w-3" /> Squash All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] px-2"
              onClick={handleResetToPick}
              title="Reset all actions to Pick"
            >
              Reset
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Search bar */}
        {steps && steps.length > 5 && (
          <div className="px-4 py-2 border-b bg-muted/10 flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter commits in rebase sequence..."
              className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 shadow-none px-0"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {!steps ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs">Loading commit DAG for rebase...</p>
            </div>
          ) : steps.length === 0 ? (
            <p className="py-12 text-center text-xs text-muted-foreground">
              Nothing to rebase — that commit is already the base.
            </p>
          ) : (
            steps.map((step, index) => {
              const isMatch =
                !filter ||
                step.summary.toLowerCase().includes(filter.toLowerCase()) ||
                step.short_oid.toLowerCase().includes(filter.toLowerCase());

              if (!isMatch) return null;

              const isFold = step.action === "squash" || step.action === "fixup";
              const isDropped = step.action === "drop";
              const isDragging = draggedIndex === index;
              const isOver = dragOverIndex === index;

              return (
                <div
                  key={step.oid}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={cn(
                    "group relative flex flex-col rounded-lg border p-2.5 transition-all select-none",
                    isFold && "ml-6 border-l-4 border-l-amber-500/70 bg-amber-500/5",
                    isDropped && "opacity-50 border-destructive/40 bg-destructive/5",
                    !isFold && !isDropped && "bg-card hover:border-primary/40",
                    isDragging && "opacity-25 border-dashed border-primary",
                    isOver && "border-t-2 border-t-primary shadow-sm",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {/* Drag Handle */}
                    <div
                      className="cursor-grab active:cursor-grabbing text-muted-foreground/40 group-hover:text-muted-foreground p-0.5"
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>

                    {/* Hierarchy connector icon if folding */}
                    {isFold && (
                      <CornerDownRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}

                    {/* Step index */}
                    <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">
                      {index + 1}
                    </span>

                    {/* Oid */}
                    <span className="font-mono text-xs font-semibold text-primary shrink-0">
                      {step.short_oid}
                    </span>

                    {/* Summary */}
                    <span
                      className={cn(
                        "text-xs truncate flex-1 font-medium",
                        isDropped && "line-through text-muted-foreground",
                      )}
                      title={step.summary}
                    >
                      {step.summary}
                    </span>

                    {/* Action Selector Pills */}
                    <div className="flex items-center gap-1 shrink-0">
                      {ACTIONS.map((a) => (
                        <button
                          key={a.value}
                          type="button"
                          onClick={() => update(index, { action: a.value })}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer",
                            step.action === a.value
                              ? cn(a.color, "font-semibold shadow-xs")
                              : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50",
                          )}
                          title={a.blurb}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>

                    {/* Reorder Buttons */}
                    <div className="flex items-center shrink-0 border-l pl-1.5 ml-1">
                      <button
                        className="p-1 rounded hover:bg-accent disabled:opacity-20 text-muted-foreground hover:text-foreground cursor-pointer"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        title="Move up (earlier)"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-accent disabled:opacity-20 text-muted-foreground hover:text-foreground cursor-pointer"
                        disabled={index === steps.length - 1}
                        onClick={() => move(index, 1)}
                        title="Move down (later)"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Message editor for Reword and Squash */}
                  {(step.action === "reword" || step.action === "squash") && (
                    <div className="pt-2 pl-7">
                      <Input
                        value={step.message ?? ""}
                        placeholder={
                          step.action === "reword"
                            ? step.summary
                            : "Combined commit message (leave blank to join both messages automatically)"
                        }
                        onChange={(e) => update(index, { message: e.target.value })}
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <footer className="border-t px-5 py-3.5 bg-muted/20 space-y-2">
          {firstIsFold && (
            <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <span>⚠️ The first commit in the sequence cannot be squashed or fixed up because there is no prior commit to fold into.</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{remaining}</span> commit{remaining === 1 ? "" : "s"} will be replayed.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs font-medium"
                disabled={busy || !steps || steps.length === 0 || firstIsFold}
                onClick={apply}
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
                Execute Rebase
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
