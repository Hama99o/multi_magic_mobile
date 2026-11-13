/**
 * The QA-only switch that lets screenshots through on SafeZone screens, so a
 * device pass can file `ours/` shots (supervisor, 2026-11-13). Approved on
 * three conditions; this file is the first one's proof:
 *
 *  1. it can NEVER be on in a release or production build;
 *  2. it is read at build time (`EXPO_PUBLIC_QA_ALLOW_CAPTURE`, inlined);
 *  3. D1/D2 (screenshots black) run on a build WITHOUT it.
 *
 * Three locks, all required: a development build (`__DEV__`), the flag set to
 * exactly "1", and an API on a local machine. A dev client pointed at the
 * real server keeps the block.
 */
import { captureAllowed } from "../qaCapture";

const LOCAL = "http://10.0.2.2:3001";
const PROD = "https://api.example.test";

describe("captureAllowed", () => {
  it("a release build: never, whatever the flag and the API", () => {
    for (const flag of ["1", "true", "yes", undefined, ""]) {
      for (const apiUrl of [LOCAL, "http://localhost:3001", PROD]) {
        expect(captureAllowed({ dev: false, flag, apiUrl })).toBe(false);
      }
    }
  });

  it("a dev build pointed at a real server: never", () => {
    expect(captureAllowed({ dev: true, flag: "1", apiUrl: PROD })).toBe(false);
  });

  it("a dev build without the flag, or with anything but \"1\": never", () => {
    for (const flag of [undefined, "", "0", "true", "yes", " 1", "11"]) {
      expect(captureAllowed({ dev: true, flag, apiUrl: LOCAL })).toBe(false);
    }
  });

  it("only all three together: dev, \"1\", a local API", () => {
    expect(captureAllowed({ dev: true, flag: "1", apiUrl: LOCAL })).toBe(true);
    expect(captureAllowed({ dev: true, flag: "1", apiUrl: "http://localhost:3001" })).toBe(true);
    expect(captureAllowed({ dev: true, flag: "1", apiUrl: "http://127.0.0.1:3001" })).toBe(true);
  });

  it("a hostname that merely CONTAINS a local name is not local", () => {
    expect(captureAllowed({ dev: true, flag: "1", apiUrl: "https://localhost.evil.test" })).toBe(false);
    expect(captureAllowed({ dev: true, flag: "1", apiUrl: "https://api.example.test/10.0.2.2" })).toBe(false);
  });
});

describe("secureScreen with the switch", () => {
  afterEach(() => jest.resetModules());

  function load(env: { dev: boolean; flag?: string; api: string }) {
    const prevent = jest.fn(async () => undefined);
    jest.doMock("expo-screen-capture", () => ({ preventScreenCaptureAsync: prevent, allowScreenCaptureAsync: jest.fn(async () => undefined) }));
    jest.doMock("../qaCapture", () => {
      const actual = jest.requireActual("../qaCapture");
      return { ...actual, QA_ALLOW_CAPTURE: actual.captureAllowed({ dev: env.dev, flag: env.flag, apiUrl: env.api }) };
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { secureScreen } = require("../secureScreen") as typeof import("../secureScreen");
    return { secureScreen, prevent };
  }

  it("a release build with the flag still blocks", async () => {
    const { secureScreen, prevent } = load({ dev: false, flag: "1", api: LOCAL });
    await secureScreen.prevent("safezone");
    expect(prevent).toHaveBeenCalledWith("safezone");
  });

  it("a local QA build with the flag lets the shot through", async () => {
    const { secureScreen, prevent } = load({ dev: true, flag: "1", api: LOCAL });
    await secureScreen.prevent("safezone");
    expect(prevent).not.toHaveBeenCalled();
  });
});
