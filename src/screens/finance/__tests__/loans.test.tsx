/**
 * Finance › Loans, screen by screen, at the HTTP layer (`docs/design/finance/SPEC.md`
 * §D.6-7, F18-F20, B5 B8 B10 B11): the real API functions and parsers run
 * against a small stateful server in the server's own shapes (snake_case,
 * money as strings, `total_paid` the integer 0 with no payment), and every
 * write is asserted by the body it sends.
 *
 * What this cannot see: a pixel, the swipe's physics (PanResponder; the
 * swipe's action is reached here through the row's accessibility action, the
 * same handler), the native modal, and whether a French line fits 360 dp.
 * Invented data only: this repo is public.
 */
import MockAdapter from "axios-mock-adapter";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import i18n from "@/i18n";
import { http, __resetTokenCache } from "@/api/http";
import { __resetFingerprintCache } from "@/lib/fingerprint";
import { testQueryClient } from "@/__tests__/queryClient";
import { useFinanceUndo } from "@/stores/financeUndo.store";
import { addDays, todayKey } from "@/screens/calendar/dates";
import { router as mockedRouter } from "expo-router";
import { LoansTab } from "../tabs/Loans";
import LoanDetail from "../../../../app/finance/loan";
import LoanEdit from "../../../../app/finance/loan-edit";

const mockParams: { current: Record<string, string> } = { current: {} };
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams.current,
  Link: ({ children }: { children: unknown }) => children,
}));

const router = mockedRouter as unknown as { push: jest.Mock; back: jest.Mock; replace: jest.Mock };
const B = "/api/v1/my_finance_app";
const CONTACTS = "/api/v1/contact_app/contacts";
const TODAY = todayKey();
let mock: MockAdapter;
/** A refetch after a filter or a write, on a busy machine. */
const SLOW = { timeout: 4000 };
/**
 * Whether a text is on screen, as a boolean. `expect(queryByText(x)).toBeNull()`
 * inside a waitFor pretty-prints the whole React fiber on every miss (about
 * two seconds each), which starves the very timers the wait is waiting for.
 */
const shown = (text: string) => screen.queryByText(text) !== null;

function renderScreen(element: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{element}</QueryClientProvider>);
}

type Payment = { id: number; loan_id: number; amount: string; payment_date: string; created_at: string; updated_at: string };
type Row = {
  id: number; description: string | null; due_date: string | null; amount: string; contact_name: string; loan_type: "given" | "taken";
  status: "paid" | "unpaid" | "trashed"; currency: string; tag_id: number | null; total_paid: string | number; remaining_amount: string;
  category: string | null; loan_payments: Payment[]; amount_with_currency: string; labels: { id: number; name: string }[]; label_ids: number[];
};

const payment = (id: number, loanId: number, amount: string, day: string): Payment => ({
  id, loan_id: loanId, amount, payment_date: `${day}T00:00:00.000Z`, created_at: "x", updated_at: "x",
});
function loan(id: number, over: Partial<Row> = {}): Row {
  const row: Row = {
    id, description: null, due_date: null, amount: "200.0", contact_name: `Person ${id}`, loan_type: "given", status: "unpaid", currency: "eur",
    tag_id: null, total_paid: 0, remaining_amount: "200.0", category: null, loan_payments: [], amount_with_currency: "200.0 eur", labels: [], label_ids: [],
    ...over,
  };
  return settle(row);
}
/** The server's own arithmetic after every change: totals, remaining, status. */
function settle(row: Row): Row {
  const paid = row.loan_payments.reduce((s, p) => s + Number(p.amount), 0);
  row.total_paid = paid ? String(paid) : 0;
  row.remaining_amount = String(Number(row.amount) - paid);
  if (row.status !== "trashed") row.status = Number(row.amount) - paid <= 0 ? "paid" : "unpaid";
  return row;
}

const tags = [
  { id: 3, name: "Family", created_at: "x", parent_id: null, position: 0, description: null, color: "no_color" },
  { id: 4, name: "Rent", created_at: "x", parent_id: 3, position: 0, description: null, color: "no_color" },
];
const contact = (id: number, firstname: string, lastname: string) => ({
  id, firstname, lastname, nickname: null, company: null, job_title: null, favorite: false, birth_date: null, age: null, photo_url: null,
  email: null, phone: null, is_self: false, phones: [], emails: [], addresses: [], relations: [], documents: [], website: null, notes: null,
});

const bodies = (method: "post" | "put" | "delete", url: string) =>
  mock.history[method].filter((r) => r.url === url).map((r) => (r.data ? JSON.parse(r.data) : null));

