/**
 * Choosing the language (`LanguageRow`): the CHOICE is this phone's and lives
 * in `language.store` (applied, remembered, at once); telling the server
 * (`users.lang`, the field the web's switcher writes, so the laptop follows)
 * is a mutation (`docs/DATA_LAYER.md`). Until 2026-11-13 the store fired that
 * PATCH itself, and the cached profile kept the old `lang`.
 *
 * Optimistic on the cached profile. A failed write does NOT undo the choice
 * (the label has already changed, and the other clients not knowing is
 * recoverable); it only puts the cached profile back to what the server has.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { profileApi, type Profile } from "@/api/profile";
import { profileKeys } from "@/api/keys";
import { useLanguage } from "@/stores/language.store";
import type { LanguageCode } from "@/i18n";

export function useChooseLanguage(userId: number | null | undefined) {
  const client = useQueryClient();
  const tell = useMutation({
    mutationFn: ({ id, language }: { id: number; language: LanguageCode }) => profileApi.update(id, { lang: language }),
    onMutate: async ({ language }) => {
      await client.cancelQueries({ queryKey: profileKeys.me() });
      const before = client.getQueryData<Profile>(profileKeys.me());
      if (before) client.setQueryData<Profile>(profileKeys.me(), { ...before, lang: language });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) client.setQueryData(profileKeys.me(), ctx.before);
    },
    onSuccess: (saved) => client.setQueryData(profileKeys.me(), saved),
  });
  return (language: LanguageCode) => {
    useLanguage.getState().setLanguage(language);
    if (userId != null) tell.mutate({ id: userId, language });
  };
}
