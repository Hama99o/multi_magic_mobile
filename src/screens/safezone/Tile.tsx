/**
 * The leading tile of a SafeZone item, in the list and on the item's page
 * (Mobbin: 1Password). A login: its site's initial on its own colour (the
 * web's siteInitial: no request to a third party for an icon). A card or a
 * document: its icon on a tinted tile.
 */
import { View } from "react-native";
import { CreditCard, IdCard, KeyRound } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors } from "@/hooks/useColors";
import { categoryColorFor } from "@/theme/tokens";
import type { SafeZoneKind } from "@/api/safezone";
import { siteInitial, stableHash } from "./display";

export const KIND_ICONS = { passwords: KeyRound, payment_cards: CreditCard, identities: IdCard } as const;

export function Tile({ kind, site, size = 44, testID }: { kind: SafeZoneKind; site: string; size?: number; testID?: string }) {
  const colors = useColors();
  const box = { width: size, height: size, borderRadius: size * 0.28, alignItems: "center" as const, justifyContent: "center" as const };
  if (kind === "passwords") {
    return (
      <View testID={testID} style={{ ...box, backgroundColor: categoryColorFor(stableHash(site.toLowerCase())) }}>
        <Text style={{ color: colors.ground, fontSize: size * 0.42, fontWeight: "700" }}>{siteInitial(site)}</Text>
      </View>
    );
  }
  const Icon = KIND_ICONS[kind];
  return (
    <View testID={testID} style={{ ...box, backgroundColor: `${colors.accent}22` }}>
      <Icon size={size * 0.48} color={colors.accent} />
    </View>
  );
}
