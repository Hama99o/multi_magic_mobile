/**
 * The family tree (audit #25, web `FamilyTreeView`), on a phone: the
 * server's tree (`GET contacts/:id/family`) read as rows by generation,
 * oldest first, each person a tap away. Invented people.
 */
import MockAdapter from "axios-mock-adapter";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { router as mockedRouter } from "expo-router";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import FamilyTree from "../../../../app/contacts/family";

const mockParams: { current: Record<string, string> } = { current: { id: "7" } };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams.current,
}));

const router = mockedRouter as unknown as { push: jest.Mock; back: jest.Mock };
const URL = "/api/v1/contact_app/contacts/7/family";
let mock: MockAdapter;

const node = (id: number, name: string, generation: number, relation: string | null, over: Record<string, unknown> = {}) => ({
  id, name, generation, relation, gender: "unknown", is_self: false, deceased_on: null, age: null, ...over,
});

function renderTree() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <FamilyTree />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  await i18n.changeLanguage("en");
  router.push.mockClear();
});
afterEach(() => mock.restore());

it("reads the tree by generation, oldest first, with what each person is to the root", async () => {
  mock.onGet(URL).reply(200, {
    root_id: 7,
    nodes: [
      node(12, "Noor Safi", 1, "daughter"),
      node(9, "Wali Safi", -1, "father", { deceased_on: "2020-01-01" }),
      node(7, "Jamil Safi", 0, null, { is_self: true }),
      node(8, "Anisa Safi", 0, "sister", { age: 30 }),
      node(5, "Gul Safi", -2, "grandmother"),
    ],
    edges: [],
  });
  renderTree();
  const rows = await screen.findAllByTestId(/^family-tree-row-/);
  expect(rows.map((r) => r.props.testID)).toEqual(["family-tree-row--2", "family-tree-row--1", "family-tree-row-0", "family-tree-row-1"]);
  expect(rows[0]).toHaveTextContent(/^Grandparents/);
  expect(rows[1]).toHaveTextContent(/Parents.*Wali Safi.*father · deceased/);
  expect(rows[2]).toHaveTextContent(/Same generation/);
  expect(screen.getByTestId("family-tree-person-7")).toHaveTextContent(/Jamil Safi.*you/);
  expect(screen.getByTestId("family-tree-person-8")).toHaveTextContent(/sister · 30 years old/);
  expect(rows[3]).toHaveTextContent(/^Children.*Noor Safi/);
  expect(screen.getByTestId("header-title")).toHaveTextContent("Family of Jamil Safi");
});

it("a tap opens that person", async () => {
  mock.onGet(URL).reply(200, { root_id: 7, nodes: [node(7, "Jamil Safi", 0, null), node(9, "Wali Safi", -1, "father")], edges: [] });
  renderTree();
  fireEvent.press(await screen.findByTestId("family-tree-person-9"));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/contacts/contact", params: { id: "9" } });
});

it("says how to start when only the person is on it", async () => {
  mock.onGet(URL).reply(200, { root_id: 7, nodes: [node(7, "Jamil Safi", 0, null)], edges: [] });
  renderTree();
  expect(await screen.findByTestId("family-tree-empty")).toHaveTextContent("Add a parent, a child or a partner to see the tree.");
});

it("a failed load says so and retries", async () => {
  let calls = 0;
  mock.onGet(URL).reply(() => (++calls === 1 ? [500, {}] : [200, { root_id: 7, nodes: [node(7, "Jamil Safi", 0, null), node(9, "Wali Safi", -1, "father")], edges: [] }]));
  renderTree();
  fireEvent.press(await screen.findByText("Try again"));
  await waitFor(() => expect(screen.getByTestId("family-tree-person-9")).toBeTruthy());
});
