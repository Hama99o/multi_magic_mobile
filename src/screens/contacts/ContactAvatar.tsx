/**
 * A contact's face: the photo, or initials on a colour picked from the id
 * (Beside, Telegram — SPEC §B). The colour is stable for a person across the
 * list and the detail, and readable on both grounds: every swatch keeps white
 * initials above 4.5:1.
 */
import { View } from "react-native";
import { Image } from "expo-image";
import { Text } from "@/components/reusables/text";
import type { Contact } from "@/api/contacts";
import { initials } from "./sections";

/** Mid-dark tones: white text on each measures ≥ 4.5:1 (WCAG AA). */
export const AVATAR_SWATCHES = ["#2f6f8a", "#7a4f9a", "#a0522d", "#2e7d4f", "#8a3b5c", "#4a5fa8", "#6b6b2f", "#9a3f3f"];

export function swatchFor(id: number): string {
  return AVATAR_SWATCHES[Math.abs(id) % AVATAR_SWATCHES.length];
}

export function ContactAvatar({
  contact,
  size,
  testID,
}: {
  contact: Pick<Contact, "id" | "firstname" | "lastname" | "nickname" | "company" | "photoUrl">;
  size: number;
  testID?: string;
}) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (contact.photoUrl) {
    return (
      <Image
        testID={testID}
        source={{ uri: contact.photoUrl }}
        style={round}
        contentFit="cover"
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    );
  }
  return (
    <View testID={testID} accessible={false} importantForAccessibility="no-hide-descendants" style={{ ...round, alignItems: "center", justifyContent: "center", backgroundColor: swatchFor(contact.id) }}>
      <Text style={{ color: "#FFFFFF", fontSize: size * 0.38, lineHeight: size * 0.46, fontWeight: "600" }} numberOfLines={1}>
        {initials(contact)}
      </Text>
    </View>
  );
}
