/**
 * THE TWO ICONS THAT CHANGE EVERY ANSWER AND SAID NOTHING.
 *
 * A funnel when a conversation is narrowed to some apps, a pen when it carries
 * standing instructions. The component's own comment calls them "settings that
 * change every answer and are otherwise invisible from the list" — and the row
 * carried an EXPLICIT `accessibilityLabel` of title plus counts, which named
 * neither. So for a screen reader they were not merely hard to notice, they
 * were absent: a conversation that silently rewrites every answer announced
 * identically to one that does not.
 *
 * `qa/UNWALKED.md` — `session-scoped-*` and `session-instructed-*` were named
 * by no flow and no test, which is how an icon with no name survives. The
 * handle being an orphan was the receipt for the label being incomplete.
 */
import { render, screen } from "@testing-library/react-native";
import { SessionRow } from "../SessionRow";
import type { AiSession } from "@/api/ai";

const session = (over: Partial<AiSession> = {}): AiSession =>
  ({
    id: 77,
    title: "Flat renovation",
    updatedAt: "2026-09-19T17:00:00Z",
    messageCount: 4,
    documentCount: 0,
    apps: [],
    instructions: null,
    ...over,
  }) as AiSession;

const row = (over: Partial<AiSession> = {}) =>
  render(
    <SessionRow session={session(over)} active={false} onOpen={jest.fn()} onMenu={jest.fn()} />,
  );

describe("what the row tells somebody who cannot see its badges", () => {
  it("names the conversation and its size when there is nothing else to say", () => {
    row();
    expect(screen.getByTestId("session-row-77")).toHaveAccessibleName("Flat renovation, 4 messages");
  });

  it("says the search is NARROWED when the funnel is drawn", () => {
    row({ apps: ["notes", "calendar"] });
    // `getAllBy`, not `getBy`: a lucide icon passes its testID to both its
    // wrapper and the Svg inside it, so the handle resolves to TWO nodes. Worth
    // knowing before a flow tries to tap one — `flow_lint.py` resolves handles
    // against the source and cannot see that the rendered tree has two.
    expect(screen.getAllByTestId("session-scoped-77").length).toBeGreaterThan(0);
    expect(screen.getByTestId("session-row-77")).toHaveAccessibleName(
      "Flat renovation, 4 messages, search narrowed",
    );
  });

  it("says there are STANDING INSTRUCTIONS when the pen is drawn", () => {
    row({ instructions: "Answer in French." });
    expect(screen.getAllByTestId("session-instructed-77").length).toBeGreaterThan(0);
    expect(screen.getByTestId("session-row-77")).toHaveAccessibleName(
      "Flat renovation, 4 messages, standing instructions",
    );
  });

  it("says both when both are set", () => {
    row({ apps: ["notes"], instructions: "Answer in French." });
    expect(screen.getByTestId("session-row-77")).toHaveAccessibleName(
      "Flat renovation, 4 messages, search narrowed, standing instructions",
    );
  });

  it("does not invent a badge that is not there", () => {
    row();
    expect(screen.queryAllByTestId("session-scoped-77")).toHaveLength(0);
    expect(screen.queryAllByTestId("session-instructed-77")).toHaveLength(0);
  });
});
