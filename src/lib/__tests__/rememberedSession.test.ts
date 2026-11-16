/**
 * `app/chat.tsx` restores the remembered session with
 * `void loadRememberedSession(userId).then(...)` and no catch. The audit
 * (2026-11-16, P2) read that as an uncaught promise; it is safe only because
 * this function never rejects. That contract is what this pins: storage that
 * throws is "nothing remembered", never a rejection.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadRememberedSession } from "../rememberedSession";

afterEach(() => jest.restoreAllMocks());

it("resolves to null, never rejects, when storage throws", async () => {
  jest.spyOn(AsyncStorage, "getItem").mockRejectedValue(new Error("disk"));
  await expect(loadRememberedSession(7)).resolves.toBeNull();
});

it("reads back what was remembered, and nothing corrupt", async () => {
  jest.spyOn(AsyncStorage, "getItem").mockResolvedValue("42");
  await expect(loadRememberedSession(7)).resolves.toBe(42);
  jest.spyOn(AsyncStorage, "getItem").mockResolvedValue("not-a-number");
  await expect(loadRememberedSession(7)).resolves.toBeNull();
});
