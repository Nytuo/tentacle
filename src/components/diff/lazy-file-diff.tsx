import { useEffect, useState } from "react";
import { DiffViewer } from "@/components/diff/diff-viewer";
import { errorText } from "@/hooks/use-git";
import * as api from "@/lib/api";
import type { DiffFile } from "@/lib/api";
import { Loader2 } from "lucide-react";

export function LazyFileDiff({ oid, file }: { oid: string; file: DiffFile }) {
  const [loaded, setLoaded] = useState<DiffFile | null>(file.hunks_loaded ? file : null);
  const [error, setError] = useState<string | null>(null);
  const path = file.new_path || file.old_path || "";

  useEffect(() => {
    if (file.hunks_loaded) {
      setLoaded(file);
      return;
    }
    let cancelled = false;
    setLoaded(null);
    setError(null);
    api
      .getCommitFileDiff(oid, path, file.old_path)
      .then(d => !cancelled && setLoaded(d))
      .catch(e => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [oid, path, file]);

  if (error) return <p className="p-4 text-xs text-destructive">{error}</p>;
  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  return <DiffViewer files={[loaded]} />;
}
