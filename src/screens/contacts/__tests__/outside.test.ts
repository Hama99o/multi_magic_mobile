/**
 * Every action that leaves the app can fail, and says so (SPEC §C.4–5):
 * a tablet has no dialer, a phone may have no WhatsApp. Nothing may fail
 * silently — the owner's "he must never find a bug himself".
 */
import { Alert, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { addressText, mapsUrl, mailUrl, openOutside, openWhatsApp } from "../outside";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));

const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key);
type Button = { text: string; onPress?: () => void };
const lastButtons = () => ((Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] ?? []) as Button[];

beforeEach(() => {
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("openOutside", () => {
  it("opens the url and says nothing when it works", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await openOutside("tel:+33612345678", { t, fail: t("contacts.outside.noCall"), copy: "+33 6 12 34 56 78" });
    expect(open).toHaveBeenCalledWith("tel:+33612345678");
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("says why when nothing on the device can open it, and offers to copy the number", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("No Activity found"));
    await openOutside("tel:+33612345678", { t, fail: t("contacts.outside.noCall"), copy: "+33 6 12 34 56 78" });

    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe("contacts.outside.noCall");
    const copy = lastButtons().find((b) => b.text === "contacts.outside.copy");
    copy?.onPress?.();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("+33 6 12 34 56 78");
  });

  it("offers no copy when there is nothing to copy", async () => {
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("x"));
    await openOutside("geo:0,0?q=x", { t, fail: t("contacts.outside.noMaps") });
    expect(lastButtons().map((b) => b.text)).toEqual(["common.close"]);
  });
});

describe("openWhatsApp", () => {
  it("opens the WhatsApp app on the chat with that number", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await openWhatsApp("93701234567", { t });
    expect(open).toHaveBeenCalledWith("whatsapp://send?phone=93701234567");
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("says WhatsApp isn't on this phone and offers the browser (wa.me) instead", async () => {
    const open = jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("no app")).mockResolvedValue(true);
    await openWhatsApp("93701234567", { t });

    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe("contacts.outside.noWhatsapp");
    lastButtons().find((b) => b.text === "contacts.outside.openInBrowser")?.onPress?.();
    expect(open).toHaveBeenLastCalledWith("https://wa.me/93701234567");
  });
});

describe("urls", () => {
  it("writes an address on one line for the map, skipping blanks", () => {
    expect(addressText({ label: "home", street: "12 Main St", city: "Kabul", state: "", postal: "1001", country: "Afghanistan" }))
      .toBe("12 Main St, 1001 Kabul, Afghanistan");
  });

  it("encodes the query for the maps app", () => {
    expect(mapsUrl("12 rue de l'Église, Paris", "android")).toBe("geo:0,0?q=12%20rue%20de%20l'%C3%89glise%2C%20Paris");
    expect(mapsUrl("Kabul", "ios")).toBe("http://maps.apple.com/?q=Kabul");
  });

  it("writes mailto without spaces around the address", () => {
    expect(mailUrl(" jamil@work.test ")).toBe("mailto:jamil@work.test");
  });
});
