/**
 * Who is signed in, and the one place a 401 turns into a signed-out app.
 *
 * `http.ts` cannot import this (the store imports the API, not the other way
 * round), so the 401 handler is INJECTED. `wireAuthStore` is called once at
 * boot — if it is not, a 401 clears the token and nothing else happens, and the
 * app sits on a conversation that silently fails every request.
 */
import { create } from "zustand";
import { signIn as apiSignIn, signOut as apiSignOut, type CurrentUser } from "@/api/auth";
import { setUnauthorizedHandler, type SessionEndReason } from "@/api/http";
import { resetCable } from "@/lib/cable";

/**
 * What the sign-in screen says after a FORCED sign-out — one sentence per
 * reason, and they ask for different things. "Expired" asks nothing; "revoked"
 * is the fingerprint check or another device, and the person should know that
 * something other than time ended their session.
 */
export const SESSION_END_SENTENCE: Record<SessionEndReason, string> = {
  expired: "Your session expired. Sign in again to carry on.",
  revoked:
    "MultiMagic no longer recognises this phone's session — it was ended from another device, or the device check did not match. Sign in again to carry on.",
};

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
  signIn: (params: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  /** Called by the 401 interceptor, with the reason. Never by a screen. */
  forceSignOut: (reason: SessionEndReason) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "unknown",
  signedOutReason: null,

  signIn: async (params) => {
    const user = await apiSignIn(params);
    set({ user, status: "signedIn", signedOutReason: null });
  },

  signOut: async () => {
    await apiSignOut();
    // The socket carries the token in its URL, so it must go too — otherwise it
    // stays open authenticated as the person who just left.
    resetCable();
    set({ user: null, status: "signedOut", signedOutReason: null });
  },

  forceSignOut: (reason) => {
    resetCable();
    set({ user: null, status: "signedOut", signedOutReason: reason });
  },
}));

export function wireAuthStore(): void {
  setUnauthorizedHandler((reason) => useAuthStore.getState().forceSignOut(reason));
}
