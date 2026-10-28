import { usePersistence } from "@/hooks/use-persistence";

export function PersistenceProvider() {
  usePersistence();
  return null;
}
