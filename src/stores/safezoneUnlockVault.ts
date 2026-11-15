/**
 * SafeZone's unlock window across a cold start (owner, 2026-11-15: "not same
 * as web"). The web keeps the token in sessionStorage, so a reload inside the
 * window does not ask for the PIN. The phone keeps exactly the same two things
 * in the secure store (Keychain / Keystore): the server's signed unlock token
 * and its expiry. Never the PIN, never a secret. The server still checks the
 * token on every call; it is valid for at most 2 minutes after its last renewal.
 */
import * as SecureStore from "expo-secure-store";

const KEY = "safezone.unlock";

export interface StoredUnlock {
  token: string;
  expiresAt: number;
}

export const unlockVault = {
  save: (u: StoredUnlock) => SecureStore.setItemAsync(KEY, JSON.stringify({ token: u.token, expiresAt: u.expiresAt })).catch(() => undefined),
  clear: () => SecureStore.deleteItemAsync(KEY).catch(() => undefined),
  load: async (): Promise<StoredUnlock | null> => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<StoredUnlock>;
      return typeof parsed.token === "string" && typeof parsed.expiresAt === "number" ? { token: parsed.token, expiresAt: parsed.expiresAt } : null;
    } catch {
      return null;
    }
  },
};
