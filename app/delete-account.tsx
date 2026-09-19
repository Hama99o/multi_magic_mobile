/**
 * The confirm — as heavy as the row is light.
 *
 * ── A SCREEN, NOT A DIALOG ────────────────────────────────────────────────
 * Wabi and FotMob confirm in a two-line system alert; Tubi in a sheet. All
 * three are deleting a watch history or a recipe list. This deletes somebody's
 * notes, contacts, loans, budgets, documents and calendar — so it gets the room
 * to say what that means, and the reader has to arrive here deliberately.
 *
 * ── IT NAMES WHAT GOES ────────────────────────────────────────────────────
 * Tubi is the only one of eleven references that lists what it removes rather
 * than saying "your data", and it is the one that reads like it means it. Each
 * line of `DELETED_WITH_ACCOUNT` maps to a `dependent: :destroy` on `User`.
 *
 * ── AND WHAT IS KEPT, AND WHY ─────────────────────────────────────────────
 * `user.rb:77` — `has_many :ai_usage_events, dependent: :nullify`. Deletion
 * detaches those rows rather than removing them. "Everything" with a stated
 * exception is honest; "everything" with an unstated one is not, and an
 * unstated one is the kind a regulator finds rather than a user.
 *
 * ── THE PASSWORD, TYPED AGAIN — further than all eleven ───────────────────
 * FotMob is the only reference that re-authenticates at all, and it does so by
 * sending you to a login screen. None types a password inline. We do, because
 * the account is reachable from a phone somebody else might be holding, and a
 * valid session token is not evidence that the owner is the one pressing the
 * button. A checkbox is no guard at all against that person.
 *
 * ── WHILE THE ENDPOINT DOES NOT EXIST ─────────────────────────────────────
 * Everything above still renders — what goes and what is kept is a disclosure
 * worth reading whether or not the button works today, and both stores ask for
 * it. What is NOT rendered is the password field, because walking somebody
 * through typing their password into a wall is worse than telling them plainly.
 * See `src/api/account.ts`.
 */
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, TriangleAlert } from "lucide-react-native";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import {
  ACCOUNT_DELETION_AVAILABLE,
  DELETED_WITH_ACCOUNT,
  KEPT_AFTER_DELETION,
  deleteAccount,
} from "@/api/account";
import { apiErrorMessage, isNetworkFailure, isUnauthorized } from "@/api/http";

export default function DeleteAccount() {
  const colors = useColors();
  const metrics = useMetrics();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      // Deliberately no "your account was deleted" screen: the session is gone,
      // so there is nothing left to show it on. The root layout takes over.
      router.replace("/sign-in");
    } catch (e) {
      setError(
        isUnauthorized(e)
          ? "That password is not right."
          : isNetworkFailure(e)
            ? "Could not reach MultiMagic. Nothing was deleted."
            : (apiErrorMessage(e) ?? "Could not delete the account. Nothing was deleted."),
      );
    } finally {
      setBusy(false);
    }
  };

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
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
        <TriangleAlert size={22} color={colors.danger} />
        <Text variant="title" tone="danger" style={{ flex: 1, fontSize: 22 }}>
          Delete your account
        </Text>
      </View>

      {/* Said once, plainly. Not repeated, because a warning repeated is a
          warning skimmed. */}
      <Text tone="muted" style={{ marginTop: metrics.space.sm }}>
        This cannot be undone.
      </Text>

      <Text variant="label" style={{ marginTop: metrics.space.xl }}>
        What is deleted
      </Text>
      <View testID="delete-what-goes" style={{ marginTop: metrics.space.sm, gap: metrics.space.sm }}>
        {DELETED_WITH_ACCOUNT.map((line) => (
          <View key={line} style={{ flexDirection: "row", gap: metrics.space.sm }}>
            <Text tone="danger">•</Text>
            <Text style={{ flex: 1 }}>{line}</Text>
          </View>
        ))}
      </View>

      <Text variant="label" style={{ marginTop: metrics.space.xl }}>
        What is kept
      </Text>
      <Text tone="muted" style={{ marginTop: metrics.space.sm }}>
        {KEPT_AFTER_DELETION}
      </Text>

      {ACCOUNT_DELETION_AVAILABLE ? (
        <View style={{ marginTop: metrics.space.xl, gap: metrics.space.sm }}>
          <Text variant="label">Type your password to confirm</Text>
          <TextInput
            testID="delete-password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            placeholder="Password"
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel="Password"
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: error ? colors.danger : colors.border,
              borderRadius: metrics.radius.md,
              paddingHorizontal: metrics.space.lg,
              minHeight: metrics.touch,
              color: colors.ink,
              fontSize: 16,
            }}
          />

          {error ? (
            <Text testID="delete-error" tone="danger" variant="caption">
              {error}
            </Text>
          ) : null}

          <Pressable
            // Says WHICH delete. The sessions dialog is `delete-conversation-*`;
            // the two used to share `delete-confirm` (2026-09-19).
            testID="delete-account-confirm"
            onPress={() => void confirm()}
            disabled={!password || busy}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
            accessibilityState={{ disabled: !password || busy }}
            style={{
              marginTop: metrics.space.sm,
              minHeight: metrics.touch,
              borderRadius: metrics.radius.md,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: !password || busy ? colors.surface : colors.danger,
            }}
          >
            <Text
              variant="label"
              style={{ color: !password || busy ? colors.inkMuted : colors.onAccent }}
            >
              {busy ? "Deleting…" : "Delete my account"}
            </Text>
          </Pressable>

          {/* The safe way out is a plain row, not a competing button. FotMob
              renders Cancel in green, which gives the safe choice more colour
              than the dangerous one and makes the dangerous one look ordinary. */}
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
          >
            <Text tone="muted">Keep my account</Text>
          </Pressable>
        </View>
      ) : (
        <View
          testID="delete-unavailable"
          style={{
            marginTop: metrics.space.xl,
            padding: metrics.space.lg,
            backgroundColor: colors.surface,
            borderRadius: metrics.radius.md,
            gap: metrics.space.xs,
          }}
        >
          <Text variant="label">Not available in the app yet</Text>
          <Text tone="muted" variant="caption">
            Deleting an account is not something this app can do today — the
            server does not offer it yet. Nothing on this screen has changed
            anything. It is written down here so you know exactly what will go
            when it does.
          </Text>
        </View>
      )}
    </Screen>
  );
}
