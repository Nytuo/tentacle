import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(seconds: number): string {
  const date = new Date(seconds * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 365) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatFullDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + "...";
}

export const LANE_COLORS = [
  "var(--color-lane-0)",
  "var(--color-lane-1)",
  "var(--color-lane-2)",
  "var(--color-lane-3)",
  "var(--color-lane-4)",
  "var(--color-lane-5)",
  "var(--color-lane-6)",
  "var(--color-lane-7)",
];

export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

export function statusColor(status: string): string {
  switch (status) {
    case "added":
    case "untracked":
      return "var(--color-added)";
    case "deleted":
      return "var(--color-deleted)";
    case "modified":
      return "var(--color-modified)";
    case "renamed":
      return "var(--color-renamed)";
    case "conflicted":
      return "var(--color-conflicted)";
    default:
      return "var(--color-muted-foreground)";
  }
}

export function statusIcon(status: string): string {
  switch (status) {
    case "added": return "A";
    case "deleted": return "D";
    case "modified": return "M";
    case "renamed": return "R";
    case "untracked": return "U";
    case "conflicted": return "C";
    default: return "?";
  }
}
