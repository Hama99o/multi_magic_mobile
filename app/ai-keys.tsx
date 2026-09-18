/**
 * Your own AI provider key — `docs/design/profile/SPEC.md` §2.4.
 *
 * His words: *"that's great you have show how to add the key, this is great."*
 * With a key of your own the assistant runs on your account, and the spend is
 * yours rather than the app's.
 *
 * ── THE SERVER VERIFIES BEFORE IT STORES, AND THAT IS THE FEATURE ─────────
 * `Ai::Keys.verify` puts the candidate key to the provider once, and **nothing
 * is written when the provider refuses** — "a typo must fail here rather than
 * halfway through an agent run". So a bad paste comes back with the provider's
 * OWN wording, and this screen renders that sentence rather than replacing it
 * with "Something went wrong". Whose key it is and why it was refused is
 * information only the provider has.
 *
 * ── THE KEY IS NEVER SHOWN, AND NOTHING HERE PRETENDS IT COULD BE ─────────
 * It is write-only over HTTP by construction. A row shows the mask and offers
 * **Replace** — never an edit affordance on a field that could not be
 * prefilled.
 *
 * ── PROVIDERS COME FROM THE SERVER, ON EVERY RESPONSE ─────────────────────
 * `providers: Ai::Keys.offered` rides along with mutations too, and the
 * controller records why that had to be fixed: caching a mutation's response
 * that lacked the list "went blank on first use". So every response is parsed
 * the same way and cached whole.
 *
 * Lending a key to somebody by email exists server-side and is OUT of v1 — the
 * same call as read-only groups. What IS rendered is anything lent TO you,
 * because being told you are running on somebody else's key is not optional.
 */
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Check, ChevronLeft, KeyRound, Trash2 } from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { KeyRefused, aiKeysApi, type AiKey, type AiKeyPayload } from "@/api/aiKeys";
import { apiErrorMessage, isNetworkFailure } from "@/api/http";

