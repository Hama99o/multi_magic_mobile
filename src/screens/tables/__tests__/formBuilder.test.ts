/**
 * The form builder's rules (increment 8), checked against the web's
 * FormBuilder.tsx and TableApp::Form.
 */
import type { AvailableField, FormQuestion } from "@/api/tableForms";
import { FORM_LANGUAGES, moveQuestion, parseEmails, questionFor, requiredState, unusedFields } from "../formBuilder";

const f = (id: number, over: Partial<AvailableField> = {}): AvailableField => ({ id, name: `F${id}`, fieldType: "text", required: false, supported: true, ...over });
const q = (fieldId: number, over: Partial<FormQuestion> = {}): FormQuestion => ({ fieldId, label: null, help: null, placeholder: null, required: false, hidden: false, ...over });

it("a form can still ask the supported columns it does not ask yet", () => {
  const form = { availableFields: [f(1), f(2), f(3, { supported: false }), f(4)], questions: [q(2)] };
  expect(unusedFields(form).map((x) => x.id)).toEqual([1, 4]);
});

it("a new question is required when its column is; a required column's switch is locked on", () => {
  expect(questionFor(f(5, { required: true })).required).toBe(true);
  expect(requiredState(q(5), f(5, { required: true }))).toEqual({ on: true, locked: true });
  expect(requiredState(q(6, { required: true }), f(6))).toEqual({ on: true, locked: false });
  expect(requiredState(q(6), f(6))).toEqual({ on: false, locked: false });
});

it("questions move one place; an edge changes nothing", () => {
  const qs = [q(1), q(2), q(3)];
  expect(moveQuestion(qs, 2, -1).map((x) => x.fieldId)).toEqual([1, 3, 2]);
  expect(moveQuestion(qs, 0, -1)).toBe(qs);
});

it("the page's languages are the server's, each in its own name, Dari for fa", () => {
  expect(FORM_LANGUAGES.map((l) => l.code)).toEqual(["", "en", "fr", "ps", "fa", "ar"]);
  expect(FORM_LANGUAGES.find((l) => l.code === "fa")?.name).toBe("دری");
});

it("invite addresses pasted any way are read once each, the rest said apart", () => {
  expect(parseEmails("A@x.test, b@y.test;\nc@z.test  a@X.test <d@w.test> nope @bad")).toEqual({ valid: ["a@x.test", "b@y.test", "c@z.test", "d@w.test"], invalid: ["nope", "@bad"] });
});
