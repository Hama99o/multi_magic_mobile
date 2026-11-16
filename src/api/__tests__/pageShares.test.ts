/**
 * Pages sharing at the boundary (audit #14): the web's `sharesApi` and
 * `shareLinksApi` (`page_app.api.ts`), against the server's serializers
 * (`share_serializer.rb`, `share_link_serializer.rb`), which send snake_case.
 * Invented rows only (example.test).
 */
import MockAdapter from "axios-mock-adapter";
import { http, __resetTokenCache } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { linkUrl, shareLinksApi, sharesApi } from "../pageShares";

const SHARE = {
  id: 7,
  permission: "editor",
  shareable_type: "PageApp::Space",
  shareable_id: 315,
  created_at: "2026-11-16T10:00:00Z",
  invited_at: null,
  shared_with_id: 42,
  shared_with_email: "ada@example.test",
  shared_with_name: "Ada Lovelace",
  pending: false,
};
const INVITE = { ...SHARE, id: 8, permission: "viewer", shared_with_id: null, shared_with_email: "new@example.test", shared_with_name: "", pending: true };
const LINK = {
  id: 3,
  permission: "viewer",
  token: "tok123",
  expires_at: "2026-11-23T10:00:00Z",
  created_at: "2026-11-16T10:00:00Z",
  space_id: 315,
  node_id: null,
  granted_count: 2,
  expired: false,
  path: "/pages/315?share_link=tok123",
};

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
});
afterEach(() => mock.restore());

describe("people with access", () => {
  it("lists a space's shares, a pending invite with no name", async () => {
    mock.onGet("/api/v1/page_app/spaces/315/shares").reply(200, { shares: [SHARE, INVITE] });
    const rows = await sharesApi.list({ spaceId: 315, nodeId: null });
    expect(rows).toEqual([
      { id: 7, permission: "editor", email: "ada@example.test", name: "Ada Lovelace", pending: false },
      { id: 8, permission: "viewer", email: "new@example.test", name: null, pending: true },
    ]);
  });

  it("a node's shares live under the node", async () => {
    mock.onGet("/api/v1/page_app/spaces/315/nodes/9/shares").reply(200, { shares: [] });
    expect(await sharesApi.list({ spaceId: 315, nodeId: 9 })).toEqual([]);
  });

  it("invites by email with a permission, and says what happened", async () => {
    mock.onPost("/api/v1/page_app/spaces/315/shares").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ share: { email: "new@example.test", permission: "admin" } });
      return [201, { share: INVITE, state: "invited" }];
    });
    const result = await sharesApi.create({ spaceId: 315, nodeId: null }, { email: "new@example.test", permission: "admin" });
    expect(result.state).toBe("invited");
    expect(result.share.email).toBe("new@example.test");
  });

  it("changes a permission (PATCH) and revokes (DELETE), node or space", async () => {
    mock.onPatch("/api/v1/page_app/spaces/315/nodes/9/shares/7").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ share: { permission: "viewer" } });
      return [200, { share: { ...SHARE, permission: "viewer" } }];
    });
    mock.onDelete("/api/v1/page_app/spaces/315/shares/7").reply(200, { message: "Share removed" });
    expect((await sharesApi.update({ spaceId: 315, nodeId: 9 }, 7, "viewer")).permission).toBe("viewer");
    await sharesApi.destroy({ spaceId: 315, nodeId: null }, 7);
    expect(mock.history.delete).toHaveLength(1);
  });

  it("resends a pending invite", async () => {
    mock.onPost("/api/v1/page_app/spaces/315/shares/8/resend").reply(200, { share: INVITE });
    expect((await sharesApi.resend({ spaceId: 315, nodeId: null }, 8)).email).toBe("new@example.test");
  });
});

describe("links", () => {
  it("lists them with their expiry and how many came in", async () => {
    mock.onGet("/api/v1/page_app/spaces/315/share_links").reply(200, { share_links: [LINK] });
    const [link] = await shareLinksApi.list({ spaceId: 315, nodeId: null });
    expect(link).toEqual({ id: 3, permission: "viewer", expiresAt: "2026-11-23T10:00:00Z", expired: false, grantedCount: 2, path: "/pages/315?share_link=tok123" });
  });

  it("creates one with a permission and an expiry (null: never)", async () => {
    mock.onPost("/api/v1/page_app/spaces/315/nodes/9/share_links").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ share_link: { permission: "editor", expires_at: null } });
      return [201, { share_link: { ...LINK, expires_at: null, permission: "editor" } }];
    });
    const link = await shareLinksApi.create({ spaceId: 315, nodeId: 9 }, { permission: "editor", expiresAt: null });
    expect(link.expiresAt).toBeNull();
  });

  it("revokes, keeping the people it let in unless asked", async () => {
    mock.onDelete("/api/v1/page_app/spaces/315/share_links/3").reply((config) => [200, { message: "Link revoked", revoked_access_count: config.params?.revoke_access === "true" ? 2 : 0 }]);
    expect(await shareLinksApi.destroy({ spaceId: 315, nodeId: null }, 3, false)).toBe(0);
    expect(await shareLinksApi.destroy({ spaceId: 315, nodeId: null }, 3, true)).toBe(2);
  });

  it("a link's address is the server's host plus its path", () => {
    expect(linkUrl({ path: "/pages/315?share_link=tok123" })).toMatch(/^https?:\/\/[^/]+\/pages\/315\?share_link=tok123$/);
  });
});
