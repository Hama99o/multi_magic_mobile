/**
 * The new-password minimum is the server's, and the server's is the web's: 8
 * (multi_magic PR #31, `config.password_length = 8..128`). Seven is refused
 * on the phone before any request; eight is allowed.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));

/* eslint-disable import/first */
import { profileApi, type Profile } from "@/api/profile";
import ChangePassword from "../change-password";

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <ChangePassword />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.spyOn(profileApi, "me").mockResolvedValue({ id: 8, email: "qa@example.test" } as Profile);
});
afterEach(() => jest.restoreAllMocks());

function fill(next: string) {
  fireEvent.changeText(screen.getByTestId("password-current"), "the-old-one");
  fireEvent.changeText(screen.getByTestId("password-new"), next);
  fireEvent.changeText(screen.getByTestId("password-confirm"), next);
}

it("says the minimum is 8", async () => {
  renderScreen();
  expect(await screen.findByText("At least 8 characters.")).toBeTruthy();
});

it("will not send 7 characters", async () => {
  const change = jest.spyOn(profileApi, "changePassword");
  renderScreen();
  await screen.findByTestId("password-new");
  fill("Abcdef7");
  expect(screen.getByTestId("password-save")).toBeDisabled();
  fireEvent.press(screen.getByTestId("password-save"));
  expect(change).not.toHaveBeenCalled();
});

it("sends 8", async () => {
  const change = jest.spyOn(profileApi, "changePassword").mockResolvedValue(undefined as never);
  renderScreen();
  await screen.findByTestId("password-new");
  fill("Abcdefg8");
  await waitFor(() => expect(screen.getByTestId("password-save")).not.toBeDisabled());
  fireEvent.press(screen.getByTestId("password-save"));
  await waitFor(() => expect(change).toHaveBeenCalledWith(8, expect.objectContaining({ password: "Abcdefg8" })));
});
