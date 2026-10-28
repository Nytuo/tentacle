import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn, statusColor, statusIcon } from "@/lib/utils";
import { confirmThat } from "@/components/ui/prompt-dialog";
import type { DiffFile, DiffLine, HunkSelection } from "@/lib/api";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  File,
  RotateCcw,
  X,
} from "lucide-react";

export type StagingSide = "unstaged" | "staged";

interface Props {
  files: DiffFile[];
  side: StagingSide;
  onStage: (path: string, selections: HunkSelection[]) => void;
  onUnstage: (path: string, selections: HunkSelection[]) => void;
  onDiscard: (path: string, selections: HunkSelection[]) => void;
}

function isSelectable(line: DiffLine): boolean {
  return line.origin === "+" || line.origin === "-";
}

function lineKey(path: string, hunk: number, line: number): string {
  return `${path}:${hunk}:${line}`;
}

export function StagingDiffViewer({
  files,
  side,
  onStage,
  onUnstage,
  onDiscard,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleLine = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectionsFor = useCallback(
    (file: DiffFile): HunkSelection[] => {
      const path = file.new_path || file.old_path || "";
      const byHunk = new Map<number, number[]>();
      file.hunks.forEach((hunk, hunkIndex) => {
        hunk.lines.forEach((_, lineIndex) => {
          if (selected.has(lineKey(path, hunkIndex, lineIndex))) {
            const list = byHunk.get(hunkIndex) ?? [];
            list.push(lineIndex);
            byHunk.set(hunkIndex, list);
          }
        });
      });
      return [...byHunk.entries()].map(([hunk_index, lines]) => ({
        hunk_index,
        lines,
      }));
    },
    [selected],
  );

  const selectedCount = selected.size;

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        {side === "staged" ? "Nothing staged" : "No changes"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {selectedCount > 0 && (
        <SelectionBar
          count={selectedCount}
          side={side}
          files={files}
          selectionsFor={selectionsFor}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
          onClear={clearSelection}
        />
      )}

      <div className="flex-1 overflow-auto divide-y">
        {files.map((file) => (
          <FileSection
            key={file.new_path || file.old_path}
            file={file}
            side={side}
            selected={selected}
            onToggleLine={toggleLine}
            onStage={onStage}
            onUnstage={onUnstage}
            onDiscard={onDiscard}
            defaultExpanded={files.length <= 3}
          />
        ))}
      </div>
    </div>
  );
}

function SelectionBar({
  count,
  side,
  files,
  selectionsFor,
  onStage,
  onUnstage,
  onDiscard,
  onClear,
}: {
  count: number;
  side: StagingSide;
  files: DiffFile[];
  selectionsFor: (f: DiffFile) => HunkSelection[];
  onStage: Props["onStage"];
  onUnstage: Props["onUnstage"];
  onDiscard: Props["onDiscard"];
  onClear: () => void;
}) {
  const applyToSelection = (
    action: (path: string, sel: HunkSelection[]) => void,
  ) => {
    for (const file of files) {
      const selections = selectionsFor(file);
      if (selections.length === 0) continue;
      action(file.new_path || file.old_path || "", selections);
    }
    onClear();
  };

  return (
    <div className="shrink-0 flex items-center gap-2 border-b bg-primary/10 px-3 py-1.5">
      <span className="text-xs font-medium">
        {count} line{count === 1 ? "" : "s"} selected
      </span>
      <span className="flex-1" />
      {side === "unstaged" ? (
        <>
          <Button
            size="sm"
            className="h-6 text-[11px] gap-1"
            onClick={() => applyToSelection(onStage)}
          >
            <ArrowUp className="h-3 w-3" /> Stage lines
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] gap-1 text-destructive"
            onClick={async () => {
              const ok = await confirmThat({
                title: `Discard ${count} line${count === 1 ? "" : "s"}?`,
                description: "These changes are not recoverable.",
                confirmLabel: "Discard",
                destructive: true,
              });
              if (ok) applyToSelection(onDiscard);
            }}
          >
            <RotateCcw className="h-3 w-3" /> Discard lines
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="h-6 text-[11px] gap-1"
          onClick={() => applyToSelection(onUnstage)}
        >
          <ArrowDown className="h-3 w-3" /> Unstage lines
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onClear}
        title="Clear"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function FileSection({
  file,
  side,
  selected,
  onToggleLine,
  onStage,
  onUnstage,
  onDiscard,
  defaultExpanded,
}: {
  file: DiffFile;
  side: StagingSide;
  selected: Set<string>;
  onToggleLine: (key: string) => void;
  onStage: Props["onStage"];
  onUnstage: Props["onUnstage"];
  onDiscard: Props["onDiscard"];
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const path = file.new_path || file.old_path || "unknown";
  const fileName = path.split("/").pop() || path;
  const dir = path.includes("/")
    ? path.substring(0, path.lastIndexOf("/") + 1)
    : "";
  const color = statusColor(file.status);

  const renamedFrom = useMemo(
    () => (file.status === "renamed" ? file.old_path : null),
    [file.old_path, file.status],
  );

  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 py-2">
        <button
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span
            className="font-bold w-4 text-center shrink-0 text-[10px]"
            style={{ color }}
          >
            {statusIcon(file.status)}
          </span>
          <File className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[11px]">
            {dir && <span className="text-muted-foreground">{dir}</span>}
            {fileName}
          </span>
          {renamedFrom && (
            <span className="truncate text-[10px] text-muted-foreground shrink-0">
              ← {renamedFrom}
            </span>
          )}
        </button>

        {!file.binary && (
          <span className="text-[10px] shrink-0 tabular-nums">
            <span className="text-green-500 font-medium">
              +{file.additions}
            </span>
            <span className="mx-1 text-muted-foreground">/</span>
            <span className="text-red-400 font-medium">-{file.deletions}</span>
          </span>
        )}

        <FileActions
          side={side}
          onStage={() => onStage(path, [])}
          onUnstage={() => onUnstage(path, [])}
          onDiscard={async () => {
            const ok = await confirmThat({
              title: `Discard all changes to ${fileName}?`,
              description: "These changes are not recoverable.",
              confirmLabel: "Discard",
              destructive: true,
            });
            if (ok) onDiscard(path, []);
          }}
        />
      </div>

      {expanded && file.binary && (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Binary file — no line-by-line diff to show.
        </p>
      )}

      {expanded &&
        !file.binary &&
        file.hunks.map((hunk, hunkIndex) => (
          <div key={hunkIndex}>
            <div className="flex items-center gap-2 bg-muted/40 px-3 py-1 border-y">
              <span className="font-mono text-[10px] text-muted-foreground truncate flex-1">
                {hunk.header.trim()}
              </span>
              <HunkActions
                side={side}
                onStage={() =>
                  onStage(path, [{ hunk_index: hunkIndex, lines: [] }])
                }
                onUnstage={() =>
                  onUnstage(path, [{ hunk_index: hunkIndex, lines: [] }])
                }
                onDiscard={async () => {
                  const ok = await confirmThat({
                    title: "Discard this hunk?",
                    description: "These changes are not recoverable.",
                    confirmLabel: "Discard",
                    destructive: true,
                  });
                  if (ok) {
                    onDiscard(path, [{ hunk_index: hunkIndex, lines: [] }]);
                  }
                }}
              />
            </div>

            <div className="font-mono text-[11px] leading-5">
              {hunk.lines.map((line, lineIndex) => {
                const key = lineKey(path, hunkIndex, lineIndex);
                const selectable = isSelectable(line);
                const isSelected = selected.has(key);
                return (
                  <div
                    key={lineIndex}
                    className={cn(
                      "flex",
                      line.origin === "+" && "bg-green-500/10",
                      line.origin === "-" && "bg-red-500/10",
                      selectable && "cursor-pointer hover:brightness-110",
                      isSelected &&
                        "ring-1 ring-inset ring-primary bg-primary/15",
                    )}
                    onClick={selectable ? () => onToggleLine(key) : undefined}
                    role={selectable ? "checkbox" : undefined}
                    aria-checked={selectable ? isSelected : undefined}
                    title={selectable ? "Click to select this line" : undefined}
                  >
                    <span className="w-10 shrink-0 px-1 text-right text-muted-foreground/50 tabular-nums select-none">
                      {line.old_lineno ?? ""}
                    </span>
                    <span className="w-10 shrink-0 px-1 text-right text-muted-foreground/50 tabular-nums select-none">
                      {line.new_lineno ?? ""}
                    </span>
                    <span
                      className={cn(
                        "w-4 shrink-0 text-center select-none",
                        line.origin === "+" && "text-green-500",
                        line.origin === "-" && "text-red-400",
                      )}
                    >
                      {line.origin === " " ? "" : line.origin}
                    </span>
                    <pre className="flex-1 whitespace-pre overflow-x-auto pr-3">
                      {line.content.replace(/\n$/, "")}
                    </pre>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}

function FileActions({
  side,
  onStage,
  onUnstage,
  onDiscard,
}: {
  side: StagingSide;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
}) {
  if (side === "staged") {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] gap-1 shrink-0"
        onClick={onUnstage}
      >
        <ArrowDown className="h-3 w-3" /> Unstage file
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[10px] gap-1"
        onClick={onStage}
      >
        <ArrowUp className="h-3 w-3" /> Stage file
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-destructive"
        onClick={onDiscard}
        title="Discard file"
      >
        <RotateCcw className="h-3 w-3" />
      </Button>
    </div>
  );
}

function HunkActions({
  side,
  onStage,
  onUnstage,
  onDiscard,
}: {
  side: StagingSide;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
}) {
  if (side === "staged") {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-5 text-[10px] gap-1 shrink-0"
        onClick={onUnstage}
      >
        <ArrowDown className="h-2.5 w-2.5" /> Unstage hunk
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-5 text-[10px] gap-1"
        onClick={onStage}
      >
        <ArrowUp className="h-2.5 w-2.5" /> Stage hunk
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 text-[10px] gap-1 text-destructive"
        onClick={onDiscard}
      >
        <RotateCcw className="h-2.5 w-2.5" /> Discard
      </Button>
    </div>
  );
}
