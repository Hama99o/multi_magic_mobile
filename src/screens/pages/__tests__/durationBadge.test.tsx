/**
 * A VIDEO'S OR A SOUND'S LENGTH ON ITS GRID CARD (SPEC §1.1).
 *
 * Decided 2026-11-06 from Rule Zero (Google Photos, Snapchat's camera roll):
 * the length sits bottom-left of the tile on a dark tint. It needed the server
 * to send it: `duration_seconds` (multi_magic feat/mobile-gaps-2), null for
 * other files and before the analyzer ran, and then nothing is drawn.
 */
import { render, screen } from "@testing-library/react-native";
import type { PageNode } from "@/api/pages";
import { GridCard } from "../drive/ui";

const base = {
  spaceId: 315, parentId: 3355, starred: false, childrenCount: 0, ownerName: null,
  updatedAt: "2026-11-21T10:00:00Z", createdAt: null, deletedAt: null, space: null, html: null, ancestors: [],
  kind: "file", fileSize: 1000, attachmentUrl: "http://x/f",
};
const node = (over: Partial<PageNode>) => ({ ...base, id: 1, title: "f", mimeType: null, thumbnailUrl: null, durationSeconds: null, ...over }) as PageNode;
const noop = () => {};
const card = (n: PageNode) => render(<GridCard node={n} width={170} onPress={noop} onMore={noop} onLongPress={noop} selecting={false} selected={false} />);

it("a video with a frame shows its length, rounded down", () => {
  card(node({ title: "clip.mp4", mimeType: "video/mp4", thumbnailUrl: "http://x/frame.jpg", durationSeconds: 225.9 }));
  expect(screen.getByTestId("pages-duration").props.children).toBe("3:45");
});

it("a sound with no frame shows its length too", () => {
  card(node({ title: "memo.m4a", mimeType: "audio/mp4", durationSeconds: 7.2 }));
  expect(screen.getByTestId("pages-duration").props.children).toBe("0:07");
});

it("over an hour reads h:mm:ss", () => {
  card(node({ title: "talk.mp4", mimeType: "video/mp4", thumbnailUrl: "http://x/f.jpg", durationSeconds: 3723 }));
  expect(screen.getByTestId("pages-duration").props.children).toBe("1:02:03");
});

it("not analysed yet (null): nothing", () => {
  card(node({ title: "new.mp4", mimeType: "video/mp4", thumbnailUrl: "http://x/f.jpg", durationSeconds: null }));
  expect(screen.queryByTestId("pages-duration")).toBeNull();
});

it("a photo: nothing, whatever the field says", () => {
  card(node({ title: "a.jpg", mimeType: "image/jpeg", thumbnailUrl: "http://x/a.jpg", durationSeconds: 3 }));
  expect(screen.queryByTestId("pages-duration")).toBeNull();
});
