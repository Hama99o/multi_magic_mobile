/**
 * The account's security, as the web's Devices page and the 2FA card show it
 * (`pages/profile/devices/Index.tsx`, `EditProfileDrawer.tsx`) —
 * `docs/design/profile-parity/MANIFEST.md` rows 6, 8, 9, 10 and 25.
 *
 * ── A WRONG PASSWORD IS A 422, AND STAYS ONE ─────────────────────────────
 * Turning two-factor on or off and changing the email ask for the current
 * password. The server answers a wrong one with **422 and
 * `code: "wrong_current_password"`**, never 401 (`two_factor_controller.rb`),
 * because this app treats a 401 as "your session ended" and signs out. The
 * request bodies here say `current_password`, not `password`, so the
 * interceptor's `reauthenticates` guard does not apply and is not needed.
 */
import { http } from "./http";
import { WrongCurrentPassword } from "./profile";
import { arr, id as parseId, obj, optStr, readableRows } from "./parse";

export interface ActiveSession {
  id: number;
  deviceLabel: string | null;
  ipAddress: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  /** This phone's own session — the web hides its sign-out, and so do we. */
  isCurrent: boolean;
}

export interface TrustedDevice {
  id: number;
  label: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

export interface LoginRecord {
  id: number;
  deviceLabel: string | null;
  ipAddress: string | null;
  createdAt: string | null;
}

export interface Page<T> {
  rows: T[];
  unreadable: number;
  page: number;
  /** null on the last page. */
  next: number | null;
  total: number;
}

function parseSession(raw: unknown): ActiveSession {
  const r = obj(raw, "session");
  return {
    id: parseId(r.id, "session.id"),
    deviceLabel: optStr(r.device_label),
    ipAddress: optStr(r.ip_address),
    createdAt: optStr(r.created_at),
    // `exp` is a Unix time on the JWT allowlist, sent as a number or a date.
    expiresAt: typeof r.exp === "number" ? new Date(r.exp * 1000).toISOString() : optStr(r.exp),
    isCurrent: r.is_current === true,
  };
}

function parseTrusted(raw: unknown): TrustedDevice {
  const r = obj(raw, "trusted_device");
  return {
    id: parseId(r.id, "trusted_device.id"),
    label: optStr(r.label),
    lastUsedAt: optStr(r.last_used_at),
    expiresAt: optStr(r.expires_at),
  };
}

function parseLogin(raw: unknown): LoginRecord {
  const r = obj(raw, "login_history");
  return {
    id: parseId(r.id, "login_history.id"),
    deviceLabel: optStr(r.device_label),
    ipAddress: optStr(r.ip_address),
    createdAt: optStr(r.created_at),
  };
}

/** `paginate_render`'s envelope: `{ <root>: [...], meta: { pagy, total_count } }`. */
export function parsePage<T>(payload: unknown, root: string, parse: (raw: unknown) => T): Page<T> {
  const body = obj(payload, root);
  const { rows, unreadable } = readableRows(arr(body[root], root), parse);
  const meta = (body.meta ?? {}) as { pagy?: { page?: unknown; next?: unknown }; total_count?: unknown };
  const page = typeof meta.pagy?.page === "number" ? meta.pagy.page : 1;
  const next = typeof meta.pagy?.next === "number" ? meta.pagy.next : null;
  const total = typeof meta.total_count === "number" ? meta.total_count : rows.length;
  return { rows, unreadable, page, next, total };
}

/** A 422 that names a code, as the code — never by its sentence, which is translated. */
export function refusalCode(error: unknown): string | null {
  const response = (error as { response?: { status?: number; data?: { code?: unknown } } })?.response;
  if (response?.status !== 422) return null;
  return typeof response.data?.code === "string" ? response.data.code : null;
}

function rethrowWrongPassword(error: unknown): never {
  if (refusalCode(error) === "wrong_current_password") throw new WrongCurrentPassword();
  throw error;
}

export class EmailChangeRefused extends Error {
  constructor(
    readonly code: string,
    readonly attemptsLeft: number | null = null,
  ) {
    super(code);
    this.name = "EmailChangeRefused";
  }
}

export const securityApi = {
  setTwoFactor: async (on: boolean, currentPassword: string): Promise<void> => {
    try {
      if (on) await http.post("/api/v1/two_factor/enable", { current_password: currentPassword });
      else await http.delete("/api/v1/two_factor/disable", { data: { current_password: currentPassword } });
    } catch (error) {
      rethrowWrongPassword(error);
    }
  },

  /** Newest first, as the server orders them (`created_at: :desc`). Not paged. */
  sessions: async (): Promise<ActiveSession[]> => {
    const res = await http.get("/api/v1/active_sessions");
    return readableRows(arr(obj(res.data, "sessions").sessions, "sessions"), parseSession).rows;
  },
  signOutSession: async (sessionId: number): Promise<void> => {
    await http.delete(`/api/v1/active_sessions/${sessionId}`);
  },

  trustedDevices: async (page: number): Promise<Page<TrustedDevice>> => {
    const res = await http.get("/api/v1/trusted_devices", { params: { page } });
    return parsePage(res.data, "trusted_devices", parseTrusted);
  },
  forgetDevice: async (deviceId: number): Promise<void> => {
    await http.delete(`/api/v1/trusted_devices/${deviceId}`);
  },

  loginHistory: async (page: number): Promise<Page<LoginRecord>> => {
    const res = await http.get("/api/v1/login_histories", { params: { page } });
    return parsePage(res.data, "login_histories", parseLogin);
  },
  deleteLogin: async (recordId: number): Promise<void> => {
    await http.delete(`/api/v1/login_histories/${recordId}`);
  },
  clearLoginHistory: async (): Promise<void> => {
    await http.delete("/api/v1/login_histories/destroy_all");
  },

  /**
   * Step one of an email change: the password, and the new address, which
   * receives a six-digit code (server PR, `users/me/email_change`).
   */
  requestEmailChange: async (currentPassword: string, email: string): Promise<{ expiresInMinutes: number }> => {
    try {
      const res = await http.post("/api/v1/users/me/email_change", { current_password: currentPassword, email });
      const minutes = (res.data as { expires_in_minutes?: unknown })?.expires_in_minutes;
      return { expiresInMinutes: typeof minutes === "number" ? minutes : 15 };
    } catch (error) {
      const code = refusalCode(error);
      if (code === "wrong_current_password") throw new WrongCurrentPassword();
      if (code) throw new EmailChangeRefused(code);
      throw error;
    }
  },

  /** Step two: the code. Answers with the new address. */
  confirmEmailChange: async (code: string): Promise<{ email: string | null }> => {
    try {
      const res = await http.post("/api/v1/users/me/email_change/confirm", { code });
      const user = obj(obj(res.data, "email_change").user, "user");
      return { email: optStr(user.email) };
    } catch (error) {
      const refusal = refusalCode(error);
      if (refusal) {
        const left = (error as { response?: { data?: { attempts_left?: unknown } } }).response?.data?.attempts_left;
        throw new EmailChangeRefused(refusal, typeof left === "number" ? left : null);
      }
      throw error;
    }
  },
};

