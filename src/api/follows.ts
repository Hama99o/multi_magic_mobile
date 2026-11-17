/**
 * Followers and following — the web's `FollowListDrawer.tsx`.
 *
 * ── THE BODY IS SENT BOTH WAYS ────────────────────────────────────────────
 * `follows_controller.rb` reads `params[:followed_id]` FLAT, while the web
 * sends `{ follow: { followed_id } }` nested, so the web's own follow very
 * likely 404s today (the server PR accepts both). Sending both shapes here
 * works against the server before and after that fix.
 */
import { http } from "./http";
import { absoluteUrl } from "./conversations";
import { id as parseId, obj, optStr } from "./parse";
import { parsePage, type Page } from "./security";

export interface Person {
  id: number;
  name: string;
  username: string | null;
  avatar: string | null;
  isFollowing: boolean;
}

function parsePerson(raw: unknown): Person {
  const r = obj(raw, "user");
  const name =
    optStr(r.fullname) ?? ([optStr(r.firstname), optStr(r.lastname)].filter(Boolean).join(" ") || optStr(r.username) || "—");
  return {
    id: parseId(r.id, "user.id"),
    name,
    username: optStr(r.username),
    avatar: absoluteUrl(optStr(r.avatar)),
    isFollowing: r.is_following === true,
  };
}

export const followsApi = {
  list: async (userId: number, kind: "followers" | "following", page: number): Promise<Page<Person>> => {
    const res = await http.get(`/api/v1/users/${userId}/${kind}`, { params: { page } });
    // `paginate_render` roots the list at the table name: `users`.
    return parsePage(res.data, "users", parsePerson);
  },
  follow: async (userId: number): Promise<void> => {
    await http.post("/api/v1/follows/follow", { followed_id: userId, follow: { followed_id: userId } });
  },
  unfollow: async (userId: number): Promise<void> => {
    await http.post("/api/v1/follows/unfollow", { followed_id: userId, follow: { followed_id: userId } });
  },
};
