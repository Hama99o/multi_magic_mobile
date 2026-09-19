/**
 * The signed-in person — `docs/design/profile/SPEC.md`.
 *
 * ── THIS FILE FETCHES THE USER ITSELF, AND THAT IS DELIBERATE ─────────────
 * `app/_layout.tsx` restores the token and sets `status: "signedIn"` without
 * ever fetching the user, so `useAuthStore.user` is `null` after a cold start.
 * `GET /api/v1/users/connected_user` is the call nobody makes. Reading it here
 * rather than depending on the store means this screen works today and keeps
 * working unchanged when the auth layer is fixed — see the SPEC §0.3, which
 * also records what that gap costs the chat screen.
 *
 * ── CHANGING THE EMAIL WOULD BREAK THE SOCKET ─────────────────────────────
 * `ApplicationCable::Connection#find_verified_user` looks the user up by the
 * **email in the socket's query string**, and `http.ts` stores that address for
 * exactly that reason. `email` is writable (`users_controller.rb:177`) and
 * `User` has no `:confirmable`, so a change lands immediately, the stored
 * address goes stale, and the cable is rejected on the next reconnect with
 * nothing on screen to say why.
 *
 * So `updateProfile` **cannot send an email**, by type rather than by
 * discipline. Making it editable means calling `setSessionEmail` in the same
 * breath and re-testing the socket — an auth-layer change, not a form field.
 */
import { http } from "./http";
import { UPLOAD_TIMEOUT_MS } from "./ai";
import { absoluteUrl } from "./conversations";
import { obj, optStr, id as parseId } from "./parse";

export interface Profile {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  username: string | null;
  about: string | null;
  phoneNumber: string | null;
  /** Absolute by the time it leaves here — `<Image>` cannot use a bare path. */
  avatar: string | null;
  createdAt: string | null;
}

/** Everything this screen may write. **No `email`** — see the file header. */
export interface ProfileChanges {
  firstname?: string;
  lastname?: string;
  username?: string;
  about?: string;
  phone_number?: string;
}

export function parseProfile(payload: unknown): Profile {
  const record = obj(payload, "user");
  return {
    id: parseId(record.id, "user.id"),
    email: optStr(record.email),
    firstName: optStr(record.firstname),
    lastName: optStr(record.lastname),
    fullName: optStr(record.fullname),
    username: optStr(record.username),
    about: optStr(record.about),
    phoneNumber: optStr(record.phone_number),
    avatar: absoluteUrl(optStr(record.avatar)),
    createdAt: optStr(record.created_at),
  };
}

/**
 * A wrong current password, told apart from every other failure.
 *
 * `users_controller.rb` answers it with **422 and not 401**, and its own comment
 * says why: "the client treats every 401 as an expired session and signs the
 * user out." This client does exactly that (`http.ts`'s interceptor). The
 * server has already protected us; this type is how the screen avoids undoing
 * it by rendering a generic error and leaving the user guessing.
 */
export class WrongCurrentPassword extends Error {
  constructor() {
    super("Current password is incorrect");
    this.name = "WrongCurrentPassword";
  }
}

export const profileApi = {
  /** Who is signed in. `view: :me`, the fullest view of one's own record. */
  me: async (): Promise<Profile> => {
    const res = await http.get("/api/v1/users/connected_user");
    return parseProfile(obj(res.data, "user").user);
  },

  /**
   * Save the details.
   *
   * `access_level` is deliberately absent from `ProfileChanges` as well as from
   * the server's permitted list for a non-admin — `users_controller.rb:191`
   * guards it, "without this guard any user could PATCH their own record to
   * super_admin". Nothing here should ever be the second line of that defence's
   * only copy, but it is worth knowing which line is the first.
   */
  update: async (userId: number, changes: ProfileChanges): Promise<Profile> => {
    const res = await http.patch(`/api/v1/users/${userId}`, { user: changes });
    return parseProfile(obj(res.data, "user").user);
  },

  /**
   * The photo, as multipart on the same route as the rest of the form —
   * `photo` is in `user_params`, so there is no separate upload endpoint.
   */
  uploadPhoto: async (
    userId: number,
    file: { uri: string; name: string; mimeType: string },
  ): Promise<Profile> => {
    const form = new FormData();
    // React Native's FormData takes {uri,name,type} rather than a Blob.
    form.append("user[photo]", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);

    const res = await http.patch(`/api/v1/users/${userId}`, form, {
      // The instance default is application/json, and leaving it produces a
      // request Rails parses as an empty body.
      headers: { "Content-Type": "multipart/form-data" },
      // A photo is a file, and 15 s is a question's timeout — see ai.ts.
      timeout: UPLOAD_TIMEOUT_MS,
    });
    return parseProfile(obj(res.data, "user").user);
  },

  /**
   * Remove it. A real endpoint, so a real button — `image_type_name` is checked
   * against an allowlist server-side (`ALLOWED_IMAGE_TYPES`), and `photo` is
   * the avatar. `cover_photo` exists and this app has nowhere to show one.
   */
  removePhoto: async (userId: number): Promise<Profile> => {
    const res = await http.delete(`/api/v1/users/${userId}/destroy_avatar`, {
      params: { image_type_name: "photo" },
    });
    return parseProfile(obj(res.data, "user").user);
  },

  /**
   * `PUT /users/:id/change_password`.
   *
   * The confirmation is sent because the server checks it — and because a typo
   * in a new password with no confirmation locks somebody out of their own
   * account without ever showing them what they typed.
   */
  changePassword: async (
    userId: number,
    params: { currentPassword: string; password: string; passwordConfirmation: string },
  ): Promise<void> => {
    try {
      await http.put(`/api/v1/users/${userId}/change_password`, {
        current_password: params.currentPassword,
        password: params.password,
        password_confirmation: params.passwordConfirmation,
      });
    } catch (error) {
      const data = (error as { response?: { status?: number; data?: unknown } })?.response;
      const body = data?.data as { error?: unknown } | undefined;
      if (data?.status === 422 && body?.error === "Current password is incorrect") {
        throw new WrongCurrentPassword();
      }
      throw error;
    }
  },
};

/** The ONLY rule this server enforces — `config/initializers/devise.rb:185`,
 *  `config.password_length = 6..128`. Stating more would reject passwords the
 *  server accepts; see the SPEC §2.3. */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;
