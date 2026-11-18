/** Template helpers shared by the templates list and form (`app/todos/templates.tsx`, `template.tsx`). */
import type { TodoTemplate } from "@/api/todos";

/** "Every week" / "Every 3 months", or null when the template does not repeat. */
export function repeatLabel(tpl: Pick<TodoTemplate, "frequency" | "intervalCount">, t: (k: string, o?: Record<string, unknown>) => string): string | null {
  if (tpl.frequency === "none") return null;
  return t(`todos.repeatEvery.${tpl.frequency}`, { count: tpl.intervalCount });
}

/** One task per line, blank lines dropped (the web's `linesToItems`). */
export function linesToItems(text: string): { title: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((title) => ({ title }));
}
