/**
 * The calendar as a full app: every call the phone makes, at the HTTP layer.
 *
 * The request shapes are the server's (`events_controller.rb#event_params`,
 * `#apply_reminders`, `event_shares_controller.rb`), read 2026-11-11 — not the
 * web client's camelCase, because the phone's http layer converts nothing.
 */
import MockAdapter from "axios-mock-adapter";
import { calendarApi, sharesApi, __parse } from "../calendar";
import { ApiShapeError } from "../parse";
import { __resetTokenCache, http } from "../http";
import { __resetFingerprintCache } from "@/lib/fingerprint";

let mock: MockAdapter;

/** `CalendarApp::EventSerializer`, field for field. */
const serverEvent = {
  id: 41,
  title: "Dentist",
  description: "Bring the card",
  location: "12 rue de la Paix",
  kind: "appointment",
  all_day: false,
  starts_on: null,
  ends_on: null,
  starts_at: "2026-11-12T13:30:00.000Z",
  ends_at: "2026-11-12T14:30:00.000Z",
  recurrence: "none",
  recurrence_until: null,
  color: "green",
  status: "published",
  created_at: "2026-11-01T10:00:00.000Z",
  updated_at: "2026-11-01T10:00:00.000Z",
  owner: { id: 3, name: "Sam" },
  current_user_permission: "owner",
  current_user_response: null,
  reminders: [{ id: 9, lead_minutes: 60, dismissed_occurrence_on: null }],
  shares: [{ id: 2, permission: "viewer", response: "pending", shared_with_id: 8, shared_with_name: "Lee" }],
  guest_count: 1,
};

beforeEach(() => {
  mock = new MockAdapter(http);
  __resetTokenCache();
  __resetFingerprintCache();
  (globalThis as { __clearSecureStore?: () => void }).__clearSecureStore?.();
});
afterEach(() => mock.restore());

describe("reading one event", () => {
  it("parses every field the detail page shows", async () => {
    mock.onGet("/api/v1/calendar_app/events/41").reply(200, { event: serverEvent });
    const event = await calendarApi.show(41);
    expect(event).toMatchObject({
      id: 41,
      title: "Dentist",
      description: "Bring the card",
      location: "12 rue de la Paix",
      kind: "appointment",
      allDay: false,
      startsAt: "2026-11-12T13:30:00.000Z",
      endsAt: "2026-11-12T14:30:00.000Z",
      recurrence: null,
      recurrenceUntil: null,
      color: "green",
      owner: { id: 3, name: "Sam" },
      permission: "owner",
      response: null,
      reminders: [{ id: 9, leadMinutes: 60 }],
      shares: [{ id: 2, permission: "viewer", response: "pending", sharedWithId: 8, sharedWithName: "Lee" }],
    });
  });

  it("an unknown permission is NO permission, so no control is drawn for it", () => {
    const event = __parse.parseEvent({ ...serverEvent, current_user_permission: "admin" });
    expect(event.permission).toBeNull();
  });

  it("an occurrence's thin event (no reminders, no shares on the wire) still reads", () => {
    const event = __parse.parseEvent({ id: 1, title: "x", all_day: true, recurrence: null, color: null });
    expect(event.reminders).toEqual([]);
    expect(event.shares).toEqual([]);
    expect(event.permission).toBeNull();
  });

  it("an event without a numeric id is refused at the boundary", () => {
    expect(() => __parse.parseEvent({ ...serverEvent, id: "41" })).toThrow(ApiShapeError);
  });
});

