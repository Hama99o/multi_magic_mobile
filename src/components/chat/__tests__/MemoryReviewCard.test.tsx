/**
 * "Is this still true?": the memory review card (the web's MemoryReviewCard, parity audit old #34).
 * The facts the assistant remembers that are most likely to have changed, three at most; each can be
 * confirmed for good, asked again later, or removed from what it remembers. Nothing to ask: no card.
 */
import MockAdapter from "axios-mock-adapter";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import { MemoryReviewCard } from "../MemoryReviewCard";

const URL = "/api/v1/ai/memory_review";
let mock: MockAdapter;
const show = () => render(<QueryClientProvider client={testQueryClient()}><MemoryReviewCard /></QueryClientProvider>);
const doubleTap = (el: Parameters<typeof fireEvent.press>[0]) => {
  fireEvent.press(el);
  fireEvent.press(el);
};

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  await i18n.changeLanguage("en");
});
afterEach(() => mock.restore());

it("nothing to ask: no card at all", async () => {
  mock.onGet(URL).reply(200, { facts: [] });
  show();
  await waitFor(() => expect(mock.history.get).toHaveLength(1));
  expect(screen.queryByTestId("memory-review")).toBeNull();
});

it("shows each fact with its three answers, under the web's title", async () => {
  mock.onGet(URL).reply(200, { facts: [{ id: "f1", text: "You live in Lyon" }, { id: "f2", text: "You work at Acme" }] });
  show();
  expect(await screen.findByText("Is this still true?")).toBeTruthy();
  expect(screen.getByText("You live in Lyon")).toBeTruthy();
  expect(screen.getByTestId("memory-review-f1-confirmed").props.accessibilityLabel).toBe("Still true: You live in Lyon");
  expect(screen.getByTestId("memory-review-f2-remove")).toBeTruthy();
});

it("Still true and Ask me later send their state; Not any more removes the fact and says so", async () => {
  // Each answer refreshes the list: the confirmed fact leaves it, then the removed one.
  mock
    .onGet(URL)
    .replyOnce(200, { facts: [{ id: "f1", text: "You live in Lyon" }, { id: "f2", text: "You work at Acme" }] })
    .onGet(URL)
    .replyOnce(200, { facts: [{ id: "f2", text: "You work at Acme" }] })
    .onGet(URL)
    .reply(200, { facts: [] });
  mock.onPatch(`${URL}/f1`).reply(200, {});
  mock.onDelete(`${URL}/f2`).reply(204);
  show();
  doubleTap(await screen.findByTestId("memory-review-f1-confirmed")); // a double tap answers once
  await waitFor(() => expect(mock.history.patch).toHaveLength(1));
  expect(JSON.parse(mock.history.patch[0].data)).toEqual({ state: "confirmed" });
  fireEvent.press(await screen.findByTestId("memory-review-f2-remove"));
  expect(await screen.findByText("Removed from what I remember")).toBeTruthy();
  expect(mock.history.delete.map((r) => r.url)).toEqual([`${URL}/f2`]);
});

it("an answer that fails says so and leaves the fact", async () => {
  mock.onGet(URL).reply(200, { facts: [{ id: "f1", text: "You live in Lyon" }] });
  mock.onPatch(`${URL}/f1`).reply(500);
  show();
  fireEvent.press(await screen.findByTestId("memory-review-f1-kept"));
  expect(await screen.findByTestId("memory-review-error")).toBeTruthy();
  expect(screen.getByText("You live in Lyon")).toBeTruthy();
});

it("in French, the web's words", async () => {
  await i18n.changeLanguage("fr");
  mock.onGet(URL).reply(200, { facts: [{ id: "f1", text: "Vous habitez à Lyon" }] });
  show();
  expect(await screen.findByText("Est-ce toujours vrai ?")).toBeTruthy();
  expect(screen.getByText("Toujours vrai")).toBeTruthy();
});
