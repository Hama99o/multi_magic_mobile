/**
 * SHARE A SPACE OR AN ITEM (audit #14), the web's `ShareDialog`: people with
 * access and pending invites, invite by email with a permission, change a
 * permission, revoke (asked first), the server's refusal shown as it said it;
 * links with the web's expiry choices, copied, listed with their expiry,
 * revoked (asked first; people let in by it kept unless the owner says).
 *
 * The network is mocked, not the API module, so the requests are the ones
 * the server's routes take. Invented rows only (example.test).
 */
import { Alert } from "react-native";
import MockAdapter from "axios-mock-adapter";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "@/__tests__/queryClient";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("expo-haptics", () => ({ notificationAsync: jest.fn(async () => undefined), NotificationFeedbackType: { Success: "success" } }));

/* eslint-disable import/first */
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { ShareSheet } from "../ShareSheet";
import { expiresAtFor } from "../useSharing";

const person = (over: Record<string, unknown> = {}) => ({
  id: 7, permission: "editor", shared_with_email: "ada@example.test", shared_with_name: "Ada Lovelace", pending: false, ...over,
});
const invite = person({ id: 8, permission: "viewer", shared_with_email: "new@example.test", shared_with_name: "", pending: true });
const link = (over: Record<string, unknown> = {}) => ({
  id: 3, permission: "viewer", token: "tok", expires_at: null, expired: false, granted_count: 0, path: "/pages/315?share_link=tok", ...over,
});

const SPACE = "/api/v1/page_app/spaces/315";
let mock: MockAdapter;
let shares: unknown[];
let links: unknown[];

function wrap(nodeId: number | null = null) {
  const onClose = jest.fn();
  render(
    <QueryClientProvider client={testQueryClient()}>
      <ShareSheet target={{ spaceId: 315, nodeId, title: nodeId ? "Trip.pdf" : "Trips" }} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}
const lastAlert = () => (Alert.alert as jest.Mock).mock.calls.at(-1)! as [string, string, { text: string; style?: string; onPress?: () => void }[]];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  shares = [person(), invite];
  links = [];
  mock.onGet(`${SPACE}/shares`).reply(() => [200, { shares }]);
  mock.onGet(`${SPACE}/share_links`).reply(() => [200, { share_links: links }]);
});
afterEach(() => mock.restore());

describe("people with access", () => {
  it("lists them, a pending invite said so", async () => {
    wrap();
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("ada@example.test")).toBeTruthy();
    expect(screen.getByText("new@example.test")).toBeTruthy();
    expect(screen.getByTestId("pages-share-person-8-pending")).toBeTruthy();
    expect(screen.queryByTestId("pages-share-person-7-pending")).toBeNull();
  });

  it("nobody yet says so", async () => {
    shares = [];
    wrap();
    expect(await screen.findByTestId("pages-share-nobody")).toBeTruthy();
  });

  it("invites by email with the permission picked, then the list refetches", async () => {
    mock.onPost(`${SPACE}/shares`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ share: { email: "bob@example.test", permission: "admin" } });
      shares = [...shares, person({ id: 9, shared_with_email: "bob@example.test", shared_with_name: "", pending: true, permission: "admin" })];
      return [201, { share: shares.at(-1), state: "invited" }];
    });
    wrap();
    await screen.findByText("Ada Lovelace");
    expect(screen.getByTestId("pages-share-invite").props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId("pages-share-email"), " bob@example.test ");
    fireEvent.press(screen.getByTestId("pages-share-perm-admin"));
    await act(async () => fireEvent.press(screen.getByTestId("pages-share-invite")));
    expect(await screen.findByText("Invitation sent to bob@example.test")).toBeTruthy();
    expect(await screen.findByText("bob@example.test")).toBeTruthy();
    expect(screen.getByTestId("pages-share-email").props.value).toBe("");
  });

  it("the server's refusal is shown as it said it", async () => {
    mock.onPost(`${SPACE}/shares`).reply(422, { message: "You cannot share with yourself." });
    wrap();
    await screen.findByText("Ada Lovelace");
    fireEvent.changeText(screen.getByTestId("pages-share-email"), "me@example.test");
    await act(async () => fireEvent.press(screen.getByTestId("pages-share-invite")));
    expect(await screen.findByText("You cannot share with yourself.")).toBeTruthy();
  });

  it("changes a permission from its row", async () => {
    mock.onPatch(`${SPACE}/shares/7`).reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ share: { permission: "viewer" } });
      shares = [person({ permission: "viewer" }), invite];
      return [200, { share: shares[0] }];
    });
    wrap();
    await screen.findByText("Ada Lovelace");
    fireEvent.press(screen.getByTestId("pages-share-person-7-perm"));
    await act(async () => fireEvent.press(await screen.findByTestId("pages-share-pick-viewer")));
    expect(mock.history.patch).toHaveLength(1);
    await waitFor(() => expect(screen.getByTestId("pages-share-person-7-perm")).toHaveTextContent("Viewer"));
  });

  it("revoking asks first, then removes", async () => {
    mock.onDelete(`${SPACE}/shares/7`).reply(() => {
      shares = [invite];
      return [200, { message: "Share removed" }];
    });
    wrap();
    await screen.findByText("Ada Lovelace");
    fireEvent.press(screen.getByTestId("pages-share-person-7-remove"));
    expect(lastAlert()[0]).toBe("Remove access for Ada Lovelace?");
    expect(mock.history.delete).toHaveLength(0);
    await act(async () => lastAlert()[2].find((b) => b.style === "destructive")!.onPress!());
    expect(mock.history.delete[0].url).toBe(`${SPACE}/shares/7`);
    await waitFor(() => expect(screen.queryByText("Ada Lovelace")).toBeNull());
  });

  it("a pending invite can be sent again", async () => {
    mock.onPost(`${SPACE}/shares/8/resend`).reply(200, { share: invite });
    wrap();
    await screen.findByText("new@example.test");
    await act(async () => fireEvent.press(screen.getByTestId("pages-share-person-8-resend")));
    expect(await screen.findByText("Invitation sent again to new@example.test")).toBeTruthy();
  });

  it("a node's sheet talks to the node's routes", async () => {
    mock.onGet(`${SPACE}/nodes/9/shares`).reply(200, { shares: [person()] });
    mock.onGet(`${SPACE}/nodes/9/share_links`).reply(200, { share_links: [] });
    wrap(9);
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Trip.pdf")).toBeTruthy();
  });
});

