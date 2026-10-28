import { useApp } from "@/stores/app-store";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TransferBar() {
  const { state } = useApp();
  const progress = state.transfer;
  if (!progress) return null;

  const total = progress.total_objects;
  const percent =
    total > 0 ? Math.min(100, (progress.received_objects / total) * 100) : 0;

  return (
    <div
      className="shrink-0 border-t bg-card px-4 py-1.5"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{progress.stage}</span>
        {total > 0 && (
          <span className="tabular-nums">
            {progress.received_objects.toLocaleString()} /{" "}
            {total.toLocaleString()}
          </span>
        )}
        {progress.received_bytes > 0 && (
          <span className="tabular-nums">
            {formatBytes(progress.received_bytes)}
          </span>
        )}
        <span className="flex-1" />
        {total > 0 && (
          <span className="tabular-nums">{percent.toFixed(0)}%</span>
        )}
      </div>
      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{ width: total > 0 ? `${percent}%` : "33%" }}
        />
      </div>
    </div>
  );
}
