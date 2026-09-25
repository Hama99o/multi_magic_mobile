/**
 * The morning brief switch (`MorningBriefRow.tsx`). What this proves: it
 * shows the SERVER's state and nothing when the server does not say; it
 * writes a real boolean; it says when the first brief comes; a refusal puts
 * the switch back and says why. It cannot prove a brief ever arrives: that
 * is the server's job, and a device's to watch.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";
import { MorningBriefRow } from "../MorningBriefRow";
import { profileApi, type Profile } from "@/api/profile";

const profile = (over: Partial<Profile> = {}): Profile => ({
  id: 7, email: "qa@example.test", lang: "en", firstName: "Qa", lastName: "Mobile", fullName: "Qa Mobile",
  username: "qa", about: null, phoneNumber: null, avatar: null, createdAt: null, aiMorningBrief: false,
  ...over,
});

function renderRow() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <MorningBriefRow />
    </QueryClientProvider>,
  );
}

afterEach(() => jest.restoreAllMocks());

it("shows nothing when the server does not send the setting", async () => {
  const me = jest.spyOn(profileApi, "me").mockResolvedValue(profile({ aiMorningBrief: null }));
  renderRow();
  await waitFor(() => expect(me).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.queryByTestId("ai-keys-brief-switch")).toBeNull();
});

it.each([false, true])("shows the server's state (%s)", async (on) => {
  jest.spyOn(profileApi, "me").mockResolvedValue(profile({ aiMorningBrief: on }));
  renderRow();
  expect((await screen.findByTestId("ai-keys-brief-switch")).props.value).toBe(on);
});

it("turns it on with a real boolean, and says when the first one comes", async () => {
  jest.spyOn(profileApi, "me").mockResolvedValue(profile());
  const update = jest.spyOn(profileApi, "update").mockResolvedValue(profile({ aiMorningBrief: true }));
  renderRow();
  const toggle = await screen.findByTestId("ai-keys-brief-switch");
  await act(async () => {
    fireEvent(toggle, "valueChange", true);
  });
  expect(update).toHaveBeenCalledWith(7, { ai_morning_brief: true });
  expect(await screen.findByTestId("ai-keys-brief-on")).toBeTruthy();
});

it("puts the switch back and says why when the server refuses", async () => {
  jest.spyOn(profileApi, "me").mockResolvedValue(profile());
  jest.spyOn(profileApi, "update").mockRejectedValue({ isAxiosError: true, response: { status: 500 } });
  renderRow();
  const toggle = await screen.findByTestId("ai-keys-brief-switch");
  await act(async () => {
    fireEvent(toggle, "valueChange", true);
  });
  expect(await screen.findByTestId("ai-keys-brief-failed")).toBeTruthy();
  expect(screen.getByTestId("ai-keys-brief-switch").props.value).toBe(false);
});


// A read that started BEFORE the tap and lands AFTER it must not flip the
// switch back (karwan-42's poll/tap rule, 2026-09-25).
it("a profile read in flight when he taps does not flip the switch back", async () => {
  const me = jest.spyOn(profileApi, "me").mockResolvedValue(profile({ aiMorningBrief: false }));
  let saveDone: (p: Profile) => void = () => {};
  jest.spyOn(profileApi, "update").mockImplementation(() => new Promise<Profile>((r) => { saveDone = r; }));
  const client = testQueryClient();
  render(
    <QueryClientProvider client={client}>
      <MorningBriefRow />
    </QueryClientProvider>,
  );
  await screen.findByTestId("ai-keys-brief-switch");

  // A refetch starts, slow, and will answer with the OLD value.
  let staleRead: (p: Profile) => void = () => {};
  me.mockImplementation(() => new Promise<Profile>((r) => { staleRead = r; }));
  void client.invalidateQueries({ queryKey: ["profile"] });
  // The race only exists once that read has really STARTED. The first
  // version tapped before it had, so the plant (no cancel) stayed green: a
  // race test with no race in it.
  await waitFor(() => expect(me).toHaveBeenCalledTimes(2));

  // He taps while it is in flight.
  await act(async () => {
    fireEvent(screen.getByTestId("ai-keys-brief-switch"), "valueChange", true);
  });
  // The stale read lands. React Query notifies on a scheduled tick, so the
  // screen is read after it settles: asserting at once passed without the
  // fix (the cache was already false, the screen not yet redrawn).
  await act(async () => {
    staleRead(profile({ aiMorningBrief: false }));
    await new Promise((r) => setTimeout(r, 30));
  });
  expect(screen.getByTestId("ai-keys-brief-switch").props.value).toBe(true);

  await act(async () => {
    saveDone(profile({ aiMorningBrief: true }));
  });
});
