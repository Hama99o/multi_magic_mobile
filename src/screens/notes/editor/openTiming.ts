/**
 * WHERE A NOTE'S OPEN TIME GOES (probe, 2026-11-14: 8 s at 100 KB, 22-110 s
 * above). The editor screen marks each stage (fetched, codec, engine create,
 * holds check, first engine event) and, in dev builds, logs one line:
 *   [notes-open] fetched=250 codecMs=1000 createMs=… holdsMs=… firstEvent=…
 * `mark` = time since the screen opened (first call only); `measure` = how
 * long one span took.
 */
export interface OpenTiming {
  mark(name: string): void;
  measure<T>(name: string, fn: () => T): T;
  report(): string;
}

export function createOpenTiming(now: () => number = () => performance.now()): OpenTiming {
  const start = now();
  const entries: [string, number][] = [];
  return {
    mark(name) {
      if (!entries.some(([k]) => k === name)) entries.push([name, now() - start]);
    },
    measure(name, fn) {
      const a = now();
      try {
        return fn();
      } finally {
        entries.push([`${name}Ms`, now() - a]);
      }
    },
    report: () => entries.map(([k, v]) => `${k}=${Math.round(v)}`).join(" "),
  };
}

/** Where the lines go: Metro's log in a dev build; never in tests or release. */
export const timingLog = {
  write(line: string): void {
    if (typeof __DEV__ !== "undefined" && __DEV__ && process.env.JEST_WORKER_ID === undefined) console.log(line);
  },
};
