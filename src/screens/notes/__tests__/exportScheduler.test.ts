/**
 * When the editor turns the engine's document into the web's HTML (device,
 * 2026-11-13: on a 900 KB note that took 0.7 s on a laptop, on EVERY
 * keystroke, so typing froze). A cheap conversion still runs at once, as
 * before; a costly one waits for a pause; flush runs it now (leaving, lock,
 * a structural edit).
 */
import { createExportScheduler } from "../editor/exportScheduler";

let clock = 0;
const now = () => clock;
beforeEach(() => {
  jest.useFakeTimers();
  clock = 0;
});
afterEach(() => jest.useRealTimers());

function rig(costMs: number) {
  const runs: number[] = [];
  const s = createExportScheduler({
    now,
    run: () => {
      runs.push(clock);
      clock += costMs;
    },
  });
  return { s, runs };
}

it("a cheap conversion runs on every change, at once", () => {
  const { s, runs } = rig(2);
  s.dirty();
  s.dirty();
  s.dirty();
  expect(runs).toHaveLength(3);
});

it("a costly one runs once per pause, 400 ms after the last change", () => {
  const { s, runs } = rig(300);
  s.dirty(); // the first one runs: its cost is not known yet
  expect(runs).toHaveLength(1);
  for (let i = 0; i < 10; i++) {
    s.dirty();
    jest.advanceTimersByTime(100);
  }
  expect(runs).toHaveLength(1);
  jest.advanceTimersByTime(400);
  expect(runs).toHaveLength(2);
});

it("flush runs a pending one now, and nothing when nothing changed", () => {
  const { s, runs } = rig(300);
  s.dirty();
  s.dirty();
  expect(runs).toHaveLength(1);
  s.flush();
  expect(runs).toHaveLength(2);
  s.flush();
  expect(runs).toHaveLength(2);
  jest.advanceTimersByTime(1000);
  expect(runs).toHaveLength(2);
});

it("dispose drops the timer", () => {
  const { s, runs } = rig(300);
  s.dirty();
  s.dirty();
  s.dispose();
  jest.advanceTimersByTime(1000);
  expect(runs).toHaveLength(1);
});

it("after a toolbar command (urgent), the next change runs at once even when costly (device: the bar showed ¶ after H3)", () => {
  const { s, runs } = rig(300);
  s.dirty();
  expect(runs).toHaveLength(1);
  s.urgent();
  s.dirty();
  expect(runs).toHaveLength(2);
  // Typing after it waits for a pause again.
  s.dirty();
  expect(runs).toHaveLength(2);
});

// Integration server, 2026-11-14: after unlock, B's change signal could be
// lost. `force` exports even with nothing marked dirty (blur, leave, actions).
it("force runs the export even when no change was signalled", () => {
  const run = jest.fn();
  const s = createExportScheduler({ run });
  s.force();
  expect(run).toHaveBeenCalledTimes(1);
  s.dirty();
  s.force();
  expect(run).toHaveBeenCalledTimes(3);
});
