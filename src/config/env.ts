/**
 * EVERY EXTERNAL URL, IN ONE PLACE.
 *
 * ── The honest constraint ─────────────────────────────────────────────────
 * `process.env.EXPO_PUBLIC_*` is INLINED AT BUILD TIME, as is
 * `Constants.expoConfig.extra`. Neither is read at runtime. So changing a
 * hostname is a JS bundle push (EAS Update — minutes, no store review), not a
 * settings change. Writing that down because "read it from config" is usually
 * assumed to mean "changeable at runtime", and here it does not.
 *
 * ── A RELEASE BUILD MAY NOT FALL BACK TO A DEVELOPER'S LAPTOP ─────────────
 * Silent fallback is right in development: `10.0.2.2` is the Android
 * emulator's alias for the host, and it is what makes a fresh checkout work.
 * In a release build the same fallback is a disaster that does not announce
 * itself — the app installs, launches, renders, and every request goes to a
 * machine that is not on the internet. It looks like a server outage.
 *
 * Karwan shipped exactly this in a preview build. So a non-dev build REFUSES
 * rather than guesses, at module load, and the very first launch fails loudly.
 */
import Constants from "expo-constants";

function fromExtra(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function required(
  envValue: string | undefined,
  extraKey: string,
  name: string,
  devFallback: string,
): string {
  const explicit = envValue?.trim() || fromExtra(extraKey);
  if (explicit) return explicit;

  // `__DEV__` is false in any release build, including EAS `preview` — which is
  // the profile this really protects, because internal distribution is where a
  // wrong URL gets handed to somebody.
  if (!__DEV__) {
    throw new Error(
      `${name} is not set. A release build must be given one — set it in ` +
        `eas.json's env for this profile. Falling back to ${devFallback} would ` +
        `ship an app that silently talks to a developer's machine.`,
    );
  }
  return devFallback;
}

/**
 * multi_magic's Rails host. `10.0.2.2` is the Android emulator's alias for the
 * host machine; `3001` is where multi_magic listens.
 *
 * NOTE: this is the HOST, not `/api/v1`. Karwan bakes the prefix in, but this
 * app cannot: login is at `/users/login` and the socket is at `/cable`, both
 * OUTSIDE the API namespace. A baked-in prefix would have meant every auth call
 * carrying a `../../` to climb back out.
 */
export const API_URL = required(
  process.env.EXPO_PUBLIC_API_URL,
  "apiUrl",
  "EXPO_PUBLIC_API_URL",
  "http://10.0.2.2:3001",
);

/**
 * ActionCable. Derived from API_URL by default rather than configured twice —
 * the two were separate values in multi_magic's web client and that is how one
 * gets updated and the other does not.
 */
export const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL?.trim() ||
  fromExtra("wsUrl") ||
  `${API_URL.replace(/^http/, "ws")}/cable`;

/**
 * THE SAME HOST, FOR A SHELL RATHER THAN FOR THE APP.
 *
 * `10.0.2.2` is the emulator's alias for the host machine and it is the right
 * value for the APP: it is identical on every machine AND on every network, so
 * it survives the switch from office WiFi to a weekend hotspot, and it works
 * with no network at all. A stale LAN IP makes every request fail in a way that
 * looks exactly like an app bug.
 *
 * But a shell script on the host cannot reach `10.0.2.2` — that alias only
 * exists inside the emulator. So anything checking "is the backend up?" from a
 * terminal needs this one instead. Two values for one host, because two very
 * different things are asking.
 */
export const API_URL_LOCAL =
  process.env.EXPO_PUBLIC_API_URL_LOCAL?.trim() ||
  fromExtra("apiUrlLocal") ||
  API_URL.replace("10.0.2.2", "localhost");

/** So a screen can say which backend it is talking to when something is wrong. */
export const ENVIRONMENT_LABEL =
  API_URL.includes("10.0.2.2") || API_URL.includes("localhost") || API_URL.includes("127.0.0.1")
    ? "local"
    : "remote";
