/**
 * Changing the email (MANIFEST row 25): the password and the new address,
 * then the code sent there. The stored session email — the one the socket
 * signs in with — changes only when the server accepts the code.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));
jest.mock("@/api/http", () => ({ ...jest.requireActual("@/api/http"), setSessionEmail: jest.fn(async () => {}) }));

/* eslint-disable import/first */
import { setSessionEmail } from "@/api/http";
import { profileApi, WrongCurrentPassword, type Profile } from "@/api/profile";
import { EmailChangeRefused, securityApi } from "@/api/security";
import i18n from "@/i18n";
import ChangeEmail from "../change-email";

function renderScreen() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <ChangeEmail />
    </QueryClientProvider>,
  );
}

function fill(email = "new@example.test", password = "pw") {
  fireEvent.changeText(screen.getByTestId("change-email-new"), email);
  fireEvent.changeText(screen.getByTestId("change-email-password"), password);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(profileApi, "me").mockResolvedValue({ id: 8, email: "old@example.test" } as Profile);
});
afterEach(() => jest.restoreAllMocks());

it("will not send until the address looks like one and the password is typed", async () => {
  renderScreen();
  await screen.findByText(/old@example\.test/);
  fill("not-an-email", "pw");
  expect(screen.getByTestId("change-email-send")).toBeDisabled();
  fill("new@example.test", "");
  expect(screen.getByTestId("change-email-send")).toBeDisabled();
});

it("shows a wrong password against the password field", async () => {
  jest.spyOn(securityApi, "requestEmailChange").mockRejectedValue(new WrongCurrentPassword());
  renderScreen();
  fill();
  fireEvent.press(screen.getByTestId("change-email-send"));
  expect(await screen.findByTestId("change-email-password-error")).toHaveTextContent("That password is not right.");
});

it("shows a taken address against the address field", async () => {
  jest.spyOn(securityApi, "requestEmailChange").mockRejectedValue(new EmailChangeRefused("email_taken"));
  renderScreen();
  fill();
  fireEvent.press(screen.getByTestId("change-email-send"));
  expect(await screen.findByTestId("change-email-new-error")).toHaveTextContent("Another account uses that email.");
});

it("changes the stored session email only once the code is accepted", async () => {
  jest.spyOn(securityApi, "requestEmailChange").mockResolvedValue({ expiresInMinutes: 15 });
  const confirm = jest
    .spyOn(securityApi, "confirmEmailChange")
    .mockRejectedValueOnce(new EmailChangeRefused("invalid_code", 4))
    .mockResolvedValueOnce({ email: "new@example.test" });
  renderScreen();
  fill();
  fireEvent.press(screen.getByTestId("change-email-send"));
  expect(await screen.findByTestId("change-email-sent")).toHaveTextContent(/new@example\.test.*15 minutes/);

  fireEvent.changeText(screen.getByTestId("change-email-code"), "111111");
  fireEvent.press(screen.getByTestId("change-email-confirm"));
  expect(await screen.findByTestId("change-email-code-error")).toHaveTextContent(/4 tries left/);
  expect(setSessionEmail).not.toHaveBeenCalled();

  fireEvent.changeText(screen.getByTestId("change-email-code"), "222222");
  fireEvent.press(screen.getByTestId("change-email-confirm"));
  expect(await screen.findByTestId("change-email-done")).toHaveTextContent(/new@example\.test/);
  expect(confirm).toHaveBeenLastCalledWith("222222");
  expect(setSessionEmail).toHaveBeenCalledWith("new@example.test");
});

it("takes digits only, six of them", async () => {
  jest.spyOn(securityApi, "requestEmailChange").mockResolvedValue({ expiresInMinutes: 15 });
  renderScreen();
  fill();
  fireEvent.press(screen.getByTestId("change-email-send"));
  const code = await screen.findByTestId("change-email-code");
  fireEvent.changeText(code, "12a34567");
  await waitFor(() => expect(screen.getByTestId("change-email-code").props.value).toBe("123456"));
});

// Black-box run 2026-11-17: French read "Adresse actuelle:" with no space
// before the colon. The colon belongs to each language, so it is in the string.
it("lets each language punctuate the current address", async () => {
  jest.spyOn(profileApi, "me").mockResolvedValue({ id: 8, email: "qa@example.test" } as Profile);
  await i18n.changeLanguage("fr");
  try {
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("change-email-current")).toHaveTextContent("Adresse actuelle : qa@example.test"));
  } finally {
    await i18n.changeLanguage("en");
  }
});