/**
 * A tiny loans server: every write changes `db` and every read answers from
 * it, so the refetch after a write sees what the write did.
 */
function serve(rows: Row[]) {
  const db = { loans: rows, nextId: 100, nextPayment: 500 };
  const idIn = (url: string | undefined, re: RegExp) => Number(url?.match(re)?.[1]);
  const find = (url?: string) => db.loans.find((l) => l.id === idIn(url, /loans\/(\d+)/));
  const list = (status: Row["status"]) => (cfg: { params?: Record<string, unknown> }) => {
    const p = cfg.params ?? {};
    const term = typeof p.search === "string" ? p.search.toLowerCase() : "";
    const found = db.loans.filter((l) => l.status === status && (!p.loan_type || l.loan_type === p.loan_type) && (!term || l.contact_name.toLowerCase().includes(term)));
    return [200, { loans: found, meta: { totals: {}, pagy: { page: 1, pages: 1, count: found.length }, total_count: found.length } }] as [number, unknown];
  };
  mock.onGet(`${B}/loans`).reply(list("unpaid"));
  mock.onGet(`${B}/loans/paid`).reply(list("paid"));
  mock.onGet(new RegExp(`${B}/loans/\\d+$`)).reply((cfg) => {
    const l = find(cfg.url);
    return l ? [200, { loan: l }] : [404, { error: "Loan not found" }];
  });
  mock.onPost(`${B}/loans`).reply((cfg) => {
    const body = JSON.parse(cfg.data).loan;
    const l = loan(db.nextId++, { ...body, amount: String(body.amount), status: "unpaid" });
    db.loans.unshift(l);
    return [201, { loan: l }];
  });
  mock.onPut(new RegExp(`${B}/loans/\\d+$`)).reply((cfg) => {
    const l = find(cfg.url)!;
    const body = JSON.parse(cfg.data).loan;
    Object.assign(l, { ...body, amount: String(body.amount) });
    return [200, { loan: settle(l) }];
  });
  mock.onDelete(new RegExp(`${B}/loans/\\d+$`)).reply((cfg) => {
    const l = find(cfg.url)!;
    l.status = "trashed";
    return [200, { ...l, user_id: 1 }];
  });
  mock.onPut(new RegExp(`${B}/loans/\\d+/restore$`)).reply((cfg) => {
    const l = find(cfg.url)!;
    l.status = "unpaid";
    return [200, { ...l, user_id: 1 }];
  });
  mock.onPost(new RegExp(`${B}/loans/\\d+/create_payment$`)).reply((cfg) => {
    const l = find(cfg.url)!;
    const { amount, payment_date } = JSON.parse(cfg.data).loan_payment;
    const left = Number(l.remaining_amount);
    if (amount > left) return [422, { status: "error", errors: [`Amount must be less than or equal to ${left.toFixed(1)}`] }];
    l.loan_payments.push(payment(db.nextPayment++, l.id, String(amount), payment_date));
    return [200, { status: "success", loan: settle(l) }];
  });
  mock.onDelete(new RegExp(`${B}/loan_payments/\\d+$`)).reply((cfg) => {
    const pid = idIn(cfg.url, /loan_payments\/(\d+)/);
    const l = db.loans.find((x) => x.loan_payments.some((p) => p.id === pid))!;
    l.loan_payments = l.loan_payments.filter((p) => p.id !== pid);
    settle(l);
    return [200, { message: "Payment deleted successfully" }];
  });
  mock.onGet(`${B}/tags`).reply(200, { tags, meta: { pagy: { page: 1, pages: 1 }, total_count: tags.length } });
  mock.onGet(CONTACTS).reply(200, { contacts: [contact(7, "Jamil", "Safi"), contact(8, "Quinn", "Ortega")], meta: { pagy: { page: 1, pages: 1 }, total_count: 2 } });
  return db;
}

/** Three active loans across two currencies and both ways, and one paid back. */
const standard = () =>
  serve([
    loan(31, { contact_name: "Quinn Ortega", due_date: addDays(TODAY, -3), loan_payments: [payment(5, 31, "50.0", "2026-11-10")] }),
    loan(32, { contact_name: "Ravi Menon", currency: "usd", amount: "10.0", amount_with_currency: "10.0 usd" }),
    loan(33, { contact_name: "Lena Brook", loan_type: "taken", amount: "40.0", due_date: addDays(TODAY, 20) }),
    loan(34, { contact_name: "Ana Paid", amount: "30.0", loan_payments: [payment(6, 34, "30.0", "2026-11-01")] }),
  ]);

