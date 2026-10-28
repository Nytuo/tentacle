import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowLeftRight, Check } from "lucide-react";

export interface ConflictRegion {
  context: string[];
  ours: string[];
  theirs: string[];
}

export type Choice = "current" | "incoming" | "both";

export function parseConflictRegions(
  merged: string,
): { regions: ConflictRegion[]; trailer: string[] } | null {
  const lines = merged.split("\n");
  const regions: ConflictRegion[] = [];
  let context: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith("<<<<<<<")) {
      context.push(lines[i]);
      i++;
      continue;
    }

    i++;
    const ours: string[] = [];
    const theirs: string[] = [];

    let section: "ours" | "base" | "theirs" = "ours";
    let closed = false;

    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith(">>>>>>>")) {
        closed = true;
        i++;
        break;
      }
      if (line.startsWith("=======")) section = "theirs";
      else if (line.startsWith("|||||||")) section = "base";
      else if (section === "ours") ours.push(line);
      else if (section === "theirs") theirs.push(line);
      i++;
    }

    if (!closed) return null;
    regions.push({ context, ours, theirs });
    context = [];
  }

  if (regions.length === 0) return null;
  return { regions, trailer: context };
}

export function ConflictRegions({
  merged,
  onResolve,
}: {
  merged: string;
  onResolve: (choices: Choice[]) => void;
}) {
  const parsed = useMemo(() => parseConflictRegions(merged), [merged]);
  const [choices, setChoices] = useState<(Choice | null)[]>(() =>
    parsed ? parsed.regions.map(() => null) : [],
  );

  if (!parsed) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-6 text-center">
        No conflict markers found in this file — resolve it in the editor pane,
        or accept one whole side.
      </div>
    );
  }

  const { regions } = parsed;
  const decided = choices.filter((c) => c !== null).length;
  const allDecided = decided === regions.length;

  const set = (index: number, choice: Choice) =>
    setChoices((prev) => prev.map((c, i) => (i === index ? choice : c)));

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-2 border-b px-3 py-2 bg-card">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        <span className="text-xs flex-1">
          {decided} of {regions.length} region{regions.length === 1 ? "" : "s"}{" "}
          decided
        </span>
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5"
          disabled={!allDecided}
          onClick={() => onResolve(choices as Choice[])}
        >
          <Check className="h-3.5 w-3.5" />
          Apply resolution
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="divide-y">
          {regions.map((region, index) => (
            <div key={index} className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">
                  Region {index + 1}
                </span>
                {(
                  [
                    ["current", "Keep current"],
                    ["incoming", "Take incoming"],
                    ["both", "Keep both"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    variant={choices[index] === value ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => set(index, value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SideBlock
                  title="Current (yours)"
                  lines={region.ours}
                  tone="current"
                  active={
                    choices[index] === "current" || choices[index] === "both"
                  }
                />
                <SideBlock
                  title="Incoming (theirs)"
                  lines={region.theirs}
                  tone="incoming"
                  active={
                    choices[index] === "incoming" || choices[index] === "both"
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function SideBlock({
  title,
  lines,
  tone,
  active,
}: {
  title: string;
  lines: string[];
  tone: "current" | "incoming";
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden transition-opacity",
        tone === "current" ? "border-blue-500/40" : "border-purple-500/40",
        !active && "opacity-50",
      )}
    >
      <div
        className={cn(
          "px-2 py-1 text-[10px] font-semibold flex items-center gap-1",
          tone === "current"
            ? "bg-blue-500/10 text-blue-400"
            : "bg-purple-500/10 text-purple-400",
        )}
      >
        <ArrowLeftRight className="h-2.5 w-2.5" />
        {title}
      </div>
      <pre className="p-2 text-[11px] font-mono whitespace-pre overflow-x-auto max-h-48">
        {lines.length === 0 ? (
          <span className="text-muted-foreground italic">(empty)</span>
        ) : (
          lines.join("\n")
        )}
      </pre>
    </div>
  );
}
