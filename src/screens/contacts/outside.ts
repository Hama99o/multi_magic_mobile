/**
 * Leaving the app: the dialer, messages, mail, maps, WhatsApp
 * (`docs/design/contacts/SPEC.md` §C.4–5).
 *
 * `Linking.openURL` REJECTS when nothing on the device handles the url (a
 * tablet has no dialer; a phone may have no WhatsApp). Every call goes
 * through here so that rejection always becomes a sentence and a way out —
 * Copy the number, or open WhatsApp's web page — never a tap that does nothing.
 *
 * WhatsApp is opened by its own scheme first (`whatsapp://send?phone=`):
 * `openURL` does not need `canOpenURL`'s declared queries, so this works on
 * Android 11+ and iOS without a manifest entry, and its failure is exactly
 * "the app is not installed". `wa.me` is then offered, not forced: in a
 * browser it is a page asking to install WhatsApp.
 */
import { Alert, Linking, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { Address } from "@/api/contacts";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** `fail` is already translated (`t("contacts.outside.noCall")`), so the
 *  key gate sees the key where it is used. */
export async function openOutside(url: string, { t, fail, copy }: { t: T; fail: string; copy?: string }) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(fail, copy ? t("contacts.outside.copyInstead", { value: copy }) : undefined, [
      ...(copy ? [{ text: t("contacts.outside.copy"), onPress: () => void Clipboard.setStringAsync(copy) }] : []),
      { text: t("common.close"), style: "cancel" as const },
    ]);
  }
}

export async function openWhatsApp(digits: string, { t }: { t: T }) {
  try {
    await Linking.openURL(`whatsapp://send?phone=${digits}`);
  } catch {
    Alert.alert(t("contacts.outside.noWhatsapp"), t("contacts.outside.noWhatsappBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("contacts.outside.openInBrowser"), onPress: () => void Linking.openURL(`https://wa.me/${digits}`).catch(() => undefined) },
    ]);
  }
}

export function addressText(a: Address): string {
  const town = [a.postal, a.city].map((s) => s.trim()).filter(Boolean).join(" ");
  return [a.street.trim(), town, a.state.trim(), a.country.trim()].filter(Boolean).join(", ");
}

export function mapsUrl(text: string, os: string = Platform.OS): string {
  const query = encodeURIComponent(text);
  return os === "ios" ? `http://maps.apple.com/?q=${query}` : `geo:0,0?q=${query}`;
}

export function mailUrl(address: string): string {
  return `mailto:${address.trim()}`;
}
