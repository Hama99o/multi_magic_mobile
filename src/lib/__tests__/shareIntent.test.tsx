/**
 * `lib/shareIntent.tsx` — the app must open in Expo Go, where
 * `expo-share-intent`'s native module does not exist and importing the
 * package throws at launch. And nothing may change on a real build.
 */
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";

const mockLoaded = jest.fn();

function load(environment: "storeClient" | "bare") {
  let loaded!: typeof import("../shareIntent");
  jest.isolateModules(() => {
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: { executionEnvironment: environment },
      ExecutionEnvironment: { StoreClient: "storeClient", Bare: "bare", Standalone: "standalone" },
    }));
    jest.doMock("expo-share-intent", () => {
      mockLoaded();
      return {
        ShareIntentProvider: ({ children }: { children: unknown }) => children,
        useShareIntentContext: () => ({ isReady: true, hasShareIntent: true, shareIntent: { files: [] }, resetShareIntent: jest.fn(), error: null }),
        getShareExtensionKey: () => "multimagicShareKey",
      };
    });
    loaded = require("../shareIntent");
  });
  return loaded;
}

beforeEach(() => mockLoaded.mockClear());

describe("in Expo Go", () => {
  it("never loads the package, so its missing native module cannot take the app down", () => {
    const lib = load("storeClient");
    expect(mockLoaded).not.toHaveBeenCalled();
    expect(lib.SHARE_INTENT_AVAILABLE).toBe(false);
  });

  it("renders the app through a passthrough provider, with nothing pending", () => {
    const lib = load("storeClient");
    render(
      <lib.ShareIntentProvider>
        <Text>the app</Text>
      </lib.ShareIntentProvider>,
    );
    expect(screen.getByText("the app")).toBeTruthy();
    expect(lib.useShareIntentContext().hasShareIntent).toBe(false);
  });

  it("has no extension key, so no link is redirected to Save to Pages", () => {
    expect(load("storeClient").getShareExtensionKey()).toBeNull();
  });
});

describe("in a development or release build", () => {
  it("uses the real module, unchanged", () => {
    const lib = load("bare");
    expect(mockLoaded).toHaveBeenCalledTimes(1);
    expect(lib.SHARE_INTENT_AVAILABLE).toBe(true);
    expect(lib.getShareExtensionKey()).toBe("multimagicShareKey");
    expect(lib.useShareIntentContext().hasShareIntent).toBe(true);
  });
});
