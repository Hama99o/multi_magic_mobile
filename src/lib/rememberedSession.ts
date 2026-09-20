/**
 * Which session this device was last talking in.
 *
 * `GET /api/v1/ai/conversation` returns the server's idea of "current" — the
 * one most recently talked in, across every client. That is the right default
 * on a FIRST launch and the wrong one afterwards: a question asked from the
 * laptop would silently move the phone to a different conversation.
 *
 * So the web remembers a per-user choice (`mm:aiSession:v1:<userId>`) and only
 * falls back to the server's answer when it has none. This is the same key
 * shape, deliberately, so the two behave alike.
 *
 * ── AND THIS IS ONLY HALF OF WHAT THE WEB DOES ───────────────────────────
 * Read on before you conclude the two are at parity, because for a week this
 * header stopped here and that is why nobody noticed the other half.
 *
 * The web's `selectSession` writes the local key AND calls
 * `POST /ai/sessions/:id/activate`. Its own comment says why: *"localStorage
 * opens the right chat instantly in this browser; the server is what makes
 * the same chat open on the phone."* This file is the FIRST half. The second
 * lives in `app/chat.tsx`'s `chooseSession`, which calls
 * `sessionsApi.activate`, and the two are one change — a device that
 * remembers locally and never tells the server is a device that quietly
 * disagrees with every other one.
 *
 * Everything above was TRUE and it made the gap invisible, which is a worse
 * failure than being wrong: a false comment gets corrected the first time
 * somebody checks it, and a true one that stops early gets believed.
 * `docs/SESSION_PARITY.md` is the audit that found it.
 *
 * Keyed BY USER: a shared phone must not open somebody else's conversation, and
 * the id alone would do exactly that.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const key = (userId: number) => `mm:aiSession:v1:${userId}`;

export async function loadRememberedSession(userId: number): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return null;
    const id = Number(raw);
    // A non-numeric or zero value is corruption, not a session.
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function rememberSession(userId: number, sessionId: number): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), String(sessionId));
  } catch {
    // The choice still holds for this launch; it is a convenience, not state.
  }
}

export async function forgetSession(userId: number): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(userId));
  } catch {
    // Nothing to do.
  }
}
