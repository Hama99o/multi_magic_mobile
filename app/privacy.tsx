/**
 * The privacy policy — `docs/design/account/SPEC.md` §3.3-3.4.
 *
 * ── RENDERED, NEVER A WEB VIEW ────────────────────────────────────────────
 * Peloton's opens `onepeloton.com` in a browser (the reference shows the
 * browser chrome). Ours renders the bundled text, for three reasons that are
 * this app's reasons rather than preferences: it works **on a bad connection**,
 * which is the condition the whole app is designed for (`BRIEF.md` §1); it does
 * not look like leaving the app; and it is the only version that cannot show a
 * store reviewer a 404.
 *
 * ── AND IT SAYS IT IS A DRAFT, BECAUSE IT IS ──────────────────────────────
 * `PRIVACY_IS_DRAFT` is read from the document's own title line, so the banner
 * cannot outlive the draft: renaming the file to `PRIVACY.md` and dropping the
 * DRAFT line turns it off, and nothing else has to be remembered.
 *
 * **This is a release gate.** Both stores require a reachable privacy policy
 * before a listing is approved, and a store build with this banner still on it
 * is a build that went out without his approval.
 */
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { PRIVACY_IS_DRAFT, PRIVACY_TEXT } from "@/content/privacy.generated";
import { Markdown } from "@/screens/account/Markdown";

export default function Privacy() {
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
        {/* The screen supplies the title. The document's own H1 is addressed to
            a reviewer — "needs Hamma9900's approval" — and is stripped by
            `scripts/build-privacy.mjs`, which is also what caught it. */}
        <Text testID="privacy-title" variant="title" style={{ flex: 1 }}>
          Privacy
        </Text>
      </View>

      {PRIVACY_IS_DRAFT ? (
        <View
          testID="privacy-draft-banner"
          style={{
            backgroundColor: colors.surface,
            borderLeftWidth: 3,
            borderLeftColor: colors.danger,
            borderRadius: metrics.radius.sm,
            padding: metrics.space.md,
            marginBottom: metrics.space.sm,
          }}
        >
          <Text variant="label" tone="danger">
            Draft — not yet approved
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            Every sentence here was checked against the code, but this text is
            still waiting on approval and must not ship in this state.
          </Text>
        </View>
      ) : null}

      <ScrollView
        testID="privacy-body"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: metrics.space.xl * 2 }}
      >
        <Markdown source={PRIVACY_TEXT} />
      </ScrollView>
    </Screen>
  );
}
