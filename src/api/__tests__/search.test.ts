/**
 * Global search at the boundary: GET /api/v1/search (multi_magic
 * search_controller.rb, Search::Global). Seeded, invented rows only.
 */
import MockAdapter from "axios-mock-adapter";
import { searchApi } from "../search";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;
beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
});
afterEach(() => mock.restore());

const hit = (over: Record<string, unknown> = {}) => ({
  id: "note:7", group: "notes", kind: "note", title: "Trip plan", subtitle: "Day 1: arrive", to: "/notes/7", score: 86, ...over,
});

it("asks with the query and reads every hit in the server's order, with the counts", async () => {
  mock.onGet("/api/v1/search").reply(200, {
    query: "trip",
    results: [hit(), hit({ id: "expense:3", group: "finance", kind: "expense", title: "Train", subtitle: "42.00 EUR", to: "/finance/expenses?expense=3", score: 45 })],
    counts: [{ group: "notes", count: 1 }, { group: "finance", count: 1 }],
  });
  const res = await searchApi.all("trip");
  expect(mock.history.get[0].params).toEqual({ q: "trip" });
  expect(res.results.map((r) => r.id)).toEqual(["note:7", "expense:3"]);
  expect(res.results[0]).toEqual({ id: "note:7", group: "notes", kind: "note", title: "Trip plan", subtitle: "Day 1: arrive", to: "/notes/7", score: 86 });
  expect(res.counts).toEqual({ notes: 1, finance: 1 });
  expect(res.unreadable).toBe(0);
});

it("a row with an unknown group or kind, or no path, is counted, not shown and not fatal", async () => {
  mock.onGet("/api/v1/search").reply(200, {
    query: "trip",
    results: [hit(), hit({ id: "x:1", group: "tables", kind: "row" }), hit({ id: "note:8", to: null }), hit({ id: "note:9", subtitle: null })],
    counts: [],
  });
  const res = await searchApi.all("trip");
  expect(res.results.map((r) => r.id)).toEqual(["note:7", "note:9"]);
  expect(res.results[1].subtitle).toBeNull();
  expect(res.unreadable).toBe(2);
});

it("passes the abort signal, so only the last query's answer is kept", async () => {
  mock.onGet("/api/v1/search").reply(200, { query: "t", results: [], counts: [] });
  const ctrl = new AbortController();
  await searchApi.all("tr", ctrl.signal);
  expect(mock.history.get[0].signal).toBe(ctrl.signal);
});
