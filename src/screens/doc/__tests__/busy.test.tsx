/**
 * "Server busy" (Hello, 2026-11-21): when the server's one-at-a-time lock
 * makes a job wait too long it answers 503 {reason:"busy"}. The phone says
 * so in plain words, in both languages, and offers Retry. Any other failure
 * keeps its own wording and no Retry. The screen half (Retry runs the same
 * job and its result shows) is in `app/__tests__/doc.test.tsx`.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import "react-native-gesture-handler/jestSetup";

import i18n from "@/i18n";
import { DocError } from "@/api/doc";
import { ErrorLine } from "../ui";

afterEach(() => act(() => void i18n.changeLanguage("en")));

describe("ErrorLine", () => {
  it.each([
    ["en", "Server busy, try again in a moment."],
    ["fr", "Serveur occupé, réessayez dans un instant."],
  ])("busy says so in %s and offers Retry, which runs the job again", async (lang, words) => {
    await act(() => i18n.changeLanguage(lang));
    const onRetry = jest.fn();
    render(<ErrorLine error={new DocError("busy")} onRetry={onRetry} />);
    expect(screen.getByText(words)).toBeTruthy();
    fireEvent.press(screen.getByTestId("doc-error-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("another failure offers no Retry", () => {
    render(<ErrorLine error={new DocError("locked")} onRetry={jest.fn()} />);
    expect(screen.queryByTestId("doc-error-retry")).toBeNull();
  });
});
