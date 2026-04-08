import { useState } from "react";
import type { DiffFile } from "@/lib/api";
import { cn, statusColor, statusIcon } from "@/lib/utils";
import { ChevronDown, ChevronRight, File } from "lucide-react";

export function DiffViewer({ files }: { files: DiffFile[] }) {
  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No changes to display
      </div>
    );
  }

  return (
    <div className="divide-y">
      {files.map((file, idx) => (
        <DiffFileSection key={idx} file={file} defaultExpanded={files.length <= 3} />
      ))}
    </div>
  );
}

function DiffFileSection({ file, defaultExpanded = true }: { file: DiffFile; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const path = file.new_path || file.old_path || "unknown";
  const fileName = path.split("/").pop() || path;
  const dir = path.includes("/") ? path.substring(0, path.lastIndexOf("/") + 1) : "";
  const color = statusColor(file.status);

  return (
    <div>
      
      <button
        className="w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-accent/30 transition-colors cursor-pointer sticky top-0 bg-background z-10 border-b"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
        <span className="font-bold w-4 text-center shrink-0 text-[10px]" style={{ color }}>
          {statusIcon(file.status)}
        </span>
        <File className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate flex-1 text-left font-mono text-[11px]">
          {dir && <span className="text-muted-foreground">{dir}</span>}
          {fileName}
        </span>
        {!file.binary && (
          <span className="text-[10px] shrink-0 tabular-nums ml-2">
            <span className="text-added font-medium">+{file.additions}</span>
            <span className="mx-1 text-muted-foreground">/</span>
            <span className="text-deleted font-medium">-{file.deletions}</span>
          </span>
        )}
      </button>

      
      {expanded && !file.binary && (
        <div className="bg-muted/20">
          {file.hunks.map((hunk, hi) => (
            <div key={hi}>
              <div className="px-4 py-1 text-[10px] font-mono text-muted-foreground bg-muted/40 border-b border-border/30">
                {hunk.header.trim()}
              </div>
              <div className="font-mono text-[11px] leading-[18px]">
                {hunk.lines.map((line, li) => (
                  <div
                    key={li}
                    className={cn(
                      "flex px-2 min-h-[18px] border-l-2",
                      line.origin === "+" && "bg-added/8 border-l-added",
                      line.origin === "-" && "bg-deleted/8 border-l-deleted",
                      line.origin === " " && "border-l-transparent"
                    )}
                  >
                    <span className="w-10 text-right pr-2 text-muted-foreground/60 select-none shrink-0 text-[10px] tabular-nums">
                      {line.old_lineno ?? ""}
                    </span>
                    <span className="w-10 text-right pr-2 text-muted-foreground/60 select-none shrink-0 text-[10px] tabular-nums">
                      {line.new_lineno ?? ""}
                    </span>
                    <span
                      className={cn(
                        "w-4 text-center shrink-0 select-none font-medium",
                        line.origin === "+" && "text-added",
                        line.origin === "-" && "text-deleted",
                        line.origin === " " && "text-transparent"
                      )}
                    >
                      {line.origin}
                    </span>
                    <span className="flex-1 whitespace-pre overflow-hidden">
                      {line.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {expanded && file.binary && (
        <div className="px-4 py-3 text-xs text-muted-foreground italic bg-muted/20">
          Binary file — cannot display diff
        </div>
      )}
    </div>
  );
}
