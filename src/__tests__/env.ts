/**
 * Runs before the test framework. `config/env.ts` throws at module load in a
 * non-dev build with no API URL set (deliberately — see its header), and Jest
 * is a non-dev environment, so every suite that imports anything touching the
 * API would fail on import with an error about EAS profiles.
 */
process.env.EXPO_PUBLIC_API_URL = "http://127.0.0.1:3001";
process.env.EXPO_PUBLIC_WS_URL = "ws://127.0.0.1:3001/cable";
