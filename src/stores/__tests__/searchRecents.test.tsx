/**
 * The search recents (review, 88, 2026-11-21): a SafeZone hit is never kept
 * (S2: its subtitle is a secret, the recents are plaintext outside the PIN),
 * a list stored before that rule is cleaned on load, and a tap that lands
 * before the stored list is read does not overwrite it (S3).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useSearchRecents } from "../searchRecents";

const KEY = "mm.search.recents.7";
const hit = (id: string, title = id) => ({ id, title, subtitle: null, to: `/x/${id}` });
const stored = () => JSON.parse(((AsyncStorage.setItem as jest.Mock).mock.calls.at(-1) ?? [null, "[]"])[1]) as { id: string }[];

beforeEach(async () => {
  await AsyncStorage.clear();
  (AsyncStorage.setItem as jest.Mock).mockClear();
});

it("never remembers a SafeZone hit", async () => {
  const { result } = renderHook(() => useSearchRecents(7));
  act(() => result.current.remember({ id: "identity:3", title: "Passport", subtitle: "ID-889", to: "/safezone/identities?identity=3" }));
  act(() => result.current.remember(hit("note:1")));
  await waitFor(() => expect(result.current.recents.map((r) => r.id)).toEqual(["note:1"]));
  expect(JSON.stringify((AsyncStorage.setItem as jest.Mock).mock.calls)).not.toContain("ID-889");
});

it("cleans SafeZone entries stored before the rule, on load, and rewrites the list", async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify([{ ...hit("password:5", "Bank"), subtitle: "me@mail.test", at: 1 }, { ...hit("note:1"), at: 0 }]));
  (AsyncStorage.setItem as jest.Mock).mockClear();
  const { result } = renderHook(() => useSearchRecents(7));
  await waitFor(() => expect(result.current.recents.map((r) => r.id)).toEqual(["note:1"]));
  expect(stored().map((r) => r.id)).toEqual(["note:1"]);
});

it("a tap before the stored list is read keeps the stored six, after the tap (S3)", async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify(["a", "b", "c", "d", "e", "f"].map((id, i) => ({ ...hit(`note:${id}`), at: i }))));
  (AsyncStorage.setItem as jest.Mock).mockClear();
  const { result } = renderHook(() => useSearchRecents(7));
  act(() => result.current.remember(hit("note:new")));
  await waitFor(() => expect(result.current.recents).toHaveLength(6));
  expect(result.current.recents.map((r) => r.id)).toEqual(["note:new", "note:a", "note:b", "note:c", "note:d", "note:e"]);
  expect(stored().map((r) => r.id)).toEqual(["note:new", "note:a", "note:b", "note:c", "note:d", "note:e"]);
});
