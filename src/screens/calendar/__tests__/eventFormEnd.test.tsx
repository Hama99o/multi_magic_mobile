/**
 * An end before the start is named under the Ends row, and nothing is saved
 * (device QA 2026-11-13: such an end was dropped on save, silently, and the
 * event kept no end at all). The rule itself is `draft.test.ts`; this is the
 * form saying it, in both languages.
 */
import { fireEvent, render, screen } from "@testing-library/react-native";
import i18n from "@/i18n";
import { EventForm } from "../EventForm";
import { newDraft, type Draft } from "../draft";

const draft = (over: Partial<Draft> = {}): Draft => ({ ...newDraft("2026-11-12", new Date(2026, 10, 1, 8, 0)), title: "Dentist", ...over });

function renderForm(d: Draft) {
  const onSave = jest.fn();
  render(<EventForm mode="create" draft={d} onChange={jest.fn()} onCancel={jest.fn()} onSave={onSave} saving={false} saveError={null} />);
  return onSave;
}

afterEach(() => void i18n.changeLanguage("en"));

it("an end before the start: said under Ends, and Save sends nothing", () => {
  const onSave = renderForm(draft({ startTime: "15:00", endTime: "14:00" }));
  fireEvent.press(screen.getByTestId("event-form-save"));
  expect(screen.getByTestId("event-form-end-error")).toHaveTextContent("The event ends before it starts.");
  expect(onSave).not.toHaveBeenCalled();
});

it("in French too", async () => {
  await i18n.changeLanguage("fr");
  renderForm(draft({ startTime: "15:00", endTime: "14:00" }));
  fireEvent.press(screen.getByTestId("event-form-save"));
  expect(screen.getByTestId("event-form-end-error")).toHaveTextContent("L’événement se termine avant de commencer.");
});

it("an end after the start: no message, saved", () => {
  const onSave = renderForm(draft({ startTime: "15:00", endTime: "16:00" }));
  fireEvent.press(screen.getByTestId("event-form-save"));
  expect(screen.queryByTestId("event-form-end-error")).toBeNull();
  expect(onSave).toHaveBeenCalled();
});
