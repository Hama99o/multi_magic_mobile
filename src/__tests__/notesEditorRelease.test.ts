/**
 * The note editor ships in release builds on both platforms (decision of
 * 2026-11-15: TestFlight 1.2.0 opened the phase-2 read screen on the owner's
 * iPhone because the flag was __DEV__; he asked for full editing and is the
 * iOS smoke test). A B failure still falls back to the read view with a code.
 */
it("NOTES_EDITOR_ENABLED is on in a release build (__DEV__ false)", () => {
  const g = global as unknown as { __DEV__: boolean };
  const before = g.__DEV__;
  g.__DEV__ = false;
  let enabled: boolean | undefined;
  jest.isolateModules(() => {
    enabled = require("@/config/features").NOTES_EDITOR_ENABLED;
  });
  g.__DEV__ = before;
  expect(enabled).toBe(true);
});
