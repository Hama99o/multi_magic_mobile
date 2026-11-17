/**
 * The profile's birth date, as the server's `birth_date` column takes it.
 * A date picker would be nicer; a checked `YYYY-MM-DD` is what the web's
 * drawer sends and needs no new dependency.
 */
/**
 * What is wrong with a typed birth date, or null when it can be saved (a real
 * `YYYY-MM-DD` up to today, or empty to clear it). The future is refused: the
 * black-box run on 2026-11-17 saved 2099-01-01 and the server kept it.
 */
export function birthDateProblem(text: string, today: Date = new Date()): "format" | "future" | null {
  const value = text.trim();
  if (value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "format";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "format";
  // Compared as text, in the phone's own calendar day: `YYYY-MM-DD` sorts as dates do.
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayText = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return value > todayText ? "future" : null;
}
