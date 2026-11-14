/**
 * Keeps the signed-in profile warm in the cache from launch, and applies the
 * language it carries (`users.lang`, the column the web's switcher writes)
 * when this phone has no choice of its own (`language.store.ts`).
 *
 * Replaces the effect in `_layout.tsx` that fetched the profile and copied it
 * into the auth store (`docs/DATA_LAYER.md`): the request is a query here,
 * and the effect below makes no request; it reacts to the query's answer.
 */
import { useEffect } from "react";
import { useMeQuery } from "@/hooks/useMe";
import { useLanguage } from "@/stores/language.store";

export function SessionProfile() {
  const { data } = useMeQuery();
  const lang = data?.lang;
  useEffect(() => {
    if (lang !== undefined) useLanguage.getState().applyFromServer(lang);
  }, [lang]);
  return null;
}