beforeEach(async () => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  mockParams.current = {};
  router.push.mockClear();
  router.back.mockClear();
  router.replace.mockClear();
  useFinanceUndo.getState().clear();
  await AsyncStorage.clear();
  await i18n.changeLanguage("en");
});
afterEach(() => mock.restore());

describe("the Loans tab", () => {
  it("sums To receive and To pay per currency over every active loan, and lists them newest first", async () => {
    standard();
    renderScreen(<LoansTab />);
    await waitFor(() => expect(screen.getByTestId("finance-loans-receive-amount")).toHaveTextContent("€150.00 · $10.00"));
    expect(screen.getByTestId("finance-loans-receive-count")).toHaveTextContent("2 active");
    expect(screen.getByTestId("finance-loans-pay-amount")).toHaveTextContent("€40.00");
    expect(screen.getByTestId("finance-loans-pay-count")).toHaveTextContent("1 active");

    expect(await screen.findByText("Quinn Ortega")).toBeTruthy();
    const ids = screen.getAllByTestId(/^finance-loan-row-\d+$/).map((n) => n.props.testID);
    expect(ids).toEqual(["finance-loan-row-31", "finance-loan-row-32", "finance-loan-row-33"]);
    const quinn = within(screen.getByTestId("finance-loan-row-31"));
    expect(quinn.getByText("you lent")).toBeTruthy();
    expect(quinn.getByTestId("finance-loan-remaining-31")).toHaveTextContent("€150.00");
    expect(quinn.getByText("of €200.00")).toBeTruthy();
    expect(quinn.getByText("25% paid")).toBeTruthy();
    expect(quinn.getByTestId("finance-loan-due-31")).toHaveTextContent(/^Overdue/);
    expect(within(screen.getByTestId("finance-loan-row-33")).getByText("you borrowed")).toBeTruthy();
    expect(within(screen.getByTestId("finance-loan-row-33")).getByTestId("finance-loan-due-33")).toHaveTextContent(/^Due/);
    expect(shown("Ana Paid")).toBe(false);
  });

  it("switches to the paid loans, each with its Paid badge, and filters by lent or borrowed", async () => {
    standard();
    renderScreen(<LoansTab />);
    await screen.findByText("Quinn Ortega");
    fireEvent.press(screen.getByTestId("finance-loans-type-taken"));
    expect(await screen.findByText("Lena Brook", {}, SLOW)).toBeTruthy();
    expect(shown("Quinn Ortega")).toBe(false);
    expect(mock.history.get.some((r) => r.url === `${B}/loans` && r.params?.loan_type === "taken")).toBe(true);
    fireEvent.press(screen.getByTestId("finance-loans-type-taken"));
    fireEvent.press(screen.getByTestId("finance-loans-paid"));
    expect(await screen.findByText("Ana Paid", {}, SLOW)).toBeTruthy();
    expect(screen.getByTestId("finance-loan-paid-badge-34")).toHaveTextContent("Paid");
    expect(shown("Lena Brook")).toBe(false);
  });

  it("searches by name after a pause", async () => {
    standard();
    renderScreen(<LoansTab />);
    await screen.findByText("Quinn Ortega");
    fireEvent.changeText(screen.getByTestId("finance-loans-search"), "ravi");
    await waitFor(() => expect(shown("Quinn Ortega")).toBe(false), SLOW);
    expect(await screen.findByText("Ravi Menon", {}, SLOW)).toBeTruthy();
    expect(mock.history.get.some((r) => r.url === `${B}/loans` && r.params?.search === "ravi")).toBe(true);
  });

  it("opens a loan, and the button opens a new one", async () => {
    standard();
    renderScreen(<LoansTab />);
    fireEvent.press(await screen.findByTestId("finance-loan-row-32"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/finance/loan", params: { id: "32" } });
    fireEvent.press(screen.getByTestId("finance-loans-new"));
    expect(router.push).toHaveBeenCalledWith("/finance/loan-edit");
  });

  it("deletes a loan from its row, with Undo that restores it", async () => {
    const db = standard();
    renderScreen(<LoansTab />);
    const row = await screen.findByTestId("finance-loan-row-32");
    fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "delete" } });
    await waitFor(() => {
      expect(shown("Ravi Menon")).toBe(false);
      expect(screen.getByText("Loan deleted")).toBeTruthy();
    }, SLOW);
    expect(mock.history.delete.map((r) => r.url)).toContain(`${B}/loans/32`);
    fireEvent.press(screen.getByTestId("finance-loans-undo-button"));
    await waitFor(() => expect(mock.history.put.map((r) => r.url)).toContain(`${B}/loans/32/restore`), SLOW);
    expect(db.loans.find((l) => l.id === 32)!.status).toBe("unpaid");
    expect(await screen.findByText("Ravi Menon", {}, SLOW)).toBeTruthy();
  });

  it("with no loan, says so and offers to write one down", async () => {
    serve([]);
    renderScreen(<LoansTab />);
    expect(await screen.findByText("No one owes you, and you owe no one")).toBeTruthy();
    expect(screen.getByTestId("finance-loans-empty")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("finance-loans-receive-count")).toHaveTextContent("0 active"));
  });

  it("says when the loans could not load", async () => {
    mock.onGet(`${B}/loans`).networkError();
    renderScreen(<LoansTab />);
    expect(await screen.findByTestId("finance-loans-load-failed")).toBeTruthy();
  });
});

