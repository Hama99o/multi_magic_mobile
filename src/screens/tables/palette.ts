/**
 * The colours a base or a select option can be given: the web's own
 * `OPTION_PALETTE` (`app/javascript/pages/table_app/fieldTypes.ts:47`), value
 * for value, because the server stores the hex and the web draws it. These are
 * DATA (a person's choice, saved on the base), not the app's design tokens.
 */
export const OPTION_PALETTE = ["#6b7280", "#3b82f6", "#14b8a6", "#10b981", "#eab308", "#f97316", "#ef4444", "#ec4899", "#8b5cf6"] as const;

/** A new base starts green, as on the web (`BaseForm.tsx`: `OPTION_PALETTE[3]`). */
export const DEFAULT_BASE_COLOR = OPTION_PALETTE[3];
