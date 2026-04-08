import { useState } from "react";
import { useGit } from "@/hooks/use-git";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Globe, Plus, Trash2, Link, ArrowDownToLine, ArrowUpFromLine, RotateCcw } from "lucide-react";
import * as api from "@/lib/api";

export function RemotesView() {
  const { tab, fetchRemote, pushRemote, pullRemote, refreshAll, setError } = useGit();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  if (!tab) return null;

  const handleAddRemote = async () => {
    if (!newName || !newUrl) return;
    try {
      await api.addRemote(newName, newUrl);
      await refreshAll();
      setAddOpen(false);
      setNewName("");
      setNewUrl("");
    } catch (e) { setError(String(e)); }
  };

  const handleRemoveRemote = async (name: string) => {
    if (!confirm(`Remove remote "${name}"?`)) return;
    try {
      await api.removeRemote(name);
      await refreshAll();
    } catch (e) { setError(String(e)); }
  };

  return (
    <div className="flex flex-col h-full">
      
      <div className="px-2.5 py-2 border-b flex items-center gap-2 shrink-0">
        <h2 className="font-semibold text-sm flex-1">Remotes</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1 h-7 text-xs px-2.5">
              <Plus className="h-3 w-3" /> Add Remote
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Remote</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Remote name (e.g. origin)" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              <Input placeholder="Remote URL" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
            </div>
            <DialogFooter>
              <Button onClick={handleAddRemote} disabled={!newName || !newUrl} size="sm">Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        {tab.remotes.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-xs">
            No remotes configured
          </div>
        )}
        {tab.remotes.map((remote) => (
          <div key={remote.name} className="border-b px-3 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Globe className="h-4 w-4 text-primary shrink-0" />
              <span className="font-semibold text-sm">{remote.name}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2.5">
              <Link className="h-3.5 w-3.5 shrink-0" />
              <span className="font-mono truncate">{remote.url}</span>
            </div>
            {remote.push_url && remote.push_url !== remote.url && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2.5">
                <Link className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono truncate">Push: {remote.push_url}</span>
              </div>
            )}
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => fetchRemote(remote.name)} className="gap-1.5 h-7 text-xs px-2.5">
                <ArrowDownToLine className="h-3.5 w-3.5" /> Fetch
              </Button>
              <Button variant="outline" size="sm" onClick={() => pullRemote(remote.name)} className="gap-1.5 h-7 text-xs px-2.5">
                <RotateCcw className="h-3.5 w-3.5" /> Pull
              </Button>
              <Button variant="outline" size="sm" onClick={() => pushRemote(remote.name)} className="gap-1.5 h-7 text-xs px-2.5">
                <ArrowUpFromLine className="h-3.5 w-3.5" /> Push
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveRemote(remote.name)}
                className="gap-1.5 h-7 text-xs px-2.5 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </div>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
