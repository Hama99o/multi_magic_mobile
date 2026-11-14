/**
 * Where a note's open time goes (probe, 2026-11-14: 8 s at 100 KB, 22-110 s
 * above). The screen marks each stage; in dev it logs one line, so a device
 * run says which stage is slow (measured, not inferred).
 */
import { createOpenTiming } from "../editor/openTiming";

it("marks stages from the start, measures spans, and reports one line", () => {
  let t = 100;
  const timing = createOpenTiming(() => t);
  t = 350;
  timing.mark("fetched");
  const out = timing.measure("codec", () => {
    t = 1350;
    return 42;
  });
  t = 1400;
  timing.mark("fetched"); // a stage is marked once: the first time counts
  timing.mark("firstEvent");
  expect(out).toBe(42);
  expect(timing.report()).toBe("fetched=250 codecMs=1000 firstEvent=1300");
});

it("a span that throws is still measured, and the error goes on", () => {
  let t = 0;
  const timing = createOpenTiming(() => t);
  expect(() => timing.measure("create", () => { t = 5; throw new Error("refused"); })).toThrow("refused");
  expect(timing.report()).toBe("createMs=5");
});

it("timingLog writes nothing under jest (dev builds only, never in tests)", () => {
  const { timingLog } = jest.requireActual("../editor/openTiming");
  const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
  timingLog.write("[notes-open] x");
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});
