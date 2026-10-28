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
  Sparkles,
  ShieldAlert,
  Bug,
  Zap,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Cpu,
} from "lucide-react";

interface AiReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diffText: string;
  contextTitle?: string;
}

type ReviewFocus = "general" | "security" | "bugs" | "performance" | "tests";

export function AiReviewModal({
  open,
  onOpenChange,
  diffText,
  contextTitle = "Staged Changes",
}: AiReviewModalProps) {
  const workspace = useActiveWorkspace();
  const { setError } = useGit();
  const [focus, setFocus] = useState<ReviewFocus>("general");
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runReview = async (chosenFocus: ReviewFocus = focus) => {
    if (!diffText.trim()) return;
    setLoading(true);
    try {
      const res = await api.aiReviewDiff(workspace.ai, diffText, chosenFocus);
      setReview(res);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!review) return;
    try {
      await navigator.clipboard.writeText(review);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy review to clipboard.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Local AI Code Review
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auditing {contextTitle} with 100% on-device AI
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1 font-mono">
              <Cpu className="h-3 w-3" />
              {workspace.ai.model || "mistral"}
            </Badge>
          </div>
        </DialogHeader>

        {/* Focus selector pills */}
        <div className="flex items-center gap-1.5 py-3 border-b overflow-x-auto text-xs">
          <span className="text-[11px] text-muted-foreground mr-1">Focus:</span>
          <Button
            size="sm"
            variant={focus === "general" ? "secondary" : "ghost"}
            className="h-7 text-xs gap-1"
            onClick={() => {
              setFocus("general");
              void runReview("general");
            }}
          >
            <CheckCircle2 className="h-3 w-3" /> Full Audit
          </Button>
          <Button
            size="sm"
            variant={focus === "security" ? "secondary" : "ghost"}
            className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
            onClick={() => {
              setFocus("security");
              void runReview("security");
            }}
          >
            <ShieldAlert className="h-3 w-3" /> Security & Risk
          </Button>
          <Button
            size="sm"
            variant={focus === "bugs" ? "secondary" : "ghost"}
            className="h-7 text-xs gap-1 text-amber-500 hover:text-amber-500"
            onClick={() => {
              setFocus("bugs");
              void runReview("bugs");
            }}
          >
            <Bug className="h-3 w-3" /> Bugs & Logic
          </Button>
          <Button
            size="sm"
            variant={focus === "performance" ? "secondary" : "ghost"}
            className="h-7 text-xs gap-1"
            onClick={() => {
              setFocus("performance");
              void runReview("performance");
            }}
          >
            <Zap className="h-3 w-3" /> Performance
          </Button>
        </div>

        {/* Content body */}
        <ScrollArea className="flex-1 my-3 pr-3 min-h-[260px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs font-medium">Analyzing diff with local model...</p>
              <p className="text-[11px] text-muted-foreground max-w-sm text-center">
                Processing AST and change hunks on your machine without external cloud calls.
              </p>
            </div>
          ) : review ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed space-y-3 whitespace-pre-wrap font-sans">
              {review}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground text-center">
              <ShieldAlert className="h-8 w-8 text-muted-foreground/50" />
              <div>
                <p className="text-xs font-medium text-foreground">
                  Ready to review {contextTitle}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                  Run a private code review before committing or creating a pull request.
                </p>
              </div>
              <Button size="sm" onClick={() => void runReview(focus)} className="gap-1.5 h-8 text-xs mt-2">
                <Sparkles className="h-3.5 w-3.5" /> Start Review
              </Button>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2">
            {review && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy Feedback"}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {review && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => void runReview(focus)}
                disabled={loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Re-analyze
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