describe("links", () => {
  it("creates one with the expiry picked, copies it, and says so", async () => {
    mock.onPost(`${SPACE}/share_links`).reply((config) => {
      const body = JSON.parse(config.data) as { share_link: { permission: string; expires_at: string } };
      expect(body.share_link.permission).toBe("editor");
      const days = (Date.parse(body.share_link.expires_at) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThan(7.1);
      links = [link({ permission: "editor", expires_at: body.share_link.expires_at })];
      return [201, { share_link: links[0] }];
    });
    wrap();
    await screen.findByText("Ada Lovelace");
    fireEvent.press(screen.getByTestId("pages-share-link-perm-editor"));
    fireEvent.press(screen.getByTestId("pages-share-expiry-7d"));
    await act(async () => fireEvent.press(screen.getByTestId("pages-share-create-link")));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringMatching(/\/pages\/315\?share_link=tok$/)));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");
    expect(await screen.findByText("Link created and copied")).toBeTruthy();
    expect(await screen.findByTestId("pages-share-link-3")).toBeTruthy();
  });

  it("lists links with their permission and expiry, and copies one", async () => {
    links = [
      link(),
      link({ id: 4, expires_at: "2026-12-01T10:00:00Z", granted_count: 2 }),
      link({ id: 5, expires_at: "2026-01-01T10:00:00Z", expired: true }),
    ];
    wrap();
    expect(await screen.findByText("Viewer · No expiry")).toBeTruthy();
    expect(screen.getByTestId("pages-share-link-4-meta")).toHaveTextContent(/Viewer · Expires .+ · 2 people are in through it/);
    expect(screen.getByTestId("pages-share-link-5-meta")).toHaveTextContent("Viewer · Expired");
    fireEvent.press(screen.getByTestId("pages-share-link-3-copy"));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringMatching(/share_link=tok$/));
    expect(Haptics.notificationAsync).toHaveBeenCalled();
  });

  it("revoking a link nobody used asks, then revokes", async () => {
    links = [link()];
    mock.onDelete(`${SPACE}/share_links/3`).reply(() => {
      links = [];
      return [200, { message: "Link revoked", revoked_access_count: 0 }];
    });
    wrap();
    await screen.findByTestId("pages-share-link-3");
    fireEvent.press(screen.getByTestId("pages-share-link-3-revoke"));
    expect(lastAlert()[0]).toBe("Revoke link");
    expect(mock.history.delete).toHaveLength(0);
    await act(async () => lastAlert()[2].find((b) => b.style === "destructive")!.onPress!());
    expect(mock.history.delete[0].params).toBeUndefined();
    await waitFor(() => expect(screen.queryByTestId("pages-share-link-3")).toBeNull());
  });

  it("revoking a link people came in through asks whether they keep access", async () => {
    links = [link({ granted_count: 2 })];
    mock.onDelete(`${SPACE}/share_links/3`).reply(200, { message: "Link revoked", revoked_access_count: 2 });
    wrap();
    await screen.findByTestId("pages-share-link-3");
    fireEvent.press(screen.getByTestId("pages-share-link-3-revoke"));
    const [, body, buttons] = lastAlert();
    expect(body).toBe("The link will stop working. 2 people already opened it — should they keep their access?");
    expect(buttons.map((b) => b.text)).toEqual(["Cancel", "Revoke the link, keep their access", "Revoke and remove 2 people"]);
    await act(async () => buttons.find((b) => b.style === "destructive")!.onPress!());
    expect(mock.history.delete[0].params).toEqual({ revoke_access: "true" });
    expect(await screen.findByText("Link revoked and 2 people removed")).toBeTruthy();
  });

  it("expiry: never is null, 30 days is thirty days on", () => {
    expect(expiresAtFor("never", 0)).toBeNull();
    expect(expiresAtFor("30d", 0)).toBe(new Date(30 * 86_400_000).toISOString());
  });
});

it("the sheet rises with the keyboard (it has an email field)", async () => {
  const { KeyboardPadding } = jest.requireActual("@/components/KeyboardPadding");
  wrap();
  await screen.findByText("Ada Lovelace");
  expect(screen.UNSAFE_getAllByType(KeyboardPadding).length).toBeGreaterThan(0);
});
