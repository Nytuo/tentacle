import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
  emit: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => ({
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  })),
}));
