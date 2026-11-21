/**
 * What a phone value can do (the web's `cells.tsx:175-198` green WhatsApp
 * button, plus a call). Pure, so the URLs are tested, not eyeballed.
 */
export interface PhoneAction {
  kind: "call" | "whatsapp";
  url: string;
}

/** A number as typed ("+93 70 123 4567", "070-123") to the digits a link needs. */
export function phoneDigits(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function phoneActions(raw: string): PhoneAction[] {
  const number = phoneDigits(raw);
  if (number.replace("+", "").length < 3) return [];
  // wa.me takes the international number without "+" or leading zeros.
  const wa = number.replace(/^\+/, "").replace(/^0+/, "");
  return [
    { kind: "call", url: `tel:${number}` },
    { kind: "whatsapp", url: `https://wa.me/${wa}` },
  ];
}
