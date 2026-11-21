/**
 * THE FORM BUILDER'S RULES (increment 8; the web's `FormBuilder.tsx`), pure
 * so each is a test:
 *   - a form can ask the columns `TableApp::Form::FIELD_TYPES` supports, each once;
 *   - a column that is required stays required on its form (the switch is locked);
 *   - an example ("placeholder") only for the typed-in kinds;
 *   - the page's language, each in its own name (Dari, not "Persian", for Afghan users);
 *   - invite addresses pasted in any form, checked before anything is sent.
 */
import type { AvailableField, FormQuestion, TableForm } from "@/api/tableForms";

/** The web's `TAKES_PLACEHOLDER`. */
export const TAKES_PLACEHOLDER = ["text", "long_text", "decimal", "phone", "email", "url"];

/** `TableApp::Form::LANGUAGES`, each in its own name (the web's select); "" = the visitor's language. */
export const FORM_LANGUAGES: { code: string; name: string | null }[] = [
  { code: "", name: null },
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
  { code: "ps", name: "پښتو" },
  { code: "fa", name: "دری" },
  { code: "ar", name: "العربية" },
];

/** Columns the form could still ask: supported, and not asked yet. */
export function unusedFields(form: Pick<TableForm, "availableFields" | "questions">): AvailableField[] {
  const asked = new Set(form.questions.map((q) => q.fieldId));
  return form.availableFields.filter((f) => f.supported && !asked.has(f.id));
}

/** A new question for a column: its own name, required when the column is. */
export const questionFor = (field: AvailableField): FormQuestion => ({ fieldId: field.id, label: null, help: null, placeholder: null, required: field.required, hidden: false });

/** Whether the question is required, and whether the person may change that (not when the column requires it). */
export function requiredState(q: FormQuestion, field: AvailableField | undefined): { on: boolean; locked: boolean } {
  const byColumn = field?.required === true;
  return { on: q.required || byColumn, locked: byColumn };
}

export function moveQuestion(questions: FormQuestion[], index: number, by: -1 | 1): FormQuestion[] {
  const to = index + by;
  if (to < 0 || to >= questions.length) return questions;
  const next = [...questions];
  const [q] = next.splice(index, 1);
  next.splice(to, 0, q);
  return next;
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

/** Addresses pasted any way (commas, semicolons, spaces, lines), lower-cased, each once; the ones that are not addresses, apart. */
export function parseEmails(text: string): { valid: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim().replace(/^<|>$/g, "")).filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    const e = p.toLowerCase();
    if (!EMAIL.test(e)) invalid.push(p);
    else if (!valid.includes(e)) valid.push(e);
  }
  return { valid, invalid };
}
