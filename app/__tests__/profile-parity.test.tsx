/** Your profile's additions (MANIFEST rows 2, 3, 4, 25 and the links): username, birth date, cover, email change, and the rows to the new screens. */
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true })),
}));

/* eslint-disable import/first */
import { router } from "expo-router";
import { profileApi, type Profile } from "@/api/profile";
import { birthDateProblem } from "@/lib/birthDate";
import ProfileScreen from "../profile";

const profile = (over: Partial<Profile> = {}): Profile =>
  ({ id: 8, email: "qa@example.test", firstName: "Qa", lastName: "Mobile", fullName: "Qa Mobile", username: "qamobile", birthDate: null, followersCount: 2, followingCount: 5, ...over }) as Profile;

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <ProfileScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(profileApi, "me").mockResolvedValue(profile());
});
afterEach(() => jest.restoreAllMocks());

it("checks a birth date is a real YYYY-MM-DD, and not in the future", () => {
  const today = new Date("2026-11-17T12:00:00Z");
  expect(birthDateProblem("", today)).toBeNull();
  expect(birthDateProblem("1990-02-28", today)).toBeNull();
  expect(birthDateProblem("2026-11-17", today)).toBeNull();
  expect(birthDateProblem("1990-02-30", today)).toBe("format");
  expect(birthDateProblem("28/02/1990", today)).toBe("format");
  // Black-box run 2026-11-17: 2099-01-01 was saved and kept after a relaunch.
  expect(birthDateProblem("2026-11-18", today)).toBe("future");
  expect(birthDateProblem("2099-01-01", today)).toBe("future");
});

it("will not save a birth date in the future, and says why", async () => {
  renderScreen();
  fireEvent.changeText(await screen.findByTestId("profile-birthdate"), "2099-01-01");
  expect(screen.getByTestId("profile-birthdate-error")).toHaveTextContent(/future/);
  expect(screen.getByTestId("profile-save")).toBeDisabled();
});

// Black-box run 2026-11-17: a refused username's error stayed after the field
// was put right, and Save (disabled once nothing differs) could not clear it.
it("drops the last save's error and 'Saved' as soon as a field is edited", async () => {
  const update = jest
    .spyOn(profileApi, "update")
    .mockRejectedValueOnce(Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status: 422, data: { errors: ["Username only allows letters and numbers"] } } }));
  renderScreen();
  fireEvent.changeText(await screen.findByTestId("profile-username"), "a.b");
  fireEvent.press(screen.getByTestId("profile-save"));
  await waitFor(() => expect(update).toHaveBeenCalled());
  expect(await screen.findByTestId("profile-error")).toBeTruthy();
  fireEvent.changeText(screen.getByTestId("profile-username"), "qamobile");
  expect(screen.queryByTestId("profile-error")).toBeNull();
});

it("saves the username and birth date with the rest", async () => {
  const update = jest.spyOn(profileApi, "update").mockResolvedValue(profile({ username: "newname", birthDate: "1990-02-28" }));
  renderScreen();
  fireEvent.changeText(await screen.findByTestId("profile-username"), "newname");
  fireEvent.changeText(screen.getByTestId("profile-birthdate"), "1990-02-28");
  fireEvent.press(screen.getByTestId("profile-save"));
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(8, expect.objectContaining({ username: "newname", birth_date: "1990-02-28" })),
  );
});

it("will not save a date that does not exist", async () => {
  renderScreen();
  fireEvent.changeText(await screen.findByTestId("profile-birthdate"), "1990-02-30");
  expect(screen.getByTestId("profile-birthdate-error")).toBeTruthy();
  expect(screen.getByTestId("profile-save")).toBeDisabled();
});

it("opens each new screen from its row, and the followers counts are on the rows", async () => {
  renderScreen();
  fireEvent.press(await screen.findByTestId("profile-change-email"));
  fireEvent.press(screen.getByTestId("profile-security"));
  fireEvent.press(screen.getByTestId("profile-api-keys"));
  fireEvent.press(screen.getByTestId("profile-connect-claude"));
  fireEvent.press(screen.getByTestId("profile-followers"));
  expect((router.push as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
    "/change-email",
    "/security",
    "/api-keys",
    "/connect-claude",
    "/follows?tab=followers",
  ]);
  expect(screen.getByTestId("profile-followers")).toHaveTextContent("Followers (2)");
  expect(screen.getByTestId("profile-following")).toHaveTextContent("Following (5)");
});

it("offers a cover photo", async () => {
  renderScreen();
  expect(await screen.findByTestId("profile-cover")).toHaveTextContent("Add a cover photo");
});
