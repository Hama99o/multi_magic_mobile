/**
 * A QA-ONLY switch that lets screenshots through on the SafeZone screens, so
 * a device pass can file `ours/` shots (supervisor, 2026-11-13; SECURITY.md
 * §7). FLAG_SECURE stays on everywhere else, and the D1/D2 proof that
 * screenshots are black runs on a build WITHOUT it.
 *
 * Three locks, all required (`qaCapture.test.ts`):
 *  - a development build: `__DEV__` is false in every release, EAS preview
 *    included, so no shipped binary can ever have it on;
 *  - `EXPO_PUBLIC_QA_ALLOW_CAPTURE` set to exactly "1", INLINED at build time
 *    (`src/config/env.ts` header: it is not read at runtime);
 *  - an API on a local machine (10.0.2.2, localhost, 127.0.0.1), so even a
 *    dev client pointed at the real server keeps the block.
 */
import { API_URL } from "@/config/env";

const LOCAL_HOSTS = new Set(["10.0.2.2", "localhost", "127.0.0.1"]);

function isLocal(apiUrl: string): boolean {
  const host = /^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i.exec(apiUrl)?.[1]?.toLowerCase();
  return host !== undefined && LOCAL_HOSTS.has(host);
}

export function captureAllowed(input: { dev: boolean; flag: string | undefined; apiUrl: string }): boolean {
  return input.dev === true && input.flag === "1" && isLocal(input.apiUrl);
}

export const QA_ALLOW_CAPTURE = captureAllowed({
  dev: __DEV__,
  flag: process.env.EXPO_PUBLIC_QA_ALLOW_CAPTURE,
  apiUrl: API_URL,
});