describe("a loan", () => {
  beforeEach(() => {
    mockParams.current = { id: "31" };
  });

  it("shows what is left, the share paid, its fields and its payments", async () => {
    standard();
    renderScreen(<LoanDetail />);
    await waitFor(() => expect(screen.getByTestId("finance-loan-remaining")).toHaveTextContent("€150.00"));
    expect(screen.getByText("of €200.00")).toBeTruthy();
    expect(screen.getByTestId("finance-loan-progress")).toHaveTextContent("25% paid · €50.00");
    expect(screen.getAllByText("Quinn Ortega").length).toBeGreaterThan(0);
    expect(screen.getByText("Not paid yet")).toBeTruthy();
    expect(screen.getByText("Payments (1)")).toBeTruthy();
    expect(within(screen.getByTestId("finance-loan-payment-5")).getByText("€50.00")).toBeTruthy();
  });

  it("adds a payment of the rest: the loan is paid and Add payment goes away", async () => {
    standard();
    renderScreen(<LoanDetail />);
    fireEvent.press(await screen.findByTestId("finance-loan-add-payment"));
    fireEvent.press(screen.getByTestId("finance-payment-rest"));
    expect(screen.getByTestId("finance-payment-amount")).toHaveTextContent("€150");
    fireEvent.press(screen.getByTestId("finance-payment-save"));
    await waitFor(() => expect(bodies("post", `${B}/loans/31/create_payment`)).toEqual([{ loan_payment: { amount: 150, payment_date: TODAY } }]));
    await waitFor(() => expect(screen.getByTestId("finance-loan-paid-badge")).toBeTruthy());
    expect(screen.queryByTestId("finance-loan-add-payment")).toBeNull();
    expect(screen.queryByTestId("finance-payment-sheet")).toBeNull();
    expect(screen.getByTestId("finance-loan-progress")).toHaveTextContent("100% paid · €200.00");
  });

  it("shows the server's reason when a payment is more than what is left", async () => {
    standard();
    renderScreen(<LoanDetail />);
    fireEvent.press(await screen.findByTestId("finance-loan-add-payment"));
    for (const k of ["9", "9", "9"]) fireEvent.press(screen.getByTestId(`finance-payment-pad-${k}`));
    fireEvent.press(screen.getByTestId("finance-payment-save"));
    expect(await screen.findByText("Amount must be less than or equal to 150.0")).toBeTruthy();
    expect(screen.getByTestId("finance-payment-sheet")).toBeTruthy();
  });

  it("deletes a payment after asking", async () => {
    standard();
    const alert = jest.spyOn(Alert, "alert");
    renderScreen(<LoanDetail />);
    fireEvent.press(await screen.findByTestId("finance-loan-payment-delete-5"));
    expect(alert.mock.calls[0][0]).toBe("Delete this payment?");
    act(() => alert.mock.calls[0][2]!.find((b) => b.style === "destructive")!.onPress!());
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toContain(`${B}/loan_payments/5`));
    await waitFor(() => expect(screen.getByTestId("finance-loan-remaining")).toHaveTextContent("€200.00"));
    expect(screen.getByText("No payment yet")).toBeTruthy();
    alert.mockRestore();
  });

  it("deletes the loan after asking, goes back, and offers Undo", async () => {
    standard();
    const alert = jest.spyOn(Alert, "alert");
    renderScreen(<LoanDetail />);
    await screen.findByTestId("finance-loan-remaining");
    fireEvent.press(screen.getByTestId("finance-loan-delete"));
    expect(alert.mock.calls[0][0]).toBe("Delete this loan?");
    act(() => alert.mock.calls[0][2]!.find((b) => b.style === "destructive")!.onPress!());
    await waitFor(() => expect(mock.history.delete.map((r) => r.url)).toContain(`${B}/loans/31`));
    expect(router.back).toHaveBeenCalled();
    const offer = useFinanceUndo.getState().offer;
    expect(offer?.message).toBe("Loan deleted");
    act(() => offer!.undo!());
    await waitFor(() => expect(mock.history.put.map((r) => r.url)).toContain(`${B}/loans/31/restore`));
    alert.mockRestore();
  });

  it("opens the form to edit it", async () => {
    standard();
    renderScreen(<LoanDetail />);
    await screen.findByTestId("finance-loan-remaining");
    fireEvent.press(screen.getByTestId("finance-loan-edit"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/finance/loan-edit", params: { id: "31" } });
  });
});

describe("the loan form", () => {
  it("writes down a new loan with the person picked from Contacts", async () => {
    standard();
    renderScreen(<LoanEdit />);
    fireEvent.press(await screen.findByTestId("finance-loan-form-type-taken"));
    fireEvent.press(screen.getByTestId("finance-loan-form-from-contacts"));
    fireEvent.changeText(await screen.findByTestId("finance-loan-contacts-search"), "jam");
    await waitFor(() => expect(shown("Quinn Ortega")).toBe(false));
    fireEvent.press(screen.getByTestId("finance-loan-contact-7"));
    expect(screen.getByTestId("finance-loan-form-name").props.value).toBe("Jamil Safi");
    for (const k of ["1", "2", "0", "dot", "5"]) fireEvent.press(screen.getByTestId(`finance-loan-form-pad-${k}`));
    fireEvent.press(screen.getByTestId("finance-loan-form-currency"));
    fireEvent.press(screen.getByTestId("finance-loan-form-currencies-usd"));
    fireEvent.press(screen.getByTestId("finance-loan-form-due-week"));
    fireEvent.press(screen.getByTestId("finance-loan-form-tags"));
    fireEvent.press(await screen.findByTestId("finance-loan-form-tagpicker-tag-4"));
    fireEvent.press(screen.getByTestId("finance-loan-form-tagpicker-done"));
    fireEvent.changeText(screen.getByTestId("finance-loan-form-description"), "Train tickets");
    fireEvent.press(screen.getByTestId("finance-loan-form-save"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(bodies("post", `${B}/loans`)).toEqual([
      {
        loan: {
          loan_type: "taken",
          contact_name: "Jamil Safi",
          amount: 120.5,
          currency: "usd",
          due_date: addDays(TODAY, 7),
          description: "Train tickets",
          tag_id: 3,
          label_ids: [3, 4],
        },
      },
    ]);
    expect(await AsyncStorage.getItem("finance_last_currency")).toBe("usd");
  });

  it("starts in the last currency used on this phone, and needs a name and an amount", async () => {
    standard();
    await AsyncStorage.setItem("finance_last_currency", "gbp");
    renderScreen(<LoanEdit />);
    await waitFor(() => expect(screen.getByTestId("finance-loan-form-currency")).toHaveTextContent("£ GBP"));
    expect(screen.getByTestId("finance-loan-form-save")).toBeDisabled();
    fireEvent.changeText(screen.getByTestId("finance-loan-form-name"), "Ravi");
    expect(screen.getByTestId("finance-loan-form-save")).toBeDisabled();
    fireEvent.press(screen.getByTestId("finance-loan-form-pad-5"));
    expect(screen.getByTestId("finance-loan-form-save")).not.toBeDisabled();
  });

  it("edits a loan, keeping its category and labels", async () => {
    standard().loans[0].label_ids = [3];
    mockParams.current = { id: "31" };
    renderScreen(<LoanEdit />);
    await waitFor(() => expect(screen.getByTestId("finance-loan-form-name").props.value).toBe("Quinn Ortega"));
    expect(screen.getByTestId("finance-loan-form-amount")).toHaveTextContent("€200");
    fireEvent.press(screen.getByTestId("finance-loan-form-due-none"));
    fireEvent.press(screen.getByTestId("finance-loan-form-save"));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(bodies("put", `${B}/loans/31`)).toEqual([
      { loan: { loan_type: "given", contact_name: "Quinn Ortega", amount: 200, currency: "eur", due_date: null, description: null, tag_id: 3, label_ids: [3] } },
    ]);
  });
});

describe("in French", () => {
  it("the tab and a loan speak French", async () => {
    await i18n.changeLanguage("fr");
    standard();
    renderScreen(<LoansTab />);
    expect(await screen.findByText("À recevoir")).toBeTruthy();
    expect(screen.getByText("À rembourser")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("finance-loans-receive-count")).toHaveTextContent("2 en cours"));
    expect(within(await screen.findByTestId("finance-loan-row-31")).getByText("vous avez prêté")).toBeTruthy();
    expect(within(screen.getByTestId("finance-loan-row-31")).getByText("25 % remboursé")).toBeTruthy();
  });
});
