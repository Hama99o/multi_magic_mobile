/**
 * Forgot password (audit 2026-11-16 #12): the "sent" state says what happens
 * without sending the person to the web. An in-app reset form is not built
 * (the link in the email sets the password), so the line promises nothing
 * more than that.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import i18n from "@/i18n";

jest.mock("expo-router", () => ({ router: { replace: jest.fn(), back: jest.fn() }, Link: ({ children }: { children: unknown }) => children }));
const mockReset = jest.fn(async () => undefined);
jest.mock("@/api/auth", () => ({ requestPasswordReset: (...a: unknown[]) => mockReset(...(a as [])) }));

/* eslint-disable import/first */
import ForgotPassword from "../forgot-password";

it.each(["en", "fr"])("the sent state (%s) does not point at the web", async (lang) => {
  await i18n.changeLanguage(lang);
  render(<ForgotPassword />);
  fireEvent.changeText(screen.getByTestId("forgot-password-email"), "qa@example.test");
  fireEvent.press(screen.getByTestId("forgot-password-submit"));
  expect(await screen.findByTestId("forgot-password-sent")).toBeTruthy();
  expect(screen.queryByText(/web|site/i)).toBeNull();
  await i18n.changeLanguage("en");
});
