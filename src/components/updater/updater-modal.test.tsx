import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { AppProvider, useApp } from "@/stores/app-store";
import { UpdaterModal } from "@/components/updater/updater-modal";
import * as api from "@/lib/api";

const mockInvoke = vi.mocked(invoke);

const UPDATE: api.UpdateInfo = {
  version: "0.2.0",
  current_version: "0.1.0",
  body: "### Features\n- auto-updates",
  date: "2026-09-13T12:00:00Z",
};

function Restored({ autoCheck }: { autoCheck: boolean }) {
  const { dispatch } = useApp();
  useEffect(() => {
    dispatch({ type: "SET_AUTO_CHECK_UPDATES", payload: autoCheck });
    dispatch({ type: "SET_RESTORED" });
  }, [autoCheck, dispatch]);
  return null;
}

function mount(autoCheck = true) {
  render(
    <AppProvider>
      <Restored autoCheck={autoCheck} />
      <UpdaterModal />
    </AppProvider>,
  );
}

async function flush(ms = 3000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("UpdaterModal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInvoke.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("checks after launch and offers an update it finds", async () => {
    mockInvoke.mockImplementation(async cmd => (cmd === "check_for_update" ? UPDATE : undefined));
    mount();

    await flush(2000);
    expect(mockInvoke).not.toHaveBeenCalledWith("check_for_update");

    await flush(1000);
    expect(mockInvoke).toHaveBeenCalledWith("check_for_update");
    expect(screen.getByText("Update available")).toBeInTheDocument();
    expect(screen.getByText("v0.2.0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update now/i })).toBeInTheDocument();
  });

  it("makes no request at launch when automatic checks are off", async () => {
    mount(false);
    await flush(10_000);
    expect(mockInvoke).not.toHaveBeenCalledWith("check_for_update");
  });

  it("stays silent at launch when there is nothing new", async () => {
    mockInvoke.mockImplementation(async () => null);
    mount();
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stays silent at launch when the check fails", async () => {
    mockInvoke.mockImplementation(async () => {
      throw "Update check failed: offline";
    });
    mount();
    await flush();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports 'up to date' for a check the user asked for", async () => {
    mockInvoke.mockImplementation(async () => null);
    mount(false);
    await flush(0);

    await act(async () => {
      api.requestUpdateCheck();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("You're up to date")).toBeInTheDocument();
  });

  it("reports errors for a check the user asked for", async () => {
    mockInvoke.mockImplementation(async () => {
      throw "Update check failed: offline";
    });
    mount(false);
    await flush(0);

    await act(async () => {
      api.requestUpdateCheck();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Couldn't check for updates")).toBeInTheDocument();
    expect(screen.getByText(/offline/)).toBeInTheDocument();
  });
});
