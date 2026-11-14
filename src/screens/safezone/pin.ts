/**
 * The PIN pad's state (`docs/design/safezone/SECURITY.md` §1). Six digits,
 * held only here, in the pad's local state. The server's `PIN_FORMAT` is
 * `/\A\d{6}\z/` (`User::SafezonePin`), so a seventh digit is refused rather
 * than sent.
 */
export const PIN_LENGTH = 6;

export interface PinState {
  digits: string;
  complete: boolean;
}

export const EMPTY_PIN: PinState = { digits: "", complete: false };

export type PinAction = { type: "digit"; digit: string } | { type: "back" } | { type: "clear" };

export function pinReducer(state: PinState, action: PinAction): PinState {
  if (action.type === "clear") return EMPTY_PIN;
  if (action.type === "back") {
    const digits = state.digits.slice(0, -1);
    return { digits, complete: false };
  }
  if (!/^\d$/.test(action.digit) || state.digits.length >= PIN_LENGTH) return state;
  const digits = state.digits + action.digit;
  return { digits, complete: digits.length === PIN_LENGTH };
}

/** Seconds until the server's `locked_until`; 0 when it is past or unreadable. */
export function lockoutLeft(until: string, now: number = Date.now()): number {
  const at = Date.parse(until);
  if (Number.isNaN(at)) return 0;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
