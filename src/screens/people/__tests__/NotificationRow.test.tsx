/**
 * A notification row. The body is one line, except the morning brief
 * (multi_magic 55ca44c): several short lines, each the point. A tap here
 * composes a question rather than opening anything, so a brief cut to one
 * line had nowhere else on the phone to be read (found 2026-09-24, comparing
 * the backend's commits with the phone).
 */
import { render, screen } from "@testing-library/react-native";
import { NotificationRow } from "../NotificationRow";
import type { AppNotification } from "@/api/notifications";

const notification = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: 1, kind: "loan.due", title: "Anisa's loan is due", body: "500 due on 20 September",
  path: null, readAt: null, createdAt: new Date().toISOString(), subjectType: null, subjectId: null, actor: null,
  ...over,
});

it("keeps an ordinary body to one line", () => {
  render(<NotificationRow notification={notification()} onPress={jest.fn()} onLongPress={jest.fn()} />);
  expect(screen.getByText("500 due on 20 September").props.numberOfLines).toBe(1);
});

it("shows the whole morning brief", () => {
  const body = "09:00 Dentist\nAnisa's birthday on Friday\nGroceries: 310 EUR this month";
  render(
    <NotificationRow notification={notification({ kind: "ai.morning_brief", title: "Your morning", body })} onPress={jest.fn()} onLongPress={jest.fn()} />,
  );
  expect(screen.getByText(body).props.numberOfLines).toBeUndefined();
});
