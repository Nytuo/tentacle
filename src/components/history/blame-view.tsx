import { useMemo } from "react";
import { useGit } from "@/hooks/use-git";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/history/history-view";
import { cn, formatTimestamp } from "@/lib/utils";
import { ArrowLeft, FileClock, ScanLine } from "lucide-react";

function oidHue(oid: string): number {
  let h = 0;
  for (let i = 0; i < oid.length; i++) {
    h = (h * 31 + oid.charCodeAt(i)) & 0xffff;
  }
  return h % 360;
}

export function BlameView() {
  const { tab, selectCommit, showFileHistory, setView } = useGit();
  const blame = tab?.blame;
  const path = tab?.inspectingPath;

  const [oldest, newest] = useMemo(() => {
    const times = (blame?.lines ?? [])
      .map((l) => l.author_time)
      .filter((t) => t > 0);
    if (times.length === 0) return [0, 0];
    return [Math.min(...times), Math.max(...times)];
  }, [blame]);

  if (!blame || !path) {
    return (
      <Empty
        icon={ScanLine}
        title="Nothing to blame"
        hint="Pick a text file from the changes list or a commit's file tree."
      />
    );
  }

  const span = Math.max(1, newest - oldest);

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
        <ScanLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-mono truncate flex-1" title={path}>
          {path}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-7 text-xs shrink-0"
          onClick={() => void showFileHistory(path)}
        >
          <FileClock className="h-3.5 w-3.5" />
          History
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="font-mono text-[11px] leading-5">
          {blame.lines.map((line) => {
            const hue = oidHue(line.oid);

            const recency =
              line.author_time > 0 ? (line.author_time - oldest) / span : 0;
            return (
              <div
                key={line.line_no}
                className="flex hover:bg-accent/40 transition-colors group"
                style={{
                  backgroundColor: `hsl(${hue} 60% 50% / ${
                    0.04 + recency * 0.1
                  })`,
                }}
              >
                <button
                  className={cn(
                    "w-52 shrink-0 px-2 text-left truncate border-r cursor-pointer",
                    "text-muted-foreground hover:text-foreground",
                    !line.starts_block && "opacity-0 group-hover:opacity-60",
                  )}
                  title={`${line.short_oid} — ${line.summary}`}
                  onClick={() => void selectCommit(line.oid)}
                >
                  <span className="text-primary">{line.short_oid}</span>{" "}
                  <span>{line.author_name}</span>{" "}
                  {line.author_time > 0 && (
                    <span className="opacity-60">
                      {formatTimestamp(line.author_time)}
                    </span>
                  )}
                </button>
                <span className="w-12 shrink-0 px-2 text-right text-muted-foreground/60 tabular-nums select-none">
                  {line.line_no}
                </span>
                <pre className="flex-1 px-2 whitespace-pre overflow-x-auto">
                  {line.content}
                </pre>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
