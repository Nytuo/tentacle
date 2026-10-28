import { useCallback, useEffect, useState } from "react";
import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorText } from "@/hooks/use-git";
import * as api from "@/lib/api";
import { Check, FileText, Loader2 } from "lucide-react";

const FILES = [
  { name: ".gitignore", blurb: "Paths git should not track." },
  {
    name: ".gitattributes",
    blurb: "Per-path settings: line endings, diff drivers, LFS filters.",
  },
] as const;

export function IgnoreView() {
  const { setError, refreshStatus } = useGit();
  const [name, setName] = useState<string>(FILES[0].name);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  const load = useCallback(
    async (file: string) => {
      setLoading(true);
      try {
        const result = await api.readIgnoreFile(file);
        setContent(result.content);
        setOriginal(result.content);
      } catch (e) {
        setError(errorText(e));
        setContent("");
        setOriginal("");
      } finally {
        setLoading(false);
      }
    },
    [setError],
  );

  useEffect(() => {
    void load(name);
  }, [load, name]);

  const dirty = content !== original;

  const save = async () => {
    try {
      await api.writeIgnoreFile(name, content);
      setOriginal(content);
      setSaved(true);

      await refreshStatus();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const blurb = FILES.find((f) => f.name === name)?.blurb;

  return (
    <div className="flex flex-col h-full">
      <div className="h-10 border-b flex items-center gap-3 px-3 shrink-0 bg-card">
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Tabs value={name} onValueChange={setName}>
          <TabsList className="h-7">
            {FILES.map((f) => (
              <TabsTrigger
                key={f.name}
                value={f.name}
                className="text-xs font-mono h-6"
              >
                {f.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className="flex-1" />
        {saved && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Check className="h-3 w-3" /> Saved
          </span>
        )}
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!dirty || loading}
          onClick={save}
        >
          Save
        </Button>
      </div>

      <p className="px-3 py-2 text-[11px] text-muted-foreground border-b bg-muted/30">
        {blurb}
      </p>

      <div className="flex-1 p-3 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="h-full w-full font-mono text-xs resize-none"
            placeholder={
              name === ".gitignore"
                ? "node_modules/\ndist/\n*.log"
                : "*.png filter=lfs diff=lfs merge=lfs -text"
            }
          />
        )}
      </div>
    </div>
  );
}
