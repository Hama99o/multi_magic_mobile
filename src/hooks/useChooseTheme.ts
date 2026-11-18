/**
 * The theme, chosen here and remembered on the account — as the web's theme
 * menu does (`TopNav.tsx` → `PATCH /users/:id { user: { theme } }`, the same
 * `light` / `dark` / `system` values). MANIFEST row 21.
 *
 * Applied on the phone first, always: the server is told afterwards, and a
 * failure there changes nothing on screen (the web ignores it too).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { profileApi, type Profile } from "@/api/profile";
import { profileKeys } from "@/api/keys";
import { useAuthStore } from "@/stores/auth.store";
import { useThemeStore, type ThemeChoice } from "@/stores/theme.store";

export function useChooseTheme() {
  const client = useQueryClient();
  const signedIn = useAuthStore((s) => s.status === "signedIn");
  // The same cache entry useMe reads, so nothing is fetched twice.
  const { data: me } = useQuery({ queryKey: profileKeys.me(), queryFn: profileApi.me, enabled: signedIn });
  const tell = useMutation({
    mutationFn: ({ id, theme }: { id: number; theme: ThemeChoice }) => profileApi.update(id, { theme }),
    onSuccess: (saved) => client.setQueryData<Profile>(profileKeys.me(), saved),
  });
  return (theme: ThemeChoice) => {
    useThemeStore.getState().setChoice(theme);
    if (me?.id != null) tell.mutate({ id: me.id, theme });
  };
}
