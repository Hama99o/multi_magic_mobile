/**
 * Forms on screen (increment 8): the list (newest first), a new form, the
 * builder's questions, who can fill it, invitations (an email to each, said
 * first), and the answers opening their rows.
 */
import MockAdapter from "axios-mock-adapter";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import { configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { testQueryClient } from "@/__tests__/queryClient";
import { a11yFindings } from "@/__tests__/a11ySweep";

import { router as mockedRouter } from "expo-router";
import FormsScreen from "../../../../app/tables/forms";
import FormScreen from "../../../../app/tables/form";

// Under a full run's load (one worker, an emulator up) a first render of a Tables screen can pass the
// default 1 s of findBy/waitFor: one unnamed tablesApp failure in 1 of 3 full runs on 2026-11-21, and
// formsScreens before it. Every wait in this suite gets 5 s: bounded, not removed.
configure({ asyncUtilTimeout: 5_000 });

/** Two taps in the same frame, before any re-render: what a double tap is. */
const doubleTap = (el: Parameters<typeof fireEvent.press>[0]) => {
  fireEvent.press(el);
  fireEvent.press(el);
};

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
  useNavigation: () => ({ addListener: jest.fn(() => () => undefined), dispatch: jest.fn() }),
}));
jest.mock("expo-clipboard", () => require("@/__tests__/screenMocks").clipboard);

const B = "/api/v1/table_app";
let mock: MockAdapter;
const router = mockedRouter as unknown as { push: jest.Mock; back: jest.Mock };
const ownerView = (over: Record<string, unknown> = {}) => ({
  id: 7, table_id: 10, base_id: 3, name: "Orders", slug: "abc123", access_mode: "public",
  fields: [{ field_id: 1, label: null, help: null, placeholder: null, required: true, hidden: false }],
  settings: {}, accepting: true, allow_multiple: false, closes_at: null, max_submissions: null, submissions_count: 0, closed: false, cover_url: null,
  available_fields: [{ id: 1, name: "Name", field_type: "text", required: true, supported: true }, { id: 2, name: "Phone", field_type: "phone", required: false, supported: true }],
  invites: [], ...over,
});
const render_ = (el: ReactElement) => render(<QueryClientProvider client={testQueryClient()}>{el}</QueryClientProvider>);

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  router.push.mockClear();
  router.back.mockClear();
  await AsyncStorage.clear();
  await i18n.changeLanguage("en");
});
afterEach(() => {
  mock.restore();
  jest.restoreAllMocks();
});

it("lists the table's forms newest first; New form makes one and opens it", async () => {
  mockParams.current = { table: "10" };
  mock.onGet(`${B}/tables/10/forms`).reply(200, { forms: [{ id: 5, table_id: 10, name: "Old", access_mode: "public", accepting: true, closed: false, submissions_count: 2 }, { id: 6, table_id: 10, name: "New", access_mode: "invited", accepting: false, closed: false, submissions_count: 0 }] });
  mock.onPost(`${B}/tables/10/forms`).reply(201, { form: ownerView({ id: 8 }) });
  render_(<FormsScreen />);
  expect(within(await screen.findByTestId("tables-forms-0")).getByText("New")).toBeTruthy();
  expect(within(screen.getByTestId("tables-forms-0")).getByText("Invited people · 0 answers · Not taking answers")).toBeTruthy();
  doubleTap(screen.getByTestId("tables-forms-new"));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/tables/form", params: { id: "8", table: "10" } }));
  expect(mock.history.post).toHaveLength(1); // a double tap makes one form
});

it("a question is added from an unused column; the title column's required switch is locked on", async () => {
  mockParams.current = { id: "7", table: "10" };
  mock.onGet(`${B}/forms/7`).reply(200, { form: ownerView() });
  mock.onPatch(`${B}/forms/7`).reply(200, { form: ownerView({ fields: [ownerView().fields[0], { field_id: 2, label: null, help: null, placeholder: null, required: false, hidden: false }] }) });
  render_(<FormScreen />);
  const required = await screen.findByTestId("tables-form-question-0-required");
  expect(required.props.disabled).toBe(true);
  fireEvent.press(screen.getByTestId("tables-form-add-2"));
  await waitFor(() => expect(mock.history.patch).toHaveLength(1));
  expect(JSON.parse(mock.history.patch[0].data).form.fields.map((f: { field_id: number }) => f.field_id)).toEqual([1, 2]);
  expect(await screen.findByTestId("tables-form-question-1")).toBeTruthy();
});

