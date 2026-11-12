import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { buildAccountSummary } from "@tests/fixtures/account-summary";

import { AdminConsole, type AdminConsoleProps } from "./admin-console";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ada = buildAccountSummary({ id: "aaaaaaaa-0000-4000-8000-000000000000", displayName: "Ada", runCount: 3 });
const bob = buildAccountSummary({
  id: "bbbbbbbb-0000-4000-8000-000000000000",
  displayName: "Bob",
  visibility: "public",
  stravaConnected: false,
  runCount: 7,
});

function renderConsole(overrides: Partial<AdminConsoleProps> = {}) {
  const props: AdminConsoleProps = {
    accounts: [ada, bob],
    setVisibilityAction: vi.fn().mockResolvedValue({ status: "success", message: "ok" }),
    syncAction: vi.fn().mockResolvedValue({ status: "success", syncedRuns: 0 }),
    deleteAction: vi.fn().mockResolvedValue({ status: "success", message: "Account deleted" }),
    signOutAction: vi.fn(),
    ...overrides,
  };
  render(<AdminConsole {...props} />);
  return props;
}

describe("AdminConsole", () => {
  it("shows fleet totals", () => {
    renderConsole();
    const totals = screen.getAllByRole("definition").map((cell) => cell.textContent);
    // Accounts, Public, Runs, Need attention (Bob has no Strava link).
    expect(totals).toEqual(["2", "1", "10", "1"]);
  });

  it("filters accounts as the admin types", async () => {
    renderConsole();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search accounts" }), "bo");

    await waitFor(() => expect(screen.queryByRole("button", { name: /^Ada/ })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^Bob/ })).toBeInTheDocument();
    expect(screen.getByText("1 of 2 accounts")).toBeInTheDocument();
  });

  it("opens an account and acts on it", async () => {
    const props = renderConsole();
    await userEvent.click(screen.getByRole("button", { name: /^Ada/ }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(within(dialog).getByRole("radio", { name: "Public" }));
    expect(props.setVisibilityAction).toHaveBeenCalledWith(ada.id, "public");

    await userEvent.click(within(dialog).getByRole("button", { name: "Force sync" }));
    await waitFor(() => expect(props.syncAction).toHaveBeenCalledWith(ada.id));
  });

  it("cannot sync an account without Strava", async () => {
    renderConsole();
    await userEvent.click(screen.getByRole("button", { name: /^Bob/ }));
    expect(within(await screen.findByRole("dialog")).getByRole("button", { name: "Force sync" })).toBeDisabled();
  });

  it("only deletes after the display name is typed", async () => {
    const props = renderConsole();
    await userEvent.click(screen.getByRole("button", { name: /^Ada/ }));
    const dialog = await screen.findByRole("dialog");
    const deleteButton = within(dialog).getByRole("button", { name: "Delete" });

    expect(deleteButton).toBeDisabled();
    await userEvent.type(within(dialog).getByRole("textbox", { name: /to confirm/ }), "Ada");
    await userEvent.click(deleteButton);

    await waitFor(() => expect(props.deleteAction).toHaveBeenCalledWith(ada.id));
  });
});
