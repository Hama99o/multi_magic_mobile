/**
 * What a person can DO with a contact — call, WhatsApp, message, email,
 * share — in one place, so the detail's round buttons, a number's own row and
 * a list row's long press all behave the same (SPEC §C.3–5).
 *
 * Several numbers → "which one?" first (a sheet: label + number, and for
 * WhatsApp the international number it will open, so a wrong country shows
 * before anything is sent). A national number with no known country →
 * "which country?" (and the answer becomes the default).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as Sharing from "expo-sharing";
import { Mail, MessageCircle, Phone } from "@/components/icons";
import { contactsApi, displayName, vcfFile, type Contact, type LabelledValue } from "@/api/contacts";
import { failureMessage } from "@/api/failure";
import { useContactsCountry } from "@/stores/contactsCountry.store";
import { ActionSheet, type SheetAction } from "./ActionSheet";
import { mailUrl, openOutside, openWhatsApp } from "./outside";
import { COUNTRIES, countryFromAddress, smsUrl, telUrl, whatsappNumber } from "./phone";
import { useMutation } from "@tanstack/react-query";

export type Channel = "call" | "whatsapp" | "sms" | "email";

interface Sheet {
  title: string;
  subtitle?: string;
  actions: SheetAction[];
  testID: string;
}

/** `+93 70 123 4567` → shown as typed; the international form for WhatsApp. */
function pretty(digits: string): string {
  return `+${digits}`;
}

export function useContactActions(contact: Contact | null | undefined) {
  const { t, i18n } = useTranslation();
  const country = useContactsCountry((s) => s.country);
  const setCountry = useContactsCountry((s) => s.setCountry);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The vCard is fetched by a mutation: a one-shot download for the share
  // sheet, not data to keep (docs/DATA_LAYER.md), and it gives `sharing`.
  const exporting = useMutation({ mutationFn: (id: number) => contactsApi.exportVcf(id) });
  const sharing = exporting.isPending;

  const contactCountry = contact ? countryFromAddress(contact.addresses) : null;
  const lang = i18n.language === "fr" ? "fr" : "en";
  const labelOf = (label: string) => t(`contacts.labels.${label}`, { defaultValue: label });

  const run = (channel: Channel, entry: LabelledValue, chosenCountry?: string) => {
    const value = entry.value;
    if (channel === "call") return void openOutside(telUrl(value), { t, fail: t("contacts.outside.noCall"), copy: value });
    if (channel === "sms") return void openOutside(smsUrl(value), { t, fail: t("contacts.outside.noSms"), copy: value });
    if (channel === "email") return void openOutside(mailUrl(value), { t, fail: t("contacts.outside.noMail"), copy: value });

    const digits = whatsappNumber(value, { contactCountry, defaultCountry: chosenCountry ?? country });
    if (digits) return void openWhatsApp(digits, { t });
    // A national number and no country anywhere: ask, never guess.
    setSheet({
      title: t("contacts.whatsapp.whichCountry"),
      subtitle: t("contacts.whatsapp.whichCountryBody", { number: value }),
      testID: "contact-country-sheet",
      actions: COUNTRIES.map((c) => ({
        key: c.code,
        label: `${c.name[lang]} (+${c.dial})`,
        onPress: () => {
          setCountry(c.code);
          run("whatsapp", entry, c.code);
        },
      })),
    });
  };

  const entriesFor = (channel: Channel): LabelledValue[] =>
    !contact ? [] : channel === "email" ? contact.emails : contact.phones;

  /** Act on one entry, or ask which when there are several. */
  const act = (channel: Channel, entry?: LabelledValue) => {
    setError(null);
    if (entry) return run(channel, entry);
    const entries = entriesFor(channel);
    if (entries.length === 0) return;
    if (entries.length === 1) return run(channel, entries[0]);
    const Icon = channel === "email" ? Mail : channel === "whatsapp" ? MessageCircle : Phone;
    setSheet({
      title: t(`contacts.choose.${channel}`),
      subtitle: contact ? displayName(contact) : undefined,
      testID: "contact-number-sheet",
      actions: entries.map((e, i) => {
        const wa = channel === "whatsapp" ? whatsappNumber(e.value, { contactCountry, defaultCountry: country }) : null;
        return {
          key: String(i),
          icon: Icon,
          label: e.value,
          hint: wa ? `${labelOf(e.label)} · WhatsApp ${pretty(wa)}` : labelOf(e.label),
          onPress: () => run(channel, e),
        };
      }),
    });
  };

  const share = async () => {
    if (!contact || sharing) return;
    setError(null);
    let file: ReturnType<typeof vcfFile> | null = null;
    try {
      file = vcfFile(await exporting.mutateAsync(contact.id), displayName(contact) || "contact");
      await Sharing.shareAsync(file.uri, { mimeType: "text/vcard", UTI: "public.vcard", dialogTitle: displayName(contact) });
    } catch (e) {
      setError(failureMessage(e, t("contacts.detail.shareFailed")));
    } finally {
      try {
        if (file?.exists) file.delete();
      } catch {
        // The cache is the system's to clear; a file left there is harmless.
      }
    }
  };

  const element = sheet ? (
    <ActionSheet open title={sheet.title} subtitle={sheet.subtitle} actions={sheet.actions} onClose={() => setSheet(null)} testID={sheet.testID} />
  ) : null;

  return {
    act,
    share,
    sharing,
    error,
    element,
    has: {
      call: Boolean(contact?.phones.length),
      whatsapp: Boolean(contact?.phones.length),
      sms: Boolean(contact?.phones.length),
      email: Boolean(contact?.emails.length),
    },
    labelOf,
  };
}
