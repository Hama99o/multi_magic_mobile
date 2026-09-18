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

const PREFIX = "mm-draft:";

export function useDraft(conversationId: number | null) {
  const [draft, setDraft] = useState("");
  /**
   * Until the stored draft has been read, an empty `draft` means "not loaded
   * yet" rather than "the user cleared it" — writing during that window would
   * erase the very thing being restored.
   */
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    setDraft("");
    if (conversationId == null) return;

    let cancelled = false;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(`${PREFIX}${conversationId}`);
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
  }, [conversationId]);

  useEffect(() => {
    if (conversationId == null || !loaded.current) return;

    const key = `${PREFIX}${conversationId}`;
    void (async () => {
      try {
        if (draft) await AsyncStorage.setItem(key, draft);
        else await AsyncStorage.removeItem(key);
      } catch {
        // Nothing to do — the draft is still in state for this session.
      }
    })();
  }, [draft, conversationId]);

  /** Called once the question is safely posted. */
  const clear = useCallback(() => setDraft(""), []);

  return { draft, setDraft, clear };
}
