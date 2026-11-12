import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { buildAccountSummary } from "@tests/fixtures/account-summary";

import { AccountPanel, type AccountPanelProps } from "./account-panel";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPanel(overrides: Partial<AccountPanelProps> = {}) {
  const props: AccountPanelProps = {
    account: buildAccountSummary({
      displayName: "Ada Lovelace",
      runCount: 1234,
      distanceMeters: 5_678_000,
      cityCount: 4,
    }),
    setVisibilityAction: vi.fn().mockResolvedValue({ status: "success", visibility: "public" }),
    syncAction: vi.fn().mockResolvedValue({ status: "success", syncedRuns: 2 }),
    reconnectAction: vi.fn(),
    signOutAction: vi.fn(),
    deleteDataAction: vi.fn(),
    ...overrides,
  };
  render(<AccountPanel {...props} />);
  return props;
}

describe("AccountPanel", () => {
  it("summarizes the runner with readable stats", () => {
    renderPanel();

    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("5,678")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Globe" })).toHaveAttribute("href", "/globe");
    expect(screen.getByAltText("Powered by Strava")).toBeInTheDocument();
  });

  it("switches visibility optimistically and rolls back on error", async () => {
    const setVisibilityAction = vi.fn().mockResolvedValue({ status: "error", message: "Nope" });
    renderPanel({ setVisibilityAction });
    const group = screen.getByRole("radiogroup", { name: "Profile visibility" });

    await userEvent.click(within(group).getByRole("radio", { name: "Public" }));

    expect(setVisibilityAction).toHaveBeenCalledWith("public");
    await waitFor(() => expect(within(group).getByRole("radio", { name: "Private" })).toBeChecked());
  });

  it("syncs on demand", async () => {
    const props = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(props.syncAction).toHaveBeenCalledOnce();
  });

  it("asks for confirmation before deleting", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Delete…" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Delete all your Cityfil data?");
  });
});
