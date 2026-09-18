/**
 * A round avatar, or the initial on a stable colour when there is no photo.
 *
 * Most MultiMagic users have no photo attached — `user_serializer.rb:220` emits
 * `avatar` only `if user&.photo&.attached?` — so the fallback is the normal
 * case, not the edge one, and it has to look deliberate rather than broken.
 *
 * The colour comes from `categoryColorFor(userId)` (`src/theme/tokens.ts`), the
 * same eight accents read off his own icon, keyed on the id so a person keeps
 * their colour as rows move up the list. `IDENTITY.md` §1 allows those eight
 * "ONLY where a category exists — never decoration": a person IS the category
 * here, which is exactly the case the rule was written for.
 */
import { Image, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors } from "@/hooks/useColors";
import { categoryColorFor } from "@/theme/tokens";

export function Avatar({
  name,
  uri,
  userId,
  size = 44,
  isOnline = false,
}: {
  name: string;
  uri: string | null;
  userId: number;
  size?: number;
  /** A small dot on the rim. Presence is `last_sign_in_at` within 3 minutes. */
  isOnline?: boolean;
}) {
  const colors = useColors();
  const tint = categoryColorFor(userId);
  // Codepoint-aware: `name[0]` on an emoji or an accented pair gives half a
  // character, and this app's corpus is largely French.
  const initial = [...name.trim()][0]?.toUpperCase() ?? "?";

  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: tint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            variant="label"
            style={{ color: colors.ground, fontSize: size * 0.4, lineHeight: size * 0.5 }}
          >
            {initial}
          </Text>
        </View>
      )}

      {isOnline ? (
        <View
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size * 0.14,
            backgroundColor: colors.accent,
            // Against the ground, not the avatar, so the dot reads as an
            // overlay rather than as part of the photo.
            borderWidth: 2,
            borderColor: colors.ground,
          }}
        />
      ) : null}
    </View>
  );
}
