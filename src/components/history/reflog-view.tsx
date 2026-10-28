import { useEffect } from "react";
import { useGit } from "@/hooks/use-git";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { confirmThat } from "@/components/ui/prompt-dialog";
import { formatTimestamp } from "@/lib/utils";
import { FileClock, LifeBuoy, RotateCcw } from "lucide-react";

export function ReflogView() {
  const { tab, refreshReflog, restoreFromReflog, selectCommit } = useGit();
  const entries = tab?.reflog ?? [];

  useEffect(() => {
    void refreshReflog();
  }, [refreshReflog]);

  return (
    <div className="flex flex-col h-full">
      <div className="h-10 border-b flex items-center gap-2 px-3 shrink-0 bg-card">
        <FileClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-semibold flex-1">Reflog</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {entries.length} entries
        </span>
      </div>

      <div className="px-3 py-2 border-b bg-muted/30 flex items-start gap-2">
        <LifeBuoy className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Every position <span className="font-mono">HEAD</span> has held. If a
          reset or rebase lost work, the commit is still here — restore the
          entry from just before it.
        </p>
      </div>

      <ScrollArea className="flex-1">
        {entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            No reflog entries yet.
          </p>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => (
              <div
                key={`${entry.index}-${entry.oid}`}
                className="px-3 py-2 hover:bg-accent/40 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground/60 w-12 shrink-0 tabular-nums">
                    HEAD@{"{"}
                    {entry.index}
                    {"}"}
                  </span>
                  <button
                    className="font-mono text-[11px] text-primary shrink-0 hover:underline"
                    onClick={() => void selectCommit(entry.oid)}
                  >
                    {entry.short_oid}
                  </button>
                  <span className="text-xs truncate flex-1">
                    {entry.message}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                    {formatTimestamp(entry.time)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={async () => {
                      const ok = await confirmThat({
                        title: `Restore to ${entry.short_oid}?`,
                        description:
                          "This moves the current branch back to that commit and resets the " +
                          "working tree to match. Uncommitted changes will be lost.",
                        confirmLabel: "Restore",
                        destructive: true,
                      });
                      if (ok) void restoreFromReflog(entry.oid, true);
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restore
                  </Button>
                </div>
                {entry.summary && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5 pl-14">
                    {entry.summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
