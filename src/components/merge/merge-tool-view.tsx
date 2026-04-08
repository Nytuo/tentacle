import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, File,
  GitMerge, X, ArrowDown, ArrowUp, Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConflictFileData } from "@/lib/api";

export function MergeToolView() {
  const { tab, dispatch, resolveConflictFile, resolveConflictWithSide, abortMerge, createCommit, refreshAll, refreshDiffs } = useGit();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const conflicts = tab?.conflictFiles ?? [];

  const selected = conflicts[selectedIdx] ?? null;

  const handleFinishMerge = useCallback(async () => {
    
    try {
      await createCommit("Merge commit (conflicts resolved)");
      dispatch({ type: "SET_CONFLICT_FILES", payload: [] });
      dispatch({ type: "SET_ACTIVE_VIEW", payload: "graph" });
    } catch {
      
    }
  }, [createCommit, dispatch]);

  if (conflicts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <GitMerge className="h-12 w-12 opacity-30" />
        <p className="text-sm">No merge conflicts to resolve</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch({ type: "SET_ACTIVE_VIEW", payload: "graph" })}
        >
          Back to History
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      
      <div className="h-10 border-b flex items-center gap-2 px-3 shrink-0 bg-card">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">
          Merge Conflicts — {conflicts.length} file{conflicts.length !== 1 && "s"} to resolve
        </span>
        <div className="flex-1" />
        <Button
          variant="destructive"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={abortMerge}
        >
          <X className="h-3.5 w-3.5" />
          Abort Merge
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5"
          disabled={conflicts.length > 0}
          onClick={handleFinishMerge}
        >
          <Check className="h-3.5 w-3.5" />
          Finish Merge
        </Button>
      </div>

      <ResizablePanelGroup direction="horizontal">
        
        <ResizablePanel defaultSize={22} minSize={16} maxSize={36}>
          <div className="flex flex-col h-full bg-card">
            <div className="h-8 border-b flex items-center px-2 shrink-0 bg-muted/40">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Conflicted Files ({conflicts.length})
              </span>
            </div>
            <ScrollArea className="flex-1">
              {conflicts.map((cf, idx) => {
                const fileName = cf.path.split("/").pop() || cf.path;
                const dir = cf.path.includes("/")
                  ? cf.path.substring(0, cf.path.lastIndexOf("/") + 1)
                  : "";
                return (
                  <button
                    key={cf.path}
                    onClick={() => setSelectedIdx(idx)}
                    className={cn(
                      "w-full flex items-center gap-1.5 px-2 h-7 text-left transition-colors cursor-pointer",
                      idx === selectedIdx
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60 text-muted-foreground hover:text-accent-foreground"
                    )}
                  >
                    <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                    <File className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1 font-mono text-xs" title={cf.path}>
                      {dir && <span className="text-muted-foreground">{dir}</span>}
                      {fileName}
                    </span>
                  </button>
                );
              })}
            </ScrollArea>

            
            {selected && (
              <div className="p-2 border-t space-y-1.5 shrink-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Accept entire file
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-xs gap-1"
                    onClick={() => resolveConflictWithSide(selected.path, "current")}
                  >
                    Current
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-7 text-xs gap-1"
                    onClick={() => resolveConflictWithSide(selected.path, "incoming")}
                  >
                    Incoming
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle />

        
        <ResizablePanel defaultSize={78}>
          {selected ? (
            selected.is_binary ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Binary file — cannot merge visually
              </div>
            ) : (
              <ThreePaneMerge
                key={selected.path}
                conflict={selected}
                onResolve={(content) => resolveConflictFile(selected.path, content)}
              />
            )
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a file to resolve
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}





function ThreePaneMerge({
  conflict,
  onResolve,
}: {
  conflict: ConflictFileData;
  onResolve: (content: string) => void;
}) {
  const currentLines = useMemo(
    () => (conflict.current_content ?? "").split("\n"),
    [conflict.current_content]
  );
  const incomingLines = useMemo(
    () => (conflict.incoming_content ?? "").split("\n"),
    [conflict.incoming_content]
  );

  
  const [resultContent, setResultContent] = useState(
    () => conflict.current_content ?? ""
  );
  const resultLines = useMemo(() => resultContent.split("\n"), [resultContent]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  
  const currentRef = useRef<HTMLDivElement>(null);
  const incomingRef = useRef<HTMLDivElement>(null);
  const resultScrollRef = useRef<HTMLDivElement>(null);

  const handleAcceptCurrent = () => {
    setResultContent(conflict.current_content ?? "");
  };
  const handleAcceptIncoming = () => {
    setResultContent(conflict.incoming_content ?? "");
  };

  return (
    <div className="flex flex-col h-full">
      
      <div className="grid grid-cols-3 border-b shrink-0">
        <div className="h-8 flex items-center px-3 gap-1.5 bg-blue-500/10 border-r">
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
            Current (Ours)
          </span>
          <div className="flex-1" />
          <button
            className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-500/15 transition-colors"
            onClick={handleAcceptCurrent}
            title="Copy all to result"
          >
            Use This
          </button>
        </div>
        <div className="h-8 flex items-center px-3 gap-1.5 bg-orange-500/10 border-r">
          <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
            Incoming (Theirs)
          </span>
          <div className="flex-1" />
          <button
            className="text-[10px] text-orange-400 hover:text-orange-300 cursor-pointer px-1.5 py-0.5 rounded hover:bg-orange-500/15 transition-colors"
            onClick={handleAcceptIncoming}
            title="Copy all to result"
          >
            Use This
          </button>
        </div>
        <div className="h-8 flex items-center px-3 gap-1.5 bg-green-500/10">
          <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">
            Result
          </span>
          <div className="flex-1" />
          <Button
            size="sm"
            className="h-6 text-[10px] gap-1 px-2"
            onClick={() => onResolve(resultContent)}
          >
            <Check className="h-3 w-3" />
            Mark Resolved
          </Button>
        </div>
      </div>

      
      <div className="flex-1 grid grid-cols-3 min-h-0 overflow-hidden">
        
        <div className="border-r overflow-auto" ref={currentRef}>
          <ReadOnlyCodePane lines={currentLines} highlightColor="blue" />
        </div>

        
        <div className="border-r overflow-auto" ref={incomingRef}>
          <ReadOnlyCodePane lines={incomingLines} highlightColor="orange" />
        </div>

        
        <div className="overflow-auto relative" ref={resultScrollRef}>
          <textarea
            ref={textareaRef}
            value={resultContent}
            onChange={(e) => setResultContent(e.target.value)}
            spellCheck={false}
            className={cn(
              "w-full h-full min-h-full resize-none bg-transparent",
              "font-mono text-[11px] leading-[18px] text-foreground",
              "p-0 pl-12 py-0 border-0 outline-none focus:ring-0",
              "whitespace-pre overflow-auto"
            )}
            style={{ tabSize: 4 }}
          />
          
          <div className="absolute left-0 top-0 w-10 pointer-events-none select-none">
            {resultLines.map((_, i) => (
              <div
                key={i}
                className="h-[18px] text-right pr-2 text-[10px] text-muted-foreground/50 font-mono tabular-nums leading-[18px]"
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyCodePane({
  lines,
  highlightColor,
}: {
  lines: string[];
  highlightColor: "blue" | "orange";
}) {
  return (
    <div className="font-mono text-[11px] leading-[18px]">
      {lines.map((line, i) => (
        <div key={i} className="flex min-h-[18px]">
          <span className="w-10 text-right pr-2 text-muted-foreground/50 select-none shrink-0 text-[10px] tabular-nums leading-[18px]">
            {i + 1}
          </span>
          <span className="flex-1 whitespace-pre overflow-hidden pr-2">
            {line}
          </span>
        </div>
      ))}
    </div>
  );
}
