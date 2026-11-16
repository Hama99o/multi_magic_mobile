/** Finance › Overview tab. Placeholder until it is built (docs/design/finance/SPEC.md §D.2). */
import { View } from "react-native";
import type { FinanceTab } from "./names";

export function OverviewTab({ onOpen }: { onOpen: (tab: FinanceTab) => void }) {
  void onOpen;
  return <View testID="finance-tab-overview" style={{ flex: 1 }} />;
}
