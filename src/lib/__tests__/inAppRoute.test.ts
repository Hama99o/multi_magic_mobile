/**
 * Where a reply's link opens ON THIS DEVICE (`src/lib/inAppRoute.ts`).
 *
 * The app gained Pages on 2026-11-06, and the server already sends Pages
 * links: `page_space` → `/pages/:space_id`, `page_node` → `/pages/:space_id
 * ?node=:node_id` (multi_magic `app/services/frontend_routes.rb`). Until now
 * those opened the browser, the old answer for "the app has no such screen"
 * (docs/QA_FULL.md F3).
 */
import { inAppRoute } from "../inAppRoute";

describe("inAppRoute", () => {
  it("keeps the screens it always had", () => {
    expect(inAppRoute({ key: "ai_keys", path: "/settings/ai-keys", label: null })).toBe("/ai-keys");
    expect(inAppRoute({ key: "calendar_event", path: "/calendar", label: null })).toBe("/calendar");
  });

  it("a whole space opens its folder screen, titled with the link's label", () => {
    expect(inAppRoute({ key: "page_space", path: "/pages/315", label: "QA Pages" })).toEqual({
      pathname: "/pages/folder",
      params: { spaceId: "315", title: "QA Pages" },
    });
  });

  it("a page or a file opens in the viewer (which sends a folder on to the folder screen)", () => {
    expect(inAppRoute({ key: "page_node", path: "/pages/315?node=900", label: "Itinerary.pdf" })).toEqual({
      pathname: "/pages/view",
      params: { spaceId: "315", nodeId: "900", title: "Itinerary.pdf" },
    });
  });

  it("a Pages link whose path cannot be read stays on the web (no guessing)", () => {
    expect(inAppRoute({ key: "page_node", path: "/pages/abc", label: null })).toBeNull();
    expect(inAppRoute({ key: "page_space", path: null, label: null })).toBeNull();
  });

  it("records the app has no screen for stay on the web", () => {
    expect(inAppRoute({ key: "note", path: "/notes/4", label: null })).toBeNull();
    expect(inAppRoute({ key: null, path: null, label: null })).toBeNull();
  });
});
