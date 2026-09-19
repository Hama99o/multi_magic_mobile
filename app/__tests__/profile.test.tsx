/**
 * THE PROFILE SCREEN'S FAILURE LINE — and the confirmation it must replace.
 *
 * `qa/UNWALKED.md` §3. `profile-error` was named by no flow and no test.
 * `13-profile` reaches this screen, edits About, saves, and asserts
 * `profile-saved` — it took five runs and four flow defects to get there, and
 * it only ever exercises the path where the server says yes. Making the save
 * FAIL on a device means breaking the backend or the network mid-run, which is
 * why nobody has seen this line.
 *
 * ── WHY IT IS AN if/else AND WHY THAT MATTERS ─────────────────────────────
 * `profile-error` and `profile-saved` are branches of one conditional, so a
 * failure REPLACES the confirmation. That is the assertion worth holding: if
 * they could ever render together, a person would read "Saved." beside a red
 * line and believe the first one, because it is the one they were expecting.
 * `13-profile`'s own value is that it re-enters the screen to read About back
 * from the server — which is the check that a confirmation was telling the
 * truth. Nothing did the same for a failure.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
}));

/* eslint-disable import/first */
import { profileApi, type Profile } from "@/api/profile";
import ProfileScreen from "../profile";

const profile = (over: Partial<Profile> = {}): Profile =>
  ({
    id: 8,
    email: "qa@example.test",
    lang: "en",
    firstName: "Qa",
    lastName: "Mobile",
    fullName: "Qa Mobile",
    username: null,
    ...over,
  }) as Profile;

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

async function editAndSave() {
  await waitFor(() => expect(screen.getByTestId("profile-about")).toBeTruthy());
  fireEvent.changeText(screen.getByTestId("profile-about"), "Renovating the flat.");
  fireEvent.press(screen.getByTestId("profile-save"));
}

describe("a profile save that the server refuses", () => {
  it("says so, rather than leaving the screen looking unchanged", async () => {
    jest.spyOn(profileApi, "me").mockResolvedValue(profile());
    jest.spyOn(profileApi, "update").mockRejectedValue(new Error("boom"));

    renderScreen();
    await editAndSave();

    await waitFor(() => expect(screen.getByTestId("profile-error")).toBeTruthy());
  });

  it("does NOT also say Saved, after a save that DID work", async () => {
    /**
     * ── TWO DRAFTS OF THIS WERE WRONG, AND THE SECOND ONE TAUGHT ME MORE ───
     * The first failed ONE save and asserted `profile-saved` was absent. It
     * passed for the wrong reason: `saved` had never been true, so nothing
     * would have rendered it whatever the conditional looked like. Planting a
     * structure where both CAN render left it green — `docs/TESTING.md` §11.
     *
     * So this became a save that works followed by one that does not, since
     * `onFailed` sets the failure and does NOT clear `saved`. **That plant
     * stayed green too**, and the reason is worth more than the test: the
     * invariant is guarded TWICE and independently. The `if/else` puts the
     * failure first, AND the Save button's own handler calls `setSaved(false)`
     * before it mutates, so `saved` is already down by the time a failure
     * arrives.
     *
     * Either guard alone holds. It fails only when BOTH are gone, which is what
     * this asserts — and that is the honest claim, not "the if/else is the only
     * thing keeping them apart". Worth knowing for whoever refactors one of
     * them: removing either is safe today, and removing either makes the other
     * load-bearing without anything saying so.
     *
     * What it protects is real. A person who has just pressed Save is looking
     * for the confirmation and would read it first, beside a red line.
     */
    jest.spyOn(profileApi, "me").mockResolvedValue(profile());
    const update = jest
      .spyOn(profileApi, "update")
      .mockResolvedValueOnce(profile())
      .mockRejectedValue(new Error("boom"));

    renderScreen();
    await editAndSave();
    await waitFor(() => expect(screen.getByTestId("profile-saved")).toBeTruthy());

    fireEvent.changeText(screen.getByTestId("profile-about"), "Something else.");
    fireEvent.press(screen.getByTestId("profile-save"));

    await waitFor(() => expect(screen.getByTestId("profile-error")).toBeTruthy());
    expect(screen.queryByTestId("profile-saved")).toBeNull();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("keeps what was typed, so a failed save is not also lost work", async () => {
    jest.spyOn(profileApi, "me").mockResolvedValue(profile());
    jest.spyOn(profileApi, "update").mockRejectedValue(new Error("boom"));

    renderScreen();
    await editAndSave();

    await waitFor(() => expect(screen.getByTestId("profile-error")).toBeTruthy());
    expect(screen.getByTestId("profile-about").props.value).toBe("Renovating the flat.");
  });
});

describe("a profile save the server accepts", () => {
  it("confirms, and shows no failure line", async () => {
    jest.spyOn(profileApi, "me").mockResolvedValue(profile());
    jest
      .spyOn(profileApi, "update")
      .mockResolvedValue(profile({ firstName: "Qa" }));

    renderScreen();
    await editAndSave();

    await waitFor(() => expect(screen.getByTestId("profile-saved")).toBeTruthy());
    expect(screen.queryByTestId("profile-error")).toBeNull();
  });

  it("clears an earlier failure once a later save works", async () => {
    // Otherwise the red line outlives the problem and the person distrusts a
    // save that succeeded.
    jest.spyOn(profileApi, "me").mockResolvedValue(profile());
    const update = jest
      .spyOn(profileApi, "update")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(profile());

    renderScreen();
    await editAndSave();
    await waitFor(() => expect(screen.getByTestId("profile-error")).toBeTruthy());

    fireEvent.press(screen.getByTestId("profile-save"));

    await waitFor(() => expect(screen.getByTestId("profile-saved")).toBeTruthy());
    expect(screen.queryByTestId("profile-error")).toBeNull();
    expect(update).toHaveBeenCalledTimes(2);
  });
});
