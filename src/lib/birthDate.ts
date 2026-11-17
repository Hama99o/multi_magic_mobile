/**
 * The profile's birth date, as the server's `birth_date` column takes it.
 * A date picker would be nicer; a checked `YYYY-MM-DD` is what the web's
 * drawer sends and needs no new dependency.
 */
/** `YYYY-MM-DD` that is a real date, or empty (cleared). */
export function birthDateProblem(text: string): boolean {
  const value = text.trim();
  if (value === "") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value;
}
