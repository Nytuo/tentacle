import { useState } from "react";
import { useActiveWorkspace } from "@/stores/app-store";
import { useGit, errorText } from "@/hooks/use-git";
import * as api from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Cpu,
  Layers,
} from "lucide-react";

interface AiChangelogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AiChangelogModal({ open, onOpenChange }: AiChangelogModalProps) {
  const workspace = useActiveWorkspace();
  const { tab, setError } = useGit();
  const [style, setStyle] = useState<"keep-a-changelog" | "conventional">("keep-a-changelog");
  const [loading, setLoading] = useState(false);
  const [changelog, setChangelog] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    const nodes = tab?.graph?.nodes ?? [];
    if (nodes.length === 0) {
      setError(
        "No commits available in the active repository graph to generate a changelog from.",
      );
      return;
    }

    setLoading(true);
    try {
      // Gather the latest 30 commits summary
      const commitSummaries = nodes
        .slice(0, 30)
        .map((c) => `- ${c.short_oid} ${c.summary} (${c.author_name})`)
        .join("\n");

      const res = await api.aiGenerateChangelog(
        workspace.ai,
        commitSummaries,
        style,
      );
      setChangelog(res);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!changelog) return;
    try {
      await navigator.clipboard.writeText(changelog);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy changelog to clipboard.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Generate Changelog with AI
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Summarize recent commits into a polished release document
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs gap-1 font-mono">
            <Cpu className="h-3 w-3" />
            {workspace.ai.model || "mistral"}
          </Badge>
        </DialogHeader>

        <div className="flex items-center gap-2 py-3 border-b text-xs">
          <span className="text-[11px] text-muted-foreground mr-1">Format:</span>
          <Button
            size="sm"
            variant={style === "keep-a-changelog" ? "secondary" : "ghost"}
            className="h-7 text-xs gap-1"
            onClick={() => setStyle("keep-a-changelog")}
          >
            <Layers className="h-3 w-3" /> Keep a Changelog
          </Button>
          <Button
            size="sm"
            variant={style === "conventional" ? "secondary" : "ghost"}
            className="h-7 text-xs gap-1"
            onClick={() => setStyle("conventional")}
          >
            <Sparkles className="h-3 w-3" /> Conventional Types
          </Button>
        </div>

        <ScrollArea className="flex-1 my-3 pr-3 min-h-[260px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs font-medium">Generating release notes on-device...</p>
            </div>
          ) : changelog ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed space-y-3 whitespace-pre-wrap font-mono bg-muted/20 p-4 rounded-lg border">
              {changelog}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/50" />
              <div>
                <p className="text-xs font-medium text-foreground">
                  Ready to compile changelog
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                  Analyzes recent commits and synthesizes them into organized release notes.
                </p>
              </div>
              <Button size="sm" onClick={generate} className="gap-1.5 h-8 text-xs mt-2">
                <Sparkles className="h-3.5 w-3.5" /> Generate Release Notes
              </Button>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2">
            {changelog && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy Markdown"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {changelog && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={generate}
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Regenerate
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
