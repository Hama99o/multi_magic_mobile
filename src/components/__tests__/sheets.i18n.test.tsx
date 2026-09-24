/**
 * THE SHEETS IN FRENCH: conversations, profile (and each pane inside it), and
 * a source. The largest gap in `screens.render.test.tsx`'s "not swept" list,
 * and where much of his reading happens: the source sheet is what he opens
 * to decide whether to believe an answer.
 *
 * The same two checks as the screens (`src/__tests__/i18nSweep.ts`): no
 * English-only word, and nothing byte-identical between the English and
 * French renders beyond the shared allowlist. Each case waits on named
 * content before sweeping, because a sweep of a half-loaded sheet is green
 * for anything (TESTING.md §19).
 *
 * And the dialogs a row menu opens (rename, instructions, scope, delete),
 * plus the thumbs-down reason dialog.
 *
 * The conversations sheet's FAILED load is swept too, at the end of this file.
 * NOT SWEPT here: loading states, and the delete confirm's server error, whose
 * text is the server's own sentence.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() } }));

/* eslint-disable import/first */
import i18n from "@/i18n";
import { testQueryClient } from "@/__tests__/queryClient";
import { englishIn, fixtureStripper, identicalIn, renderedStrings } from "@/__tests__/i18nSweep";
import { SessionsSheet } from "../sessions/SessionsSheet";
import { ProfileSheet } from "../settings/ProfileSheet";
import { SourceSheet } from "../chat/SourceSheet";
import { RenameDialog } from "../sessions/RenameDialog";
import { InstructionsDialog, ScopeDialog } from "../sessions/SessionOptionsDialogs";
import { DeleteConfirm } from "../sessions/DeleteConfirm";
import { FeedbackReasonDialog } from "../chat/FeedbackReasonDialog";
import { sessionsApi, type AiSession } from "@/api/ai";
import { useAuthStore } from "@/stores/auth.store";

const strip = fixtureStripper(__filename);

const SESSION: AiSession = {
  id: 4, title: "Budget maison", messageCount: 12, documentCount: 3,
  createdAt: "2026-09-01T09:00:00Z", updatedAt: new Date().toISOString(),
  instructions: null, apps: [], remember: true,
};

beforeEach(() => {
  jest.spyOn(sessionsApi, "list").mockResolvedValue([SESSION]);
  useAuthStore.setState({
    user: { id: 7, email: "qa@example.test", firstName: "Qa", lastName: "Mobile", fullName: "Qa Mobile", avatar: null },
    status: "signedIn",
    signedOutReason: null,
  });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await i18n.changeLanguage("en");
});

interface Case {
  name: string;
  element: () => ReactElement;
  /** Waited for before anything is swept: a handle, then any step to open. */
  ready: string;
  /** Opens a pane or menu inside the sheet, then names what must be on it. */
  open?: { press: () => void; shows: string };
}

const noop = () => {};
const CASES: Case[] = [
  {
    name: "the conversations sheet",
    element: () => <SessionsSheet visible activeId={4} onClose={noop} onOpenSession={noop} />,
    ready: "session-row-4",
  },
  {
    name: "a conversation's row menu",
    element: () => <SessionsSheet visible activeId={4} onClose={noop} onOpenSession={noop} />,
    ready: "session-menu-4",
    open: { press: () => fireEvent.press(screen.getByTestId("session-menu-4")), shows: "session-menu-remember" },
  },
  {
    name: "the profile menu",
    element: () => <ProfileSheet visible onClose={noop} onSignOut={noop} userId={7} />,
    ready: "profile-open-language",
  },
  ...(["language", "theme", "dictation"] as const).map((pane) => ({
    name: `the profile menu's ${pane} pane`,
    element: () => <ProfileSheet visible onClose={noop} onSignOut={noop} userId={7} />,
    ready: `profile-open-${pane}`,
    open: {
      press: () => fireEvent.press(screen.getByTestId(`profile-open-${pane}`)),
      shows: `profile-${pane}-pane`,
    },
  })),
  {
    name: "the rename dialog",
    element: () => <RenameDialog visible initialTitle="Budget maison" onCancel={noop} onSave={noop} />,
    ready: "rename-dialog",
  },
  {
    name: "the instructions dialog",
    element: () => <InstructionsDialog visible initial="" onCancel={noop} onSave={noop} />,
    ready: "instructions-input",
  },
  {
    name: "the scope dialog",
    // One app chosen, so "search everything" (scope-all) renders too.
    element: () => <ScopeDialog visible initial={["notes"]} onCancel={noop} onSave={noop} />,
    ready: "scope-all",
  },
  {
    name: "the delete confirm, with files",
    element: () => <DeleteConfirm visible fileCount={3} onCancel={noop} onConfirm={noop} />,
    ready: "delete-conversation-question",
  },
  {
    name: "the thumbs-down reason dialog",
    element: () => <FeedbackReasonDialog visible onSkip={noop} onSend={noop} />,
    ready: "feedback-reason",
  },
  {
    name: "a source",
    element: () => (
      <SourceSheet source={{ label: "Loyer septembre", path: "/notes/12", key: "note" }} onClose={noop} />
    ),
    ready: "source-sheet",
  },
];

async function collect(c: Case, language: "fr" | "en"): Promise<string[]> {
  await i18n.changeLanguage(language);
  const view = render(<QueryClientProvider client={testQueryClient()}>{c.element()}</QueryClientProvider>);
  await screen.findByTestId(c.ready);
  if (c.open) {
    c.open.press();
    await screen.findByTestId(c.open.shows);
  }
  const strings = renderedStrings();
  view.unmount();
  return strings;
}

describe.each(CASES)("$name", (c) => {
  it("renders no English prose in French", async () => {
    const strings = await collect(c, "fr");
    expect(strings.length).toBeGreaterThanOrEqual(2);
    expect(englishIn(strings, strip)).toEqual([]);
  });

  it("renders nothing byte-identical in English and French, beyond the allowlist", async () => {
    const fr = await collect(c, "fr");
    const en = await collect(c, "en");
    expect(identicalIn(fr, en, strip)).toEqual([]);
  });
});

// ── THE FAILED BRANCH ────────────────────────────────────────────────────
// A conversation list that does not arrive says so (316b98c), and in the
// reader's language, whether the server failed or the network did.
describe("the conversations sheet, when its list fails", () => {
  const failing: Case = {
    name: "failed",
    element: () => <SessionsSheet visible activeId={4} onClose={noop} onOpenSession={noop} />,
    ready: "sessions-load-failed",
  };
  it.each([
    ["a server error", new Error("down")],
    ["no network", Object.assign(new Error("Network Error"), { isAxiosError: true })],
  ])("says so in French, for %s", async (_kind, error) => {
    jest.spyOn(sessionsApi, "list").mockRejectedValue(error);
    const fr = await collect(failing, "fr");
    const en = await collect(failing, "en");
    expect(englishIn(fr, strip)).toEqual([]);
    expect(identicalIn(fr, en, strip)).toEqual([]);
  });
});

