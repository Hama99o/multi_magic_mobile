/**
 * WHERE A CHIP TAKES YOU — his: *"when there is no ai model token it should
 * not redirect to web but mobile page."*
 *
 * The bug this pins: the missing-API-key reply attaches
 * `links: [{ key: "ai_keys" }]` (`rag_chat_job.rb:91`), and every chip opened
 * the preview sheet whose only offer is a BROWSER — for a screen this app has
 * (`app/ai-keys.tsx`). So the one link the assistant sends when it cannot
 * answer was the one link that left the app.
 *
 * Both halves are asserted, because either alone is a weaker claim than it
 * looks: that a mapped key navigates AND does not open the sheet, and that an
 * unmapped key still opens the sheet and does NOT navigate. A test that only
 * checked the first would pass on a version that navigates for everything and
 * sends a note to a screen that does not exist.
 */
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { SourceSheet, useOpenSource } from "../SourceSheet";
import type { MessageLink } from "@/api/ai";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));

/** The chip and the sheet, wired exactly as `app/chat.tsx` wires them. */
function Host({ link }: { link: MessageLink }) {
  const { openSource, openLink, closeSource } = useOpenSource();
  return (
    <>
      <Pressable testID="chip" onPress={() => openLink(link)}>
        <Text>{link.label}</Text>
      </Pressable>
      <SourceSheet source={openSource} onClose={closeSource} />
    </>
  );
}

const aiKeys: MessageLink = { label: "AI keys", path: "/profile/me/api-keys", key: "ai_keys" };
const note: MessageLink = { label: "Groceries", path: "/notes/7", key: "note" };

beforeEach(() => mockPush.mockClear());

describe("a link this app has a screen for", () => {
  it("opens that screen instead of the browser", () => {
    render(<Host link={aiKeys} />);
    fireEvent.press(screen.getByTestId("chip"));
    expect(mockPush).toHaveBeenCalledWith("/ai-keys");
  });

  it("does not open the sheet, so nothing offers the web route", () => {
    render(<Host link={aiKeys} />);
    fireEvent.press(screen.getByTestId("chip"));
    expect(screen.queryByTestId("source-sheet")).toBeNull();
  });
});

describe("a link only the web has", () => {
  it("still opens the preview sheet", () => {
    render(<Host link={note} />);
    fireEvent.press(screen.getByTestId("chip"));
    expect(screen.getByTestId("source-sheet")).toBeTruthy();
    expect(screen.getByTestId("source-sheet-open")).toBeTruthy();
  });

  it("never navigates to a screen this app does not have", () => {
    render(<Host link={note} />);
    fireEvent.press(screen.getByTestId("chip"));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

it("a link with no key at all falls back to the sheet", () => {
  render(<Host link={{ label: "Something", path: "/x/1", key: null }} />);
  fireEvent.press(screen.getByTestId("chip"));
  expect(mockPush).not.toHaveBeenCalled();
  expect(screen.getByTestId("source-sheet")).toBeTruthy();
});
