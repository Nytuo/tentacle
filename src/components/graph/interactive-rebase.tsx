import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGit } from "@/hooks/use-git";
import { errorText } from "@/hooks/use-git";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { ChevronDown, ChevronUp, ListOrdered, Loader2, X } from "lucide-react";

const ACTIONS = [
  { value: "pick", label: "Pick", blurb: "Keep the commit as it is." },
  {
    value: "reword",
    label: "Reword",
    blurb: "Keep the changes, change the message.",
  },
  {
    value: "squash",
    label: "Squash",
    blurb: "Fold into the commit above, combining messages.",
  },
  {
    value: "fixup",
    label: "Fixup",
    blurb: "Fold into the commit above, discarding this message.",
  },
  { value: "drop", label: "Drop", blurb: "Remove the commit entirely." },
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Interactive rebase"
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <ListOrdered className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold">Interactive rebase</h2>
            <p className="text-[11px] text-muted-foreground">
              Applied top to bottom onto{" "}
              <span className="font-mono">{onto.slice(0, 7) || "…"}</span>
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {!steps ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : steps.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Nothing to rebase — that commit is already the base.
            </p>
          ) : (
            steps.map((step, index) => (
              <div
                key={step.oid}
                className={cn(
                  "rounded-lg border p-2 space-y-1.5",
                  step.action === "drop" && "opacity-50 border-destructive/40",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <div className="flex flex-col shrink-0">
                    <button
                      className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label="Move earlier"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label="Move later"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>

                  <span className="font-mono text-[11px] text-primary shrink-0">
                    {step.short_oid}
                  </span>
                  <span
                    className={cn(
                      "text-xs truncate flex-1",
                      step.action === "drop" && "line-through",
                    )}
                  >
                    {step.summary}
                  </span>

                  <select
                    value={step.action}
                    onChange={(e) =>
                      update(index, { action: e.target.value as Action })
                    }
                    className="h-6 shrink-0 rounded border bg-background px-1 text-[11px]"
                  >
                    {ACTIONS.map((a) => (
                      <option key={a.value} value={a.value} title={a.blurb}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>

                {(step.action === "reword" || step.action === "squash") && (
                  <Input
                    value={step.message ?? ""}
                    placeholder={
                      step.action === "reword"
                        ? step.summary
                        : "Combined message (blank joins both messages)"
                    }
                    onChange={(e) => update(index, { message: e.target.value })}
                    className="h-7 text-xs"
                  />
                )}
              </div>
            ))
          )}
        </div>

        <footer className="border-t px-4 py-3 space-y-2">
          {firstIsFold && (
            <p className="text-[11px] text-destructive">
              The first commit has nothing above it to fold into. Change it to
              Pick or move another commit above it.
            </p>
          )}
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-muted-foreground flex-1">
              {remaining} commit{remaining === 1 ? "" : "s"} will be written.
              History is rewritten, so anything already pushed needs a force
              push.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={busy || !steps || steps.length === 0 || firstIsFold}
              onClick={apply}
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Start rebase
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
