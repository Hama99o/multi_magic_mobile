/**
 * Account — and the whole design of this screen is one sentence:
 * **it must not look like the delete two rows away.**
 *
 * Deleting a conversation is SAFE BY CONSTRUCTION. `Ai::Sessions.destroy`
 * deletes `AiChunk.where(conversation_id: …)`, and a chunk made from a Note,
 * Loan or Contact carries no `conversation_id` — the guarantee holds by scoping
 * (`BRIEF.md` §2a). Its confirm names what is **safe**, because that is the
 * guarantee he asked for.
 *
 * Deleting the account removes his life's records, and its confirm names what
 * **goes**, because nothing is safe. Same discipline, pointed the other way.
 *
 * So the two differ in every dimension available: one is a row in the sessions
 * sheet and this is its own screen; one confirms in a dialog and this confirms
 * on a full screen; one is guarded by a button and this by a password.
 *
 * ── SIX APPS, NOT ONE BUTTON ──────────────────────────────────────────────
 * Character AI, Crouton, Glassdoor, Careem, Deliveroo and Bolt Food all make
 * account deletion a plain red ROW — Character AI puts it alone on a screen, as
 * here. A low-emphasis row is harder to hit by accident than a full-width
 * button, which is exactly why it is right for the most destructive action in
 * the app. His own words: *"we should have small button for this."*
 *
 * Wabi's caption is taken with it: **the warning arrives before the tap**, not
 * after.
 */
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react-native";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { ACCOUNT_DELETION_AVAILABLE } from "@/api/account";

export default function Account() {
  const colors = useColors();
  const metrics = useMetrics();

  return (
    <Screen measure>
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
        <Text variant="title" style={{ flex: 1 }}>
          Account
        </Text>
      </View>

      {/* The ordinary row, in its own group. */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: metrics.radius.md,
          overflow: "hidden",
        }}
      >
        <Pressable
          testID="account-privacy"
          onPress={() => router.push("/privacy")}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: metrics.space.lg,
            minHeight: metrics.touch,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ flex: 1 }}>Privacy policy</Text>
          <ChevronRight size={18} color={colors.inkMuted} />
        </Pressable>
      </View>

      {/* ── The destructive one: separated by space, not only by colour ──────
          Crouton puts it in a card of its own; Glassdoor below a divider. Both,
          because separation is the thing that stops a thumb arriving here from
          the row above. */}
      <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: metrics.space.xl }}>
        <Pressable
          testID="account-delete"
          onPress={() => router.push("/delete-account")}
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          accessibilityHint="Opens a confirmation. This cannot be undone."
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: metrics.space.md,
            paddingHorizontal: metrics.space.lg,
            minHeight: metrics.touch,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Trash2 size={18} color={colors.danger} />
          {/* No chevron. Six references and not one filled button — and a
              chevron here would promise an ordinary screen. */}
          <Text tone="danger" style={{ flex: 1 }}>
            Delete account
          </Text>
        </Pressable>

        {/* Wabi's caption: the warning before the tap. */}
        <Text
          variant="caption"
          tone="muted"
          style={{ paddingHorizontal: metrics.space.lg, marginTop: metrics.space.xs }}
        >
          {ACCOUNT_DELETION_AVAILABLE
            ? "This removes everything and cannot be undone."
            : "This removes everything and cannot be undone. Not available in the app yet."}
        </Text>
      </View>
    </Screen>
  );
}
