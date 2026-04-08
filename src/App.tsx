import { AppProvider } from "@/stores/app-store";
import { AppLayout } from "@/components/layout/app-layout";
import { PersistenceProvider } from "@/components/persistence-provider";

export default function App() {
  return (
    <AppProvider>
      <PersistenceProvider />
      <AppLayout />
    </AppProvider>
  );
}
