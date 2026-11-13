/**
 * WHEN THE ENGINE'S DOCUMENT IS CONVERTED (device, 2026-11-13).
 *
 * The screen used to take the whole document from engine B as JSON on every
 * keystroke and convert it to the web's HTML at once. On a 900 KB note that
 * conversion alone took 0.7 s on a laptop (more on a phone), every letter.
 * Now B only says "changed" (onDocumentChange) and this decides when to run
 * the export + conversion:
 *  - if the last one was cheap (under `cheapMs`), at once, as before: a
 *    normal note behaves exactly as it did;
 *  - otherwise once per pause, `pauseMs` after the last change;
 *  - `flush` runs a pending one now: before leaving, locking, archiving and
 *    any edit that needs the current document;
 *  - `urgent` makes the next change run at once: a toolbar command is one
 *    discrete edit, and the bar must show its result (device: ¶ stayed lit
 *    after H3 while the conversion waited for a pause).
 */
export interface ExportScheduler {
  dirty(): void;
  flush(): void;
  urgent(): void;
  dispose(): void;
}

export function createExportScheduler(o: {
  run(): void;
  now?: () => number;
  cheapMs?: number;
  pauseMs?: number;
}): ExportScheduler {
  const now = o.now ?? (() => Date.now());
  const cheapMs = o.cheapMs ?? 16;
  const pauseMs = o.pauseMs ?? 400;
  let pending = false;
  let lastCost = 0;
  let nextAtOnce = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const runNow = () => {
    stop();
    pending = false;
    const t = now();
    o.run();
    lastCost = now() - t;
  };

  return {
    dirty() {
      pending = true;
      if (lastCost < cheapMs || nextAtOnce) {
        nextAtOnce = false;
        runNow();
        return;
      }
      stop();
      timer = setTimeout(runNow, pauseMs);
    },
    flush() {
      if (pending) runNow();
    },
    urgent() {
      nextAtOnce = true;
    },
    dispose() {
      stop();
      pending = false;
    },
  };
}
