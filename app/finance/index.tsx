/**
 * FINANCE — the app's front page (`docs/design/finance/SPEC.md` §D.1).
 *
 * A segmented bar under the header picks the part: Overview, Expenses,
 * Income, Loans, Budgets (the web's tabs). Recurring, Categories, Reports,
 * the Trash and Help are in ⋯. `?tab=` opens on a part, so a link or the
 * Overview's "See all" lands on the right one.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useNav, useNavParams } from "@/lib/nav";
import { useTranslation } from "react-i18next";
import { CircleHelp, FileSpreadsheet, MoreVertical, Repeat, Tag as TagIcon, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { AppHeader } from "@/components/shell/AppHeader";
import { ActionSheet } from "@/screens/contacts/ActionSheet";
import { FINANCE } from "@/screens/finance/parts";
import { FINANCE_TABS, type FinanceTab } from "@/screens/finance/tabs/names";
import { HelpSheet } from "@/screens/finance/HelpSheet";
import { OverviewTab } from "@/screens/finance/tabs/Overview";
import { ExpensesTab } from "@/screens/finance/tabs/Expenses";
import { IncomeTab } from "@/screens/finance/tabs/Income";
import { LoansTab } from "@/screens/finance/tabs/Loans";
import { BudgetsTab } from "@/screens/finance/tabs/Budgets";
import { tabLayout, tabScrollX } from "@/screens/finance/tabRow";

export default function FinanceScreen() {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  // `entry` opens one expense or income on its sheet: a link from search, a
  // notification or the assistant (`src/lib/inAppRoute.ts`, parity F-X3).
  const params = useNavParams<{ tab?: string; entry?: string }>();
  const entryId = params.entry && /^\d+$/.test(params.entry) ? Number(params.entry) : undefined;
  const [tab, setTab] = useState<FinanceTab>(FINANCE_TABS.find((x) => x === params.tab) ?? "overview");
  const [menu, setMenu] = useState(false);
  const { fontScale } = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState(0);
  const layout = rowWidth > 0 ? tabLayout(rowWidth, FINANCE_TABS.length, fontScale) : null;
  const selected = Math.max(0, FINANCE_TABS.indexOf(tab));
  const startX = layout?.scrolls ? tabScrollX(selected, layout.width, rowWidth, FINANCE_TABS.length) : 0;
  const maxX = layout ? Math.max(0, FINANCE_TABS.length * layout.width - rowWidth) : 0;
  const [scrollX, setScrollX] = useState(0);
  const rowRef = useRef<ScrollView>(null);
  // The selected tab in view: on the first layout, and whenever it changes.
  useEffect(() => {
    if (!layout?.scrolls) return;
    rowRef.current?.scrollTo({ x: startX, animated: false });
    setScrollX(startX);
  }, [startX, layout?.scrolls]);
  const [help, setHelp] = useState(false);
  const go = (path: "/finance/recurring" | "/finance/categories" | "/finance/reports" | "/finance/trash") => {
    setMenu(false);
    router.push(path);
  };

  return (
    <Screen measure header={<AppHeader app="finance" />}>

      {/* The app's own row: its five tabs, and ⋮ for the rest (recurring, categories, reports, trash). */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, marginTop: metrics.space.sm, marginBottom: metrics.space.md }}>
      <View style={{ flex: 1 }}>
        {/* On a phone the next tab always PEEKS (half a tab) under an edge fade, and the
            selected one is scrolled into view: with five tabs filling the row exactly,
            Budgets sat off-screen with nothing to say so (device, 2026-11-25). */}
        <ScrollView
          ref={rowRef}
          testID="finance-tabs"
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityRole="tablist"
          onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
          contentOffset={{ x: startX, y: 0 }}
          onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={32}
          contentContainerStyle={{ paddingVertical: metrics.space.xs, backgroundColor: colors.surface, borderRadius: metrics.radius.md, flexGrow: 1 }}
        >
          {FINANCE_TABS.map((k) => {
            const on = k === tab;
            return (
              <Pressable
                key={k}
                testID={`finance-tab-button-${k}`}
                onPress={() => {
                  setTab(k);
                  // In the address too, so the app reopens on this tab (CLAUDE.md, "Reopening the app").
                  router.setParams({ tab: k });
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ width: layout?.width, flexGrow: layout ? 0 : 1, minHeight: 40, paddingHorizontal: metrics.space.sm, alignItems: "center", justifyContent: "center", borderRadius: metrics.radius.sm, backgroundColor: on ? FINANCE : "transparent" }}
              >
                <Text variant="label" style={{ color: on ? "#04161a" : colors.ink }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {t(`finance.tabs.${k}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {layout?.scrolls && scrollX > 1 ? <EdgeFade side="start" color={colors.surface} testID="finance-tabs-fade-start" /> : null}
        {layout?.scrolls && scrollX < maxX - 1 ? <EdgeFade side="end" color={colors.surface} testID="finance-tabs-fade-end" /> : null}
      </View>
        <Pressable testID="finance-menu" onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel={t("finance.more")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
          <MoreVertical size={22} color={colors.ink} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "overview" ? <OverviewTab onOpen={setTab} /> : null}
        {tab === "expenses" ? <ExpensesTab openId={entryId} /> : null}
        {tab === "income" ? <IncomeTab openId={entryId} /> : null}
        {tab === "loans" ? <LoansTab /> : null}
        {tab === "budgets" ? <BudgetsTab /> : null}
      </View>

      <ActionSheet
        open={menu}
        title={t("finance.title")}
        onClose={() => setMenu(false)}
        testID="finance-menu-sheet"
        actions={[
          { key: "recurring", label: t("finance.menu.recurring"), icon: Repeat, onPress: () => go("/finance/recurring") },
          { key: "categories", label: t("finance.menu.categories"), icon: TagIcon, onPress: () => go("/finance/categories") },
          { key: "reports", label: t("finance.menu.reports"), icon: FileSpreadsheet, onPress: () => go("/finance/reports") },
          { key: "trash", label: t("finance.menu.trash"), icon: Trash2, onPress: () => go("/finance/trash") },
          {
            key: "help",
            label: t("finance.menu.help"),
            icon: CircleHelp,
            onPress: () => {
              setMenu(false);
              setHelp(true);
            },
          },
        ]}
      />
      <HelpSheet open={help} onClose={() => setHelp(false)} />
    </Screen>
  );
}

/** A fade from the page's ground to clear over one edge of the tab row, over the peeking tab. */
function EdgeFade({ side, color, testID }: { side: "start" | "end"; color: string; testID: string }) {
  const [h, setH] = useState(0);
  const W = 32;
  return (
    <View
      pointerEvents="none"
      testID={testID}
      onLayout={(e) => setH(e.nativeEvent.layout.height)}
      style={{ position: "absolute", top: 0, bottom: 0, width: W, ...(side === "start" ? { start: 0 } : { end: 0 }) }}
    >
      {h > 0 ? (
        <Svg width={W} height={h}>
          <Defs>
            <LinearGradient id={`${testID}-g`} x1={side === "start" ? "1" : "0"} y1="0" x2={side === "start" ? "0" : "1"} y2="0">
              <Stop offset="0" stopColor={color} stopOpacity={0} />
              <Stop offset="1" stopColor={color} stopOpacity={0.95} />
            </LinearGradient>
          </Defs>
          <Rect width={W} height={h} fill={`url(#${testID}-g)`} />
        </Svg>
      ) : null}
    </View>
  );
}
