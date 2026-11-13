/**
 * Which secret field is visible, and for how long (`SECURITY.md` §5): one at
 * a time, hidden again after `REVEAL_MS`. The value itself is not here; the
 * item screen holds it and drops it when nothing is visible.
 */
export const REVEAL_MS = 20_000;

export interface Revealer {
  show: (key: string) => void;
  hide: () => void;
  visible: () => string | null;
  leftMs: () => number;
  dispose: () => void;
}

export function createRevealer(opts: { onChange: (key: string | null) => void; ms?: number; now?: () => number }): Revealer {
  const ms = opts.ms ?? REVEAL_MS;
  const now = opts.now ?? (() => Date.now());
  let key: string | null = null;
  let until = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const hide = () => {
    stop();
    if (key === null) return;
    key = null;
    if (!disposed) opts.onChange(null);
  };

  return {
    show: (next) => {
      if (disposed) return;
      stop();
      key = next;
      until = now() + ms;
      timer = setTimeout(hide, ms);
      opts.onChange(next);
    },
    hide,
    visible: () => key,
    leftMs: () => (key === null ? 0 : Math.max(0, until - now())),
    dispose: () => {
      stop();
      key = null;
      disposed = true;
    },
  };
}
