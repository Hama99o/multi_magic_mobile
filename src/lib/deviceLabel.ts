/**
 * A session's device name for the screen. The server words it in the reader's
 * language since #31 ("MultiMagic app · Android", "Appareil inconnu"); labels
 * stored before that carry its old English literals even on a French account
 * ("Unknown Browser on Unknown OS", device QA 2026-11-17). Those are said here
 * in the reader's language; every other label is shown as stored.
 */
import type { TFunction } from "i18next";

const WHOLLY_UNKNOWN = /^Unknown Browser (on|sur) Unknown OS$|^Unknown Device$/i;

export function deviceName(stored: string | null | undefined, t: TFunction): string {
  if (!stored || WHOLLY_UNKNOWN.test(stored)) return t("security.unknownDevice");
  return stored
    .replace("Unknown Browser", t("security.unknownBrowser"))
    .replace("Unknown OS", t("security.unknownOs"));
}
