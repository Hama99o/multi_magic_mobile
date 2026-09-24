/**
 * The composer's draft, kept across a backgrounding.
 *
 * Losing a paragraph somebody has just dictated is the kind of failure people
 * abandon an app over, and a phone is backgrounded constantly — a call, a
 * notification, a glance at something else. Android will also kill the process
 * outright under memory pressure, which is exactly the cheap phone this has to
 * work on.
 *
 * AsyncStorage rather than SecureStore: a draft is not a credential, and
 * SecureStore's keystore round-trip on every keystroke would be felt.
 *
 * Keyed per conversation, so switching sessions does not carry a half-typed
 * question into the wrong one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/stores/auth.store";

const PREFIX = "mm-draft:";

/**
 * KEYED BY WHO IS SIGNED IN as well as by conversation (2026-09-25, the
 * sign-out audit; decided by Hamma9901). A draft is his, so it survives his
 * own sign-out and comes back when he signs in again; but it is his, so no
 * other account's key can ever match it, the way the remembered session is
 * already keyed. With nobody signed in, nothing is read or written.
 */
function keyFor(userId: number, conversationId: number): string {
  return `${PREFIX}${userId}:${conversationId}`;
}

export function useDraft(conversationId: number | null) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  /**
   * The draft is TAGGED with the conversation it belongs to, and the reset on
   * a switch is a DERIVATION rather than an effect.
   *
   * This used to be `useState("")` plus `setDraft("")` at the top of the load
   * effect, which the React Compiler (SDK 57) rejects as a setState inside an
   * effect — rightly: it is a render showing the previous conversation's
   * draft, then a second render to correct it. Tagging removes the correcting
   * render entirely, because a draft belonging to another conversation is
   * simply not this conversation's draft.
   *
   * The behaviour is identical and `useDraft.test.ts` is what says so —
   * eleven tests, four of which re-render with a different conversation,
   * written before this change for exactly that reason.
   */
  // Tagged with the USER too: an account switch while this screen is mounted
  // must not show, or write under the new account's key, the previous
  // account's text for the same conversation id.
  const [held, setHeld] = useState<{ id: number | null; user: number | null; text: string }>({
    id: conversationId,
    user: userId,
    text: "",
  });
  const draft = held.id === conversationId && held.user === userId ? held.text : "";
  const setDraft = useCallback(
    (text: string) => setHeld({ id: conversationId, user: userId, text }),
    [conversationId, userId],
  );

  /**
   * Until the stored draft has been read, an empty `draft` means "not loaded
   * yet" rather than "the user cleared it" — writing during that window would
   * erase the very thing being restored.
   */
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    if (conversationId == null || userId == null) return;

    let cancelled = false;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(keyFor(userId, conversationId));
        if (!cancelled && stored) setDraft(stored);
      } catch {
        // A draft that cannot be read is an empty composer, which is where the
        // user would have been anyway.
      } finally {
        if (!cancelled) loaded.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
    // `setDraft` is a `useCallback` over `conversationId`, so its identity
    // changes exactly when this effect already re-runs. Listing it satisfies
    // exhaustive-deps without widening what re-runs this.
  }, [conversationId, userId, setDraft]);

  useEffect(() => {
    if (conversationId == null || userId == null || !loaded.current) return;

    const key = keyFor(userId, conversationId);
    void (async () => {
      try {
        if (draft) await AsyncStorage.setItem(key, draft);
        else await AsyncStorage.removeItem(key);
      } catch {
        // Nothing to do — the draft is still in state for this session.
      }
    })();
  }, [draft, conversationId, userId]);

  /** Called once the question is safely posted. */
  const clear = useCallback(() => setDraft(""), [setDraft]);

  return { draft, setDraft, clear };
}