it("who can fill it: invited; invitations name every address and send only on yes", async () => {
  mockParams.current = { id: "7", table: "10" };
  mock.onGet(`${B}/forms/7`).reply(200, { form: ownerView({ access_mode: "invited" }) });
  mock.onPost(`${B}/forms/7/invites`).reply(201, { invited: ["a@x.test", "b@y.test"], skipped: [], form: ownerView({ access_mode: "invited", invites: [{ id: 2, email: "a@x.test", joined: false, used_at: null }, { id: 3, email: "b@y.test", joined: true, used_at: null }] }) });
  const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.text === "Send")?.onPress?.());
  render_(<FormScreen />);
  fireEvent.press(await screen.findByText("Share"));
  expect(screen.getByTestId("tables-form-access-invited").props.accessibilityState.selected).toBe(true);
  fireEvent.changeText(screen.getByTestId("tables-form-emails"), "a@x.test, B@y.test\nnot-one");
  expect(screen.getByTestId("tables-form-emails-invalid")).toBeTruthy();
  expect(screen.getByTestId("tables-form-invite").props.accessibilityState.disabled).toBe(true); // nothing goes while one is not an address
  fireEvent.changeText(screen.getByTestId("tables-form-emails"), "a@x.test, B@y.test");
  fireEvent.press(screen.getByTestId("tables-form-invite"));
  expect(alert.mock.calls[0][0]).toBe("Send 2 invitation emails?");
  expect(alert.mock.calls[0][1]).toBe("To: a@x.test, b@y.test");
  await waitFor(() => expect(JSON.parse(mock.history.post[0].data)).toEqual({ emails: ["a@x.test", "b@y.test"] }));
  expect(await screen.findByTestId("tables-form-invite-1")).toBeTruthy();
});

it("answers that do not load say so, with Try again", async () => {
  mockParams.current = { id: "7", table: "10" };
  mock.onGet(`${B}/forms/7`).reply(200, { form: ownerView({ submissions_count: 1 }) });
  mock.onGet(`${B}/forms/7/submissions`).networkErrorOnce();
  render_(<FormScreen />);
  fireEvent.press(await screen.findByText("Answers"));
  expect(await screen.findByTestId("tables-form-answers-failed")).toBeTruthy();
  mock.onGet(`${B}/forms/7/submissions`).reply(200, { submissions: [], meta: { total_count: 0, offset: 0, limit: 50 } });
  fireEvent.press(screen.getByText("Try again"));
  // The refetch is an async chain; under a full run's load 1 s (the default) was not always enough
  // (failed once in the Finance branch's gates, 2026-11-21). Bounded, not removed.
  await waitFor(() => expect(screen.queryByTestId("tables-form-answers-failed")).toBeNull(), { timeout: 10_000 });
});

it("every tab of the builder names every control for a screen reader", async () => {
  mockParams.current = { id: "7", table: "10" };
  mock.onGet(`${B}/forms/7`).reply(200, { form: ownerView() });
  mock.onGet(`${B}/forms/7/submissions`).reply(200, { submissions: [], meta: { total_count: 0, offset: 0, limit: 50 } });
  render_(<FormScreen />);
  for (const tab of ["Questions", "Page", "Share", "Answers"]) {
    fireEvent.press(await screen.findByText(tab));
    await waitFor(() => expect(a11yFindings()).toEqual([]));
  }
});

it("an answer opens its row", async () => {
  mockParams.current = { id: "7", table: "10" };
  mock.onGet(`${B}/forms/7`).reply(200, { form: ownerView({ submissions_count: 1 }) });
  mock.onGet(`${B}/forms/7/submissions`).reply(200, { submissions: [{ id: 1, created_at: "2026-11-21T09:00:00Z", record_id: 501, record_title: "Blue scarf", submitter_email: "a@x.test", submitter_name: null }], meta: { total_count: 1, offset: 0, limit: 50 } });
  render_(<FormScreen />);
  fireEvent.press(await screen.findByText("Answers"));
  fireEvent.press(await screen.findByTestId("tables-form-answer-0"));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/tables/record", params: { table: "10", id: "501" } });
});
