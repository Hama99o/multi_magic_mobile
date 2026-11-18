/**
 * FINANCE — the app's front page (`docs/design/finance/SPEC.md` §D.1).
 *
 * A segmented bar under the header picks the part: Overview, Expenses,
 * Income, Loans, Budgets (the web's tabs). Recurring, Categories, Reports,
 * the Trash and Help are in ⋯. `?tab=` opens on a part, so a link or the
 * Overview's "See all" lands on the right one.
 */
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { ChevronLeft, CircleHelp, FileSpreadsheet, MoreVertical, Repeat, Tag as TagIcon, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { goHome, useAndroidBackToHome } from "@/hooks/useBackToHome";
import { ActionSheet } from "@/screens/contacts/ActionSheet";
import { FINANCE } from "@/screens/finance/parts";
import { FINANCE_TABS, type FinanceTab } from "@/screens/finance/tabs/names";
import { HelpSheet } from "@/screens/finance/HelpSheet";
import { OverviewTab } from "@/screens/finance/tabs/Overview";
import { ExpensesTab } from "@/screens/finance/tabs/Expenses";
import { IncomeTab } from "@/screens/finance/tabs/Income";
import { LoansTab } from "@/screens/finance/tabs/Loans";
import { BudgetsTab } from "@/screens/finance/tabs/Budgets";

export default function FinanceScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  useAndroidBackToHome();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<FinanceTab>(FINANCE_TABS.find((x) => x === params.tab) ?? "overview");
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const go = (path: "/finance/recurring" | "/finance/categories" | "/finance/reports" | "/finance/trash") => {
    setMenu(false);
    router.push(path);
  };

  return (
    <Screen measure>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="finance-back" onPress={goHome} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
          <ChevronLeft size={24} color={colors.ink} />
        </Pressable>
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }} testID="finance-title">
          {t("finance.title")}
        </Text>
        <Pressable testID="finance-menu" onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel={t("finance.more")} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
          <MoreVertical size={22} color={colors.ink} />
        </Pressable>
      </View>

      <View style={{ marginBottom: metrics.space.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={{ gap: metrics.space.xs, padding: metrics.space.xs, backgroundColor: colors.surface, borderRadius: metrics.radius.md, flexGrow: 1 }}>
          {FINANCE_TABS.map((k) => {
            const on = k === tab;
            return (
              <Pressable
                key={k}
                testID={`finance-tab-button-${k}`}
                onPress={() => setTab(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={{ flexGrow: 1, minHeight: 40, paddingHorizontal: metrics.space.md, alignItems: "center", justifyContent: "center", borderRadius: metrics.radius.sm, backgroundColor: on ? FINANCE : "transparent" }}
              >
                <Text variant="label" style={{ color: on ? "#04161a" : colors.ink }} numberOfLines={1}>
                  {t(`finance.tabs.${k}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "overview" ? <OverviewTab onOpen={setTab} /> : null}
        {tab === "expenses" ? <ExpensesTab /> : null}
        {tab === "income" ? <IncomeTab /> : null}
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
