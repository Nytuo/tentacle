import { useEffect } from "react";
import { useGit } from "@/hooks/use-git";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "@/lib/utils";
import { ArrowLeft, FileClock, GitCommit, ScanLine } from "lucide-react";

export function HistoryView() {
  const { tab, selectCommit, showBlame, setView } = useGit();
  const path = tab?.inspectingPath;
  const commits = tab?.fileHistory ?? [];

  useEffect(() => {
    return () => {};
  }, []);

  if (!path) {
    return (
      <Empty
        icon={FileClock}
        title="No file selected"
        hint="Right-click a file in the changes list or a commit's file tree and choose “File history”."
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="h-10 border-b flex items-center gap-2 px-3 shrink-0 bg-card">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs shrink-0"
          onClick={() => setView("graph")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <FileClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-mono truncate flex-1" title={path}>
          {path}
        </span>
        <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
          {commits.length} commit{commits.length === 1 ? "" : "s"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs shrink-0"
          onClick={() => void showBlame(path)}
        >
          <ScanLine className="h-3.5 w-3.5" />
          Blame
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {commits.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            No commits touch this file.
          </p>
        ) : (
          <div className="divide-y">
            {commits.map((commit) => (
              <button
                key={commit.oid}
                className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
                onClick={() => void selectCommit(commit.oid)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-primary shrink-0">
                    {commit.short_oid}
                  </span>
                  <span className="text-xs truncate flex-1">
                    {commit.summary}
                  </span>
                  <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                    {formatTimestamp(commit.author_time)}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {commit.author_name}
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function Empty({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-center h-full text-muted-foreground p-6">
      <div className="text-center space-y-2 max-w-sm">
        <Icon className="h-10 w-10 mx-auto opacity-30" />
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs opacity-60 leading-relaxed">{hint}</p>}
      </div>
    </div>
  );
}

export { GitCommit };
