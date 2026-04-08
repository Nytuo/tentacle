import { usePersistence } from "@/hooks/use-persistence";

/** Invisible component that wires up persistence inside AppProvider context. */
export function PersistenceProvider() {
  usePersistence();
  return null;
}
