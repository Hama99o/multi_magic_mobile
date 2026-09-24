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
