/**
 * Profile and AI-key writes, through React Query (`docs/DATA_LAYER.md`).
 *
 * OPTIMISTIC: saving the profile's name and "about" (the header, which reads
 * `useMe()`, shows the new name at once), activating an AI key (the tick
 * moves at once), removing one (the row goes). A refusal puts the cache
 * back; the server's answer replaces it either way.
 *
 * NOT optimistic: a photo (there is nothing to show until the server has
 * resized and stored it), adding or replacing a key (the provider must
 * accept it first; its refusal is shown in its own words).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { profileApi, type Profile, type ProfileChanges } from "@/api/profile";
import { aiKeysApi, type AiKeyPayload } from "@/api/aiKeys";
import { profileKeys } from "@/api/keys";

export function useSaveProfile(profileId: number | null, opts: { onSaved?: (p: Profile) => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (changes: ProfileChanges) => profileApi.update(profileId!, changes),
    onMutate: async (changes) => {
      await client.cancelQueries({ queryKey: profileKeys.me() });
      const before = client.getQueryData<Profile>(profileKeys.me());
      if (before) {
        const firstName = changes.firstname ?? before.firstName;
        const lastName = changes.lastname ?? before.lastName;
        client.setQueryData<Profile>(profileKeys.me(), {
          ...before,
          firstName,
          lastName,
          fullName: [firstName, lastName].filter(Boolean).join(" ") || before.fullName,
          about: changes.about ?? before.about,
        });
      }
      return { before };
    },
    onSuccess: (saved) => {
      client.setQueryData(profileKeys.me(), saved);
      opts.onSaved?.(saved);
    },
    onError: (e, _c, ctx) => {
      if (ctx?.before) client.setQueryData(profileKeys.me(), ctx.before);
      opts.onError?.(e);
    },
  });
}

/** The photo: the server's answer, no guess. */
export function useProfilePhoto(profileId: number | null, opts: { onSaved?: (p: Profile) => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  const done = (saved: Profile) => {
    client.setQueryData(profileKeys.me(), saved);
    opts.onSaved?.(saved);
  };
  const set = useMutation({
    mutationFn: (photo: Parameters<typeof profileApi.uploadPhoto>[1]) => profileApi.uploadPhoto(profileId!, photo),
    onSuccess: done,
    onError: (e) => opts.onError?.(e),
  });
  const clear = useMutation({
    mutationFn: () => profileApi.removePhoto(profileId!),
    onSuccess: done,
    onError: (e) => opts.onError?.(e),
  });
  return { set, clear };
}

function keyWrite(client: ReturnType<typeof useQueryClient>, edit: (p: AiKeyPayload, keyId: number) => AiKeyPayload) {
  return {
    onMutate: async (keyId: number) => {
      await client.cancelQueries({ queryKey: profileKeys.aiKeys() });
      const before = client.getQueryData<AiKeyPayload>(profileKeys.aiKeys());
      if (before) client.setQueryData<AiKeyPayload>(profileKeys.aiKeys(), edit(before, keyId));
      return { before };
    },
    onSuccess: (payload: AiKeyPayload) => client.setQueryData(profileKeys.aiKeys(), payload),
    rollback: (ctx: { before?: AiKeyPayload } | undefined) => {
      if (ctx?.before) client.setQueryData(profileKeys.aiKeys(), ctx.before);
    },
  };
}

export function useActivateAiKey(opts: { onDone?: () => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  const w = keyWrite(client, (p, keyId) => ({ ...p, keys: p.keys.map((k) => ({ ...k, active: k.id === keyId })) }));
  return useMutation({
    mutationFn: (keyId: number) => aiKeysApi.activate(keyId),
    onMutate: w.onMutate,
    onSuccess: (payload) => (w.onSuccess(payload), opts.onDone?.()),
    onError: (e, _k, ctx) => (w.rollback(ctx), opts.onError?.(e)),
  });
}

/** Removing the active key promotes another; the server says which. */
export function useRemoveAiKey(opts: { onDone?: () => void; onError?: (e: unknown) => void } = {}) {
  const client = useQueryClient();
  const w = keyWrite(client, (p, keyId) => ({ ...p, keys: p.keys.filter((k) => k.id !== keyId) }));
  return useMutation({
    mutationFn: (keyId: number) => aiKeysApi.remove(keyId),
    onMutate: w.onMutate,
    onSuccess: (payload) => (w.onSuccess(payload), opts.onDone?.()),
    onError: (e, _k, ctx) => (w.rollback(ctx), opts.onError?.(e)),
  });
}
