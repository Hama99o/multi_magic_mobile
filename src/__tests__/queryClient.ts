/**
 * The QueryClient a test should use, and the reason it is not just
 * `new QueryClient()`.
 *
 * ── `gcTime: 0` HAS TO BE SAID TWICE ──────────────────────────────────────
 * `defaultOptions.queries.gcTime` does NOT reach mutations. They are a
 * separate cache with a separate default, and that default is **five
 * minutes**. Every test client here set the queries half and none set the
 * other, so the moment a suite actually ran a mutation — rename, clear,
 * delete — the unmount scheduled a 300 000 ms garbage-collection timeout and
 * the Jest worker could not exit. It was force-killed on every full run for a
 * day, printing a warning that names neither the library nor the timer:
 *
 *   A worker process has failed to exit gracefully … Active timers can also
 *   cause this, ensure that .unref() was called on them.
 *
 * `--detectOpenHandles` cannot find it, because that flag implies
 * `--runInBand`, and in band there is no worker to fail to exit. The warning
 * and the diagnostic for it are mutually exclusive.
 *
 * ── AND `client.clear()` IN AN afterEach DOES NOT SAVE YOU ────────────────
 * Jest runs `afterEach` hooks in reverse order of registration, and RNTL
 * registers its auto-cleanup from `setupFilesAfterEnv` — before any test file
 * body. So the file's own `client.clear()` runs FIRST and the unmount that
 * schedules the timer runs AFTER it. Clearing a cache cannot cancel a timer
 * that does not exist yet.
 *
 * Hence one helper rather than four literals: the next client cannot be
 * written with only half of it.
 */
import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";

export function testQueryClient(overrides: QueryClientConfig["defaultOptions"] = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      ...overrides,
      queries: { retry: false, gcTime: 0, ...overrides.queries },
      // The half that was missing. Never drop it.
      mutations: { gcTime: 0, ...overrides.mutations },
    },
  });
}
