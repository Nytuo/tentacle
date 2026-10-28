import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "@/stores/app-store";
import { errorText } from "@/hooks/use-git";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/api";
import {
  AlertCircle, ArrowDownCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw,
} from "lucide-react";

type Phase = "idle" | "downloading" | "installing" | "up-to-date" | "error" | "restart";

const LAUNCH_CHECK_DELAY_MS = 3000;

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-2 rounded-full bg-muted overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${value}%` }} />
    </div>
  );
}

export function UpdaterModal() {
  const { state } = useApp();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<api.UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const unlisten = listen<api.UpdateProgress>("updater-progress", event => {
      const p = event.payload;
      if (p.stage === "downloading") {
        setPhase("downloading");
        setDownloaded(p.downloaded);
        setTotal(p.total);
        setProgress(p.percentage);
      } else if (p.stage === "installing") {
        setPhase("installing");
        setProgress(99);
      } else {
        setPhase("restart");
        setProgress(100);
      }
    });
    return () => {
      void unlisten.then(fn => fn());
    };
  }, []);

  const check = useCallback(async (manual: boolean) => {
    setChecking(true);
    setErrorMsg("");
    try {
      const found = await api.checkForUpdate();
      if (found) {
        setInfo(found);
        setPhase("idle");
        setOpen(true);
      } else if (manual) {
        setInfo(null);
        setPhase("up-to-date");
        setOpen(true);
      }
    } catch (e) {
      if (manual) {
        setErrorMsg(errorText(e));
        setPhase("error");
        setOpen(true);
      }
    } finally {
      setChecking(false);
    }
  }, []);

  const launched = useRef(false);
  useEffect(() => {
    if (!state.isRestored || launched.current) return;
    launched.current = true;
    if (!state.autoCheckUpdates) return;
    const timer = setTimeout(() => void check(false), LAUNCH_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [check, state.autoCheckUpdates, state.isRestored]);

  useEffect(() => {
    const onRequest = () => void check(true);
    window.addEventListener(api.CHECK_FOR_UPDATES_EVENT, onRequest);
    return () => window.removeEventListener(api.CHECK_FOR_UPDATES_EVENT, onRequest);
  }, [check]);

  const install = async () => {
    setPhase("downloading");
    setProgress(0);
    setDownloaded(0);
    setTotal(0);
    setErrorMsg("");
    try {
      await api.installUpdate();
    } catch (e) {
      setErrorMsg(errorText(e));
      setPhase("error");
    }
  };

  const busy = phase === "downloading" || phase === "installing";

  return (
    <Dialog open={open} onOpenChange={next => !busy && setOpen(next)}>
      <DialogContent
        showCloseButton={!busy}
        onEscapeKeyDown={e => busy && e.preventDefault()}
        onPointerDownOutside={e => busy && e.preventDefault()}
        className="max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowDownCircle className="h-5 w-5 text-primary shrink-0" />
            {phase === "up-to-date"
              ? "You're up to date"
              : phase === "error" && !info
                ? "Couldn't check for updates"
                : "Update available"}
          </DialogTitle>
          {info && (
            <DialogDescription asChild>
              <div className="flex items-center gap-1.5 text-sm">
                <span>v{info.current_version}</span>
                <span>→</span>
                <span className="font-semibold text-foreground">v{info.version}</span>
                {info.date && (
                  <span className="ml-1">
                    ·{" "}
                    {new Date(info.date).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {info?.body && phase === "idle" && (
            <div className="bg-muted max-h-56 overflow-y-auto rounded-md px-3 py-2">
              <pre className="font-sans text-xs whitespace-pre-wrap break-words leading-relaxed">
                {info.body}
              </pre>
            </div>
          )}

          {phase === "up-to-date" && (
            <div className="flex items-center gap-2 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>You're running the latest version of Tentacle.</span>
            </div>
          )}

          {phase === "error" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-words">{errorMsg}</span>
            </div>
          )}

          {phase === "downloading" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Downloading…
                </span>
                <span className="tabular-nums font-medium">{progress}%</span>
              </div>
              <ProgressBar value={progress} />
              {total > 0 && (
                <p className="text-muted-foreground text-right text-xs tabular-nums">
                  {formatBytes(downloaded)} / {formatBytes(total)}
                </p>
              )}
            </div>
          )}

          {phase === "installing" && (
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Verifying and installing…
              </span>
              <ProgressBar value={99} />
            </div>
          )}

          {phase === "restart" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Update installed. Restart Tentacle to use it.</span>
              </div>
              <Button onClick={() => void api.restartApp()} className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Restart now
              </Button>
            </div>
          )}

          {(phase === "idle" || phase === "error") && (
            <div className="flex flex-col gap-2">
              {info && (
                <Button onClick={install} className="w-full gap-2" disabled={checking}>
                  <ArrowDownCircle className="h-4 w-4" />
                  {phase === "error" ? "Retry update" : "Update now"}
                </Button>
              )}
              {phase === "error" && !info && (
                <Button onClick={() => void check(true)} className="w-full gap-2" disabled={checking}>
                  {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Try again
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => void api.openReleasesPage()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  All releases
                </Button>
                <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
                  Later
                </Button>
              </div>
            </div>
          )}

          {phase === "up-to-date" && (
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
