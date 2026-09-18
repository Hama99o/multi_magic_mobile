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
import { setUnauthorizedHandler } from "@/api/http";
import { resetCable } from "@/lib/cable";

interface AuthState {
  user: CurrentUser | null;
  status: "unknown" | "signedIn" | "signedOut";
  signIn: (params: { email: string; password: string }) => Promise<void>;
  signOut: () => Promise<void>;
  /** Called by the 401 interceptor. Never by a screen. */
  forceSignOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "unknown",

  signIn: async (params) => {
    const user = await apiSignIn(params);
    set({ user, status: "signedIn" });
  },

  signOut: async () => {
    await apiSignOut();
    // The socket carries the token in its URL, so it must go too — otherwise it
    // stays open authenticated as the person who just left.
    resetCable();
    set({ user: null, status: "signedOut" });
  },

  forceSignOut: () => {
    resetCable();
    set({ user: null, status: "signedOut" });
  },
}));

export function wireAuthStore(): void {
  setUnauthorizedHandler(() => useAuthStore.getState().forceSignOut());
}
