/**
 * ONE SMALL "OFFLINE" LINE, ABOVE EVERY SCREEN (docs/QA_FULL.md top-10 #8).
 *
 * It shows the moment the app knows MultiMagic cannot be reached: a request
 * that got no answer, or the probe made each time the app comes back to the
 * foreground (`stores/reachability.store.ts`). It says what still works,
 * because "offline" alone reads as "nothing works": uploads wait in the
 * queue and the assistant keeps the question.
 *
 * ABOVE the screens, not over them. Measured 2026-11-07 on qa_phone: as an
 * absolute overlay it covered the Home title and AI button and the Pages
 * search pill. So while offline it is a band in the layout that takes the
 * status-bar inset itself, and the screens below are handed a top inset of 0
 * — they all read it through `useSafeAreaInsets` (`ScreenContainer` is the
 * only one that uses `top`), so they move down by the band's height.
 *
 * The tree has the SAME SHAPE online and offline (the band's slot is null
 * when online, the provider is always there), so the navigation stack below
 * is never remounted when the connection comes and goes.
 *
 * Reachability is the SERVER answering, not the phone having a signal (that
 * store's header); a native network module may come later as an earlier hint.
 */
import type { ReactNode } from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useReachability } from "@/stores/reachability.store";

export function OfflineBanner({ children }: { children?: ReactNode }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const reachable = useReachability((s) => s.reachable);
  const below = useMemo(() => (reachable ? insets : { ...insets, top: 0 }), [reachable, insets]);

  return (
    <View style={{ flex: 1 }}>
      {reachable ? null : (
        <View
          accessibilityLiveRegion="polite"
          style={{
            // The ground, not ink: the status bar's glyphs are drawn for the
            // ground, and an ink band would hide the clock under them.
            backgroundColor: colors.ground,
            paddingTop: insets.top + metrics.space.xs,
            paddingBottom: metrics.space.xs,
            alignItems: "center",
          }}
          testID="offline-banner"
        >
          <View style={{ backgroundColor: colors.ink, borderRadius: metrics.radius.pill, paddingHorizontal: metrics.space.md, paddingVertical: 4, maxWidth: "90%" }}>
            {/* ONE line: at two it was a whole header's height (2026-11-07). */}
            <Text variant="caption" numberOfLines={1} style={{ color: colors.ground, textAlign: "center" }}>
              {t("common.offlineBanner")}
            </Text>
          </View>
        </View>
      )}
      <SafeAreaInsetsContext.Provider value={below}>{children}</SafeAreaInsetsContext.Provider>
    </View>
  );
}