describe("a window of occurrences (the month view)", () => {
  it("asks `occurrences` with from and to, and keeps the server's order", async () => {
    mock.onGet("/api/v1/calendar_app/events/occurrences").reply(200, {
      from: "2026-10-26",
      to: "2026-12-07",
      occurrences: [
        { id: "41:2026-11-12", on: "2026-11-12", starts_at: serverEvent.starts_at, ends_at: serverEvent.ends_at, all_day: false, event: serverEvent },
        { id: "bad", on: 7, event: serverEvent },
      ],
    });
    const page = await calendarApi.occurrences("2026-10-26", "2026-12-07");
    expect(mock.history.get[0].params).toEqual({ from: "2026-10-26", to: "2026-12-07" });
    expect(page.occurrences.map((o) => o.key)).toEqual(["41:2026-11-12"]);
    expect(page.unreadable).toBe(1);
  });
});

describe("writing", () => {
  const timed = {
    title: "Dentist",
    description: null,
    location: null,
    kind: "appointment" as const,
    all_day: false,
    starts_on: null,
    ends_on: null,
    starts_at: "2026-11-12T13:30:00.000Z",
    ends_at: null,
    recurrence: "none" as const,
    recurrence_until: null,
    color: "green",
  };

  it("create sends { event, reminders } in the server's own field names", async () => {
    mock.onPost("/api/v1/calendar_app/events").reply(201, { event: serverEvent });
    const event = await calendarApi.create(timed, [60, 1440]);
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ event: timed, reminders: [60, 1440] });
    expect(event.id).toBe(41);
  });

  it("an EMPTY reminder list is still sent, so removing the last reminder removes it", async () => {
    // `apply_reminders` returns early only when `params[:reminders]` is
    // ABSENT; a JSON [] survives Rails' params and clears them. Pinned on the
    // server by `spec/requests/api/v1/calendar_app/mobile_contract_spec.rb`
    // (multi_magic b55f6ff5), which went red with `.blank?` planted.
    mock.onPut("/api/v1/calendar_app/events/41").reply(200, { event: { ...serverEvent, reminders: [] } });
    const event = await calendarApi.update(41, timed, []);
    expect(JSON.parse(mock.history.put[0].data).reminders).toEqual([]);
    expect(event.reminders).toEqual([]);
  });

  it("delete moves to the trash, and restore brings it back", async () => {
    mock.onDelete("/api/v1/calendar_app/events/41").reply(200, { message: "Event moved to trash" });
    mock.onPut("/api/v1/calendar_app/events/41/restore").reply(200, { event: serverEvent });
    await calendarApi.remove(41);
    const back = await calendarApi.restore(41);
    expect(mock.history.delete[0].url).toBe("/api/v1/calendar_app/events/41");
    expect(back.id).toBe(41);
  });
});

describe("guests", () => {
  const share = { id: 2, permission: "viewer", response: "pending", shared_with_id: 8, shared_with_email: "lee@example.test", shared_with_name: "Lee" };

  it("lists, invites, changes and removes, by the owner", async () => {
    mock.onGet("/api/v1/calendar_app/events/41/event_shares").reply(200, { shares: [share] });
    mock.onPost("/api/v1/calendar_app/events/41/event_shares").reply(201, { share });
    mock.onPut("/api/v1/calendar_app/events/41/event_shares/2").reply(200, { share: { ...share, permission: "editor" } });
    mock.onDelete("/api/v1/calendar_app/events/41/event_shares/2").reply(200, {});

    expect((await sharesApi.list(41))[0]).toMatchObject({ id: 2, sharedWithEmail: "lee@example.test" });
    await sharesApi.invite(41, "  Lee@Example.test ", "editor");
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ share: { email: "lee@example.test", permission: "editor" } });
    expect((await sharesApi.setPermission(41, 2, "editor")).permission).toBe("editor");
    await sharesApi.remove(41, 2);
    expect(mock.history.delete).toHaveLength(1);
  });

  it("a guest answers for themself", async () => {
    mock.onPut("/api/v1/calendar_app/events/41/event_shares/respond").reply(200, { share: { ...share, response: "accepted" } });
    const answered = await sharesApi.respond(41, "accepted");
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ response: "accepted" });
    expect(answered.response).toBe("accepted");
  });
});
