/**
 * PDF pages as images (multi_magic feat/mobile-gaps-2, 81a02e96; the contract
 * as multi-magic-83 stated it, 2026-11-21): GET
 * /api/v1/page_app/nodes/:id/page_images?from=&count= → { page_count, pages:
 * [{ index, url, width, height }] }, url relative and signed (loaded with no
 * Authorization header). Not captured yet: the branch is not on :3020.
 */
import MockAdapter from "axios-mock-adapter";
import { http, __resetTokenCache } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { pagesApi } from "../pages";

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
});
afterEach(() => mock.restore());

it("asks for a window of pages and makes each url absolute", async () => {
  mock.onGet("/api/v1/page_app/nodes/7/page_images").reply(200, {
    page_count: 3,
    pages: [
      { index: 0, url: "/api/v1/page_app/nodes/7/page_images/0?token=a", width: 1200, height: 1697 },
      { index: 1, url: "/api/v1/page_app/nodes/7/page_images/1?token=b", width: 1200, height: 849 },
    ],
  });
  const got = await pagesApi.pageImages(7, 0, 2);
  expect(mock.history.get[0].params).toEqual({ from: 0, count: 2 });
  expect(got.pageCount).toBe(3);
  expect(got.pages.map((p) => [p.index, p.width, p.height])).toEqual([[0, 1200, 1697], [1, 1200, 849]]);
  expect(got.pages[0].url).toMatch(/^https?:\/\/.+\/api\/v1\/page_app\/nodes\/7\/page_images\/0\?token=a$/);
});

it("a page without a url or a size is dropped, not drawn blank", async () => {
  mock.onGet("/api/v1/page_app/nodes/7/page_images").reply(200, { page_count: 2, pages: [{ index: 0, url: null, width: 1200, height: 1600 }, { index: 1, url: "/x?token=c", width: 0, height: 1 }] });
  expect((await pagesApi.pageImages(7, 0, 10)).pages).toEqual([]);
});
