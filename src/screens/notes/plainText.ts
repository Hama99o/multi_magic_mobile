/**
 * A note as plain text: the title, a blank line, then the body's lines as the
 * cards show them (bullets, task boxes). What Copy (the web's copy-content
 * icon, owner 2026-11-15) and Send give.
 */
import { cardPreview } from "./cardPreview";

export function notePlainText(title: string, html: string): string {
  const body = cardPreview(html, 100000).lines.join("\n").trim();
  return [title.trim(), body].filter(Boolean).join("\n\n");
}
