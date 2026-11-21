/**
 * Optimistic creates in Flow (review, 88, 2026-11-21, the "low" findings).
 *
 * - A new card's placeholder went into EVERY cached board scope: a card made in
 *   sprint 5 showed on sprint 3's board and in the backlog until a refetch.
 *   It belongs only where the card will be: "all", its own sprint, or the
 *   backlog when it has no sprint.
 * - A comment's answer replaced EVERY pending comment with the same words: two
 *   "ok" sent quickly became two copies of the first (duplicate keys, the
 *   second lost until a refetch). The answer replaces ONE: the oldest pending.
 */
import { act, renderHook } from "@testing-library/react-native";
import { QueryClientProvider, useQueries, type InfiniteData, type QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { testQueryClient } from "@/__tests__/queryClient";
import { flowKeys } from "@/api/keys";
import { flowApi, type Board, type Card, type Comment } from "@/api/flow";
import { useAddComment, useCreateCard } from "../useFlowMutations";

const boardOf = (cards: Card[]): InfiniteData<Board> => ({
  pageParams: [1],
  pages: [{ project: {}, columns: [], sprints: [], cards, fieldDefinitions: [], tagCategories: [], members: [], page: { paged: true, page: 1, hasMore: false } } as unknown as Board],
});
const titles = (d: InfiniteData<Board> | undefined) => (d?.pages ?? []).flatMap((p) => p.cards).map((c) => c.title);

/** An observer per key, as the mounted screens are: testQueryClient's gcTime 0
 *  would drop data nobody observes before the test could read it. */
const useWatch = (keys: QueryKey[]) => useQueries({ queries: keys.map((queryKey) => ({ queryKey, queryFn: () => new Promise<never>(() => undefined), enabled: false })) });

function wrap() {
  const client = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

afterEach(() => jest.restoreAllMocks());

it("a new card's placeholder shows only on the boards that will hold it", async () => {
  const { client, wrapper } = wrap();
  for (const scope of ["all", 5, 3, "backlog"] as const) client.setQueryData(flowKeys.board(7, scope), boardOf([]));
  jest.spyOn(flowApi, "createCard").mockImplementation(() => new Promise(() => undefined));
  const { result } = renderHook(() => {
    useWatch((["all", 5, 3, "backlog"] as const).map((scope) => flowKeys.board(7, scope)));
    return useCreateCard(7);
  }, { wrapper });

  await act(async () => {
    result.current.mutate({ title: "[qa] New", columnId: 1, sprintId: 5 });
    await new Promise((r) => setTimeout(r, 0));
  });

  expect(titles(client.getQueryData(flowKeys.board(7, "all")))).toEqual(["[qa] New"]);
  expect(titles(client.getQueryData(flowKeys.board(7, 5)))).toEqual(["[qa] New"]);
  expect(titles(client.getQueryData(flowKeys.board(7, 3)))).toEqual([]);
  expect(titles(client.getQueryData(flowKeys.board(7, "backlog")))).toEqual([]);
});

it("two comments with the same words keep two rows when the first one lands", async () => {
  const { client, wrapper } = wrap();
  client.setQueryData<Comment[]>(flowKeys.comments(7, 9), []);
  const answers: ((c: Comment) => void)[] = [];
  jest.spyOn(flowApi, "addComment").mockImplementation(() => new Promise<Comment>((r) => answers.push(r)));
  const me = { id: 1, name: "QA" };
  const { result } = renderHook(() => {
    useWatch([flowKeys.comments(7, 9)]);
    return useAddComment(7, 9, me);
  }, { wrapper });

  await act(async () => {
    result.current.mutate("ok");
    result.current.mutate("ok");
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    answers[0]({ id: 10, content: "ok", user: me, createdAt: "", updatedAt: "" } as Comment);
    await new Promise((r) => setTimeout(r, 0));
  });

  const ids = (client.getQueryData<Comment[]>(flowKeys.comments(7, 9)) ?? []).map((c) => c.id);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
  expect(ids).toContain(10);
});
