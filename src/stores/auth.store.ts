/**
 * Who is signed in, and the one place a 401 turns into a signed-out app.
 *
 * `http.ts` cannot import this (the store imports the API, not the other way
 * round), so the 401 handler is INJECTED. `wireAuthStore` is called once at
 * boot — if it is not, a 401 clears the token and nothing else happens, and the
 * app sits on a conversation that silently fails every request.
 */
import { create } from "zustand";
import {
  signIn as apiSignIn,
  signOut as apiSignOut,
  verifyTwoFactor as apiVerifyTwoFactor,
  TwoFactorRequiredError,
  type CurrentUser,
} from "@/api/auth";
import { setUnauthorizedHandler, type SessionEndReason } from "@/api/http";
import { resetCable } from "@/lib/cable";
import { t } from "@/i18n";

/**
 * What the sign-in screen says after a FORCED sign-out — one sentence per
 * reason, and they ask for different things. "Expired" asks nothing; "revoked"
 * is the fingerprint check or another device, and the person should know that
 * something other than time ended their session.
 */
export function sessionEndSentence(reason: SessionEndReason): string {
  return t(`session.${reason}`);
}

interface AuthState {
  user: CurrentUser | null;
  status: "unknown" | "signedIn" | "signedOut";
  /**
   * Why the last sign-out was FORCED, for the sign-in screen to say. Null after
   * a deliberate sign-out and after the next successful sign-in — a sentence
   * about a session that ended yesterday must not greet a sign-out made on
   * purpose today.
   */
  signedOutReason: SessionEndReason | null;
  /**
   * The pre-auth token from a 2FA login, waiting for the six digits. Null
   * whenever no code is outstanding — the verify screen sends somebody back to
   * sign-in rather than asking for a code it could not spend, which is the
   * web's own guard (`TwoFactorVerify.tsx:32-36`).
   */
  pendingTwoFactor: string | null;
  signIn: (params: { email: string; password: string }) => Promise<void>;
  /** Spend the emailed code. Throws if there is nothing pending. */
  verifyTwoFactor: (code: string) => Promise<void>;
  /** Abandon a pending code — leaving sign-in, or signing out. */
  clearTwoFactor: () => void;
  signOut: () => Promise<void>;
  /** Called by the 401 interceptor, with the reason. Never by a screen. */
  forceSignOut: (reason: SessionEndReason) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "unknown",
  signedOutReason: null,
  pendingTwoFactor: null,

  signIn: async (params) => {
    try {
      const user = await apiSignIn(params);
      set({ user, status: "signedIn", signedOutReason: null, pendingTwoFactor: null });
    } catch (e) {
      // The code is already in his inbox by the time this throws, so the token
      // is kept HERE rather than handed to the screen: a screen that owns it
      // loses it on a remount, and the server has already revoked the previous
      // JWT (`sessions_controller.rb:29`) — there is no going back to ask again
      // without a second email.
      if (e instanceof TwoFactorRequiredError) set({ pendingTwoFactor: e.preAuthToken });
      throw e;
    }
  },

  verifyTwoFactor: async (code) => {
    const pending = useAuthStore.getState().pendingTwoFactor;
    if (!pending) throw new Error("No pending two-factor session");
    const user = await apiVerifyTwoFactor({ preAuthToken: pending, code });
    set({ user, status: "signedIn", signedOutReason: null, pendingTwoFactor: null });
  },

  clearTwoFactor: () => set({ pendingTwoFactor: null }),

  signOut: async () => {
    await apiSignOut();
    // The socket carries the token in its URL, so it must go too — otherwise it
    // stays open authenticated as the person who just left.
    resetCable();
    set({ user: null, status: "signedOut", signedOutReason: null, pendingTwoFactor: null });
  },

  forceSignOut: (reason) => {
    resetCable();
    set({ user: null, status: "signedOut", signedOutReason: reason, pendingTwoFactor: null });
  },
}));

export function wireAuthStore(): void {
  setUnauthorizedHandler((reason) => useAuthStore.getState().forceSignOut(reason));
}
