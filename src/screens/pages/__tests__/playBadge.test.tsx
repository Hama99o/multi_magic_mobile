/**
 * A VIDEO'S FRAME CARRIES A PLAY BADGE, everywhere a thumbnail is drawn.
 *
 * Once the server makes video previews (multi_magic branch video-previews:
 * ffmpeg in the production image), a clip shows a frame instead of the red
 * video icon, and a frame alone reads as a photo. The badge says "this
 * plays", the way Photos and Drive do. Pinned in the list row, the grid card
 * and the glyph (item sheet, viewer, save lists), in light and dark.
 */
import { render, screen } from "@testing-library/react-native";
import type { PageNode } from "@/api/pages";
import { useThemeStore } from "@/stores/theme.store";
import { GridCard, ListRow } from "../drive/ui";
import { NodeGlyph } from "../parts";

const base = {
  spaceId: 315,
  parentId: 3355,
  starred: false,
  childrenCount: 0,
  ownerName: "Qa MOBILE",
  updatedAt: "2026-11-09T10:00:00Z",
  createdAt: "2026-11-09T09:00:00Z",
  deletedAt: null,
  space: null,
  html: null,
  ancestors: [],
  kind: "file",
  fileSize: 1000,
  attachmentUrl: "http://x/f",
};
const clipWithFrame = { ...base, id: 1, title: "IMG_8511.MOV", mimeType: "video/quicktime", thumbnailUrl: "http://x/frame.jpg" } as PageNode;
const photo = { ...base, id: 2, title: "IMG_2041.jpg", mimeType: "image/jpeg", thumbnailUrl: "http://x/photo.jpg" } as PageNode;
const clipNoFrame = { ...base, id: 3, title: "old.mp4", mimeType: "video/mp4", thumbnailUrl: null } as PageNode;

const noop = () => {};
const views = {
  list: (node: PageNode) => <ListRow node={node} onPress={noop} onMore={noop} onLongPress={noop} selecting={false} selected={false} />,
  grid: (node: PageNode) => <GridCard node={node} width={170} onPress={noop} onMore={noop} onLongPress={noop} selecting={false} selected={false} />,
  glyph: (node: PageNode) => <NodeGlyph node={node} />,
};

afterAll(() => useThemeStore.setState({ choice: "system" }));

describe.each(["light", "dark"] as const)("in %s", (scheme) => {
  beforeEach(() => useThemeStore.setState({ choice: scheme }));

  describe.each(Object.keys(views) as (keyof typeof views)[])("the %s", (view) => {
    it("a video's frame has the play badge", () => {
      render(views[view](clipWithFrame));
      expect(screen.getByTestId("pages-play-badge")).toBeTruthy();
    });

    it("a photo has none", () => {
      render(views[view](photo));
      expect(screen.queryByTestId("pages-play-badge")).toBeNull();
    });

    it("a video with no frame keeps its video icon, no badge on top", () => {
      render(views[view](clipNoFrame));
      expect(screen.queryByTestId("pages-play-badge")).toBeNull();
    });
  });
});
