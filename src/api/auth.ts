/**
 * Sign in, sign out, and the one branch we deliberately do not build a screen
 * for.
 *
 * ── The endpoints are OUTSIDE /api/v1 ─────────────────────────────────────
 * `POST /users/login` and `DELETE /users/logout` (`config/routes.rb:432-433`),
 * not `/api/v1/...`. Two-factor verification, confusingly, IS inside it:
 * `POST /api/v1/two_factor/verify`.
 *
 * ── The JWT arrives in a HEADER, not the body ─────────────────────────────
 * devise-jwt puts it in the `Authorization` response header, already prefixed
 * `Bearer `. The body is the user. Miss the header and login "succeeds" while
 * storing nothing — a screen that navigates to a conversation which then 401s.
 *
 * ── 2FA: a typed failure, not a screen ────────────────────────────────────
 * `sessions_controller.rb:13-20` returns 202 with
 * `{ two_factor_required: true, pre_auth_token }` and NO usable token when the
 * account has 2FA on. Hamma9900's account has it OFF (verified against the
 * users table), so v1 ships the plain login.
 *
 * But 202 is a SUCCESS status: axios resolves it. Without the branch below,
 * `signIn` would return normally having stored nothing, and the app would sit
 * on a login screen that accepted the password and did nothing — the worst
 * shape of failure, because the user has no reason to think anything went
 * wrong. So the branch exists and throws something the UI can name. Ten lines
 * instead of a screen, and if 2FA is ever switched on the app SAYS SO.
 */
import { http, setSessionEmail, setToken } from "./http";
import { id, obj, optStr, str } from "./parse";

export interface CurrentUser {
  id: number;
  email: string;
  /**
   * `firstname`/`lastname`/`fullname` — ONE word, no underscore.
   *
   * The columns are spelled that way and `UserSerializer` passes the spelling
   * straight through (`user_serializer.rb:62-72`). Reading `first_name` here
   * returned null for every user while `tsc` and the tests stayed green,
   * because the parser tolerates a missing optional string. Checked against the
   * serializer rather than guessed from the convention.
   */
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
}

/**
 * Thrown when the account needs an emailed code this version cannot collect.
 * Carries the pre-auth token so a future OTP screen needs no new plumbing.
 */
export class TwoFactorRequiredError extends Error {
  readonly preAuthToken: string;
  constructor(preAuthToken: string) {
    super("This account needs an emailed code, which this app cannot do yet.");
    this.name = "TwoFactorRequiredError";
    this.preAuthToken = preAuthToken;
  }
}

/** The server accepted the credentials but sent no token. */
export class MissingTokenError extends Error {
  constructor() {
    super("Signed in, but the server sent no session token.");
    this.name = "MissingTokenError";
  }
}

export function parseUser(payload: unknown): CurrentUser {
  const record = obj(payload, "user");
  return {
    id: id(record.id, "user.id"),
    email: str(record.email, "user.email"),
    firstName: optStr(record.firstname),
    lastName: optStr(record.lastname),
    fullName: optStr(record.fullname),
  };
}

export async function signIn(params: {
  email: string;
  password: string;
}): Promise<CurrentUser> {
  const response = await http.post("/users/login", {
    user: { email: params.email.trim(), password: params.password },
  });

  const body = response.data as { two_factor_required?: unknown; pre_auth_token?: unknown };

  // Checked BEFORE the header, because on this path the header's JWT is already
  // revoked — `auth.service.ts:18` says so in as many words.
  if (body?.two_factor_required === true) {
    throw new TwoFactorRequiredError(
      typeof body.pre_auth_token === "string" ? body.pre_auth_token : "",
    );
  }

  // Header names are lower-cased by axios, but not on every platform's adapter,
  // so both spellings are read rather than trusting one.
  const headers = response.headers as Record<string, unknown>;
  const authorization = headers.authorization ?? headers.Authorization;
  if (typeof authorization !== "string" || authorization.trim() === "") {
    throw new MissingTokenError();
  }

  const user = parseUser(response.data);

  // Verbatim, prefix and all — see `http.ts`. Stored BEFORE returning, so the
  // caller cannot forget to.
  await setToken(authorization);
  // The server's spelling of the address, not what was typed into the field.
  // The cable looks the user up BY EMAIL, so a capitalised or space-padded
  // entry would build a socket URL that finds nobody while every HTTP request
  // kept working — a half-broken session that looks like a socket bug.
  await setSessionEmail(user.email);
  return user;
}

export async function signOut(): Promise<void> {
  try {
    await http.delete("/users/logout");
  } catch {
    // A logout that cannot reach the server still logs this device out. The
    // token is cleared below either way — leaving a user apparently signed in
    // because the network was down is the worse failure.
  } finally {
    await setToken(null);
    await setSessionEmail(null);
    // NOTE: the device fingerprint is deliberately NOT cleared here. See
    // `lib/fingerprint.ts` — clearing it causes a re-authentication cycle.
  }
}

/**
 * Create an account — his instruction of 18 Sept, *"create account should also
 * work."*
 *
 * `POST /users/signup` -> `registrations#create`, confirmed against
 * `bin/rails routes`. Params are nested under `user` and use the same
 * one-word spelling as the serializer: `firstname`, `lastname`.
 *
 * Devise signs the new user in, so the JWT arrives in the same header as on
 * login and is stored the same way. If it does not, this throws rather than
 * returning a user with no session — the same reasoning as `signIn`.
 */
export async function signUp(params: {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
}): Promise<CurrentUser> {
  const response = await http.post("/users/signup", {
    user: {
      firstname: params.firstname.trim(),
      lastname: params.lastname.trim(),
      email: params.email.trim(),
      password: params.password,
      password_confirmation: params.password,
      agreed_to_terms: true,
    },
  });

  const headers = response.headers as Record<string, unknown>;
  const authorization = headers.authorization ?? headers.Authorization;
  if (typeof authorization !== "string" || authorization.trim() === "") {
    throw new MissingTokenError();
  }

  const user = parseUser(response.data);
  await setToken(authorization);
  await setSessionEmail(user.email);
  return user;
}

/**
 * Ask for a reset link.
 *
 * `PUT /api/v1/users/reset_password` — **not** the `resources :passwords` at
 * `routes.rb:16`, which is SafeZone's password VAULT
 * (`/api/v1/safezone_app/passwords`) and nothing to do with signing in. The
 * spec guessed from the route declaration without its namespace and flagged
 * that it had; `bin/rails routes | grep password` settled it.
 *
 * Note the verb: PUT, not POST.
 *
 * ── It cannot tell you whether the address exists, and that is deliberate ──
 * The server does `user&.reset_password!` then `head :ok`
 * (`users_controller.rb:72-76`) — 200 either way. So the screen has nothing to
 * branch on even if it wanted to, and the honest copy is the only copy: "if
 * that address has an account, we have sent it a link." An app that
 * distinguishes the two tells a stranger which emails have accounts.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await http.put("/api/v1/users/reset_password", { email: email.trim() });
}