export default function AiKeys() {
  const colors = useColors();
  const metrics = useMetrics();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["aiKeys"],
    queryFn: aiKeysApi.list,
  });

  const [provider, setProvider] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [replacing, setReplacing] = useState<AiKey | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const cache = (payload: AiKeyPayload) => {
    queryClient.setQueryData(["aiKeys"], payload);
    setPasted("");
    setProvider(null);
    setReplacing(null);
    setRefusal(null);
    setFailure(null);
  };

  const onError = (e: unknown) => {
    if (e instanceof KeyRefused) {
      // The provider's own words. Not ours.
      setRefusal(e.message);
      return;
    }
    setFailure(
      isNetworkFailure(e)
        ? "Could not reach MultiMagic. Nothing was changed."
        : (apiErrorMessage(e) ?? "Could not do that."),
    );
  };

  const add = useMutation({
    mutationFn: () =>
      replacing
        ? aiKeysApi.replace(replacing.id, pasted.trim())
        : aiKeysApi.add(provider!, pasted.trim()),
    onSuccess: cache,
    onError,
  });

  const activate = useMutation({
    mutationFn: (keyId: number) => aiKeysApi.activate(keyId),
    onSuccess: cache,
    onError,
  });

  const remove = useMutation({
    mutationFn: (keyId: number) => aiKeysApi.remove(keyId),
    onSuccess: cache,
    onError,
  });

  const keys = data?.keys ?? [];
  const providers = data?.providers ?? [];
  // A provider already keyed cannot be added twice — the database has a unique
  // index on (user_id, provider), so offering it would produce a 422 for a
  // reason the user could have been shown instead.
  const available = providers.filter((p) => !keys.some((k) => k.provider === p));
  const busy = add.isPending || activate.isPending || remove.isPending;

  return (
    <Screen measure scroll avoidKeyboard>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: metrics.space.sm,
          paddingVertical: metrics.space.md,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          style={{ width: 32, height: 32, justifyContent: "center" }}
        >
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" style={{ flex: 1, fontSize: 22 }}>
          Your AI key
        </Text>
      </View>

      <Text tone="muted" style={{ marginBottom: metrics.space.lg }}>
        Add a key of your own and the assistant runs on your account, with your
        provider, at your cost. The key is checked with the provider before it is
        saved, and it is never shown again afterwards.
      </Text>

      {error ? (
        <View style={{ gap: metrics.space.sm }}>
          <Text tone="muted">
            {isNetworkFailure(error) ? "Could not reach MultiMagic." : "Could not load your keys."}
          </Text>
          <Pressable onPress={() => void refetch()} accessibilityRole="button" hitSlop={8}>
            <Text tone="accent">Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── The keys you have ──────────────────────────────────────────── */}
      {keys.length > 0 ? (
        <View
          testID="ai-keys-list"
          style={{
            backgroundColor: colors.surface,
            borderRadius: metrics.radius.md,
            overflow: "hidden",
          }}
        >
          {keys.map((key, index) => (
            <View
              key={key.id}
              testID={`ai-key-${key.provider}`}
              style={{
                paddingHorizontal: metrics.space.lg,
                paddingVertical: metrics.space.md,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
                gap: metrics.space.xs,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
                <KeyRound size={16} color={key.active ? colors.accent : colors.inkMuted} />
                <Text variant="label" style={{ flex: 1 }}>
                  {key.provider}
                </Text>
                {key.active ? (
                  <View
                    testID={`ai-key-active-${key.provider}`}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                  >
                    <Check size={14} color={colors.accent} />
                    <Text variant="caption" tone="accent">
                      In use
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* The mask is all a screen ever gets, and all it needs. */}
              <Text variant="caption" tone="muted">
                {key.masked ?? "••••"}
                {key.verified ? " · verified" : ""}
              </Text>

              {key.verificationError ? (
                <Text variant="caption" tone="danger">
                  {key.verificationError}
                </Text>
              ) : null}

              <View style={{ flexDirection: "row", gap: metrics.space.lg, marginTop: metrics.space.xs }}>
                {!key.active ? (
                  <Pressable
                    testID={`ai-key-use-${key.provider}`}
                    onPress={() => activate.mutate(key.id)}
                    disabled={busy}
                    accessibilityRole="button"
                    hitSlop={8}
                    style={{ minHeight: 32, justifyContent: "center" }}
                  >
                    <Text tone="accent" variant="caption">
                      Use this one
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable
                  testID={`ai-key-replace-${key.provider}`}
                  onPress={() => {
                    setReplacing(key);
                    setProvider(key.provider);
                    setRefusal(null);
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={{ minHeight: 32, justifyContent: "center" }}
                >
                  <Text tone="accent" variant="caption">
                    Replace
                  </Text>
                </Pressable>

                <Pressable
                  testID={`ai-key-remove-${key.provider}`}
                  onPress={() => remove.mutate(key.id)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove the ${key.provider} key`}
                  hitSlop={8}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    minHeight: 32,
                  }}
                >
                  <Trash2 size={13} color={colors.danger} />
                  <Text tone="danger" variant="caption">
                    Remove
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : isLoading || error ? null : (
        <Text testID="ai-keys-empty" tone="muted">
          No key of your own yet. The assistant runs on MultiMagic&apos;s.
        </Text>
      )}

      {/* ── Lent to you by somebody else ───────────────────────────────── */}
      {(data?.borrowed.length ?? 0) > 0 ? (
        <View testID="ai-keys-borrowed" style={{ marginTop: metrics.space.lg }}>
          <Text variant="caption" tone="muted">
            {data?.borrowed
              .map((b) => `${b.provider} — lent to you by ${b.ownerName ?? "someone"}`)
              .join("\n")}
          </Text>
        </View>
      ) : null}

      {/* ── Adding or replacing one ────────────────────────────────────── */}
      <View style={{ marginTop: metrics.space.xl, gap: metrics.space.md }}>
        <Text variant="label">{replacing ? `Replace your ${replacing.provider} key` : "Add a key"}</Text>

        {!replacing ? (
          available.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
              {/* From the server, never a hardcoded list. */}
              {available.map((name) => (
                <Pressable
                  key={name}
                  testID={`ai-provider-${name}`}
                  onPress={() => {
                    setProvider(name);
                    setRefusal(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: provider === name }}
                  style={{
                    paddingHorizontal: metrics.space.lg,
                    minHeight: metrics.touch,
                    justifyContent: "center",
                    borderRadius: metrics.radius.pill,
                    borderWidth: 1,
                    borderColor: provider === name ? colors.accent : colors.border,
                    backgroundColor: provider === name ? colors.accent : colors.surface,
                  }}
                >
                  <Text
                    variant="label"
                    style={{ color: provider === name ? colors.onAccent : colors.ink }}
                  >
                    {name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text tone="muted" variant="caption">
              You already have a key for every provider this app can use.
            </Text>
          )
        ) : null}

        {provider ? (
          <>
            <TextInput
              testID="ai-key-input"
              value={pasted}
              onChangeText={(v) => {
                setPasted(v);
                setRefusal(null);
              }}
              placeholder={`Paste your ${provider} key`}
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              // Not `secureTextEntry`: a key is pasted rather than typed, and
              // hiding it stops somebody checking they pasted the right one.
              // It is never stored on the device and never rendered again.
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: refusal ? colors.danger : colors.border,
                borderRadius: metrics.radius.md,
                paddingHorizontal: metrics.space.lg,
                minHeight: metrics.touch,
                color: colors.ink,
                fontSize: 15,
              }}
            />

            {refusal ? (
              <Text testID="ai-key-refused" tone="danger" variant="caption">
                {refusal}
              </Text>
            ) : null}

            <Pressable
              testID="ai-key-save"
              onPress={() => add.mutate()}
              disabled={!pasted.trim() || busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: !pasted.trim() || busy }}
              style={{
                minHeight: metrics.touch,
                borderRadius: metrics.radius.md,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: !pasted.trim() || busy ? colors.surface : colors.accent,
              }}
            >
              <Text
                variant="label"
                style={{ color: !pasted.trim() || busy ? colors.inkMuted : colors.onAccent }}
              >
                {add.isPending ? "Checking with the provider…" : "Check and save"}
              </Text>
            </Pressable>

            {replacing ? (
              <Pressable
                onPress={() => {
                  setReplacing(null);
                  setProvider(null);
                  setPasted("");
                }}
                accessibilityRole="button"
                style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
              >
                <Text tone="muted">Cancel</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {failure ? (
          <Text testID="ai-keys-error" tone="danger" variant="caption">
            {failure}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
