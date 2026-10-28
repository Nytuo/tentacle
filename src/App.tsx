import { AppProvider } from "@/stores/app-store";
import { AppLayout } from "@/components/layout/app-layout";
import { PersistenceProvider } from "@/components/persistence-provider";
import { PromptHost } from "@/components/ui/prompt-dialog";
import { UpdaterModal } from "@/components/updater/updater-modal";

export default function App() {
  return (
    <AppProvider>
      <PersistenceProvider />
      <AppLayout />
      <PromptHost />
      <UpdaterModal />
    </AppProvider>
  );
}
