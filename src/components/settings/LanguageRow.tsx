/**
 * English · Français — beside the theme, because they are the same kind of
 * choice and he named them in the same breath: *"same lang as we have in web,
 * both mode."*
 *
 * ── Two words, not two flags ──────────────────────────────────────────────
 * A flag is a country and a language is not — and the two languages here are
 * spoken in dozens of countries between them. **Each language is written in
 * itself** ("Français", never "French"), which is the one convention that
 * works for somebody who cannot read the language the app is currently in:
 * the way out of a language you do not speak has to be legible from inside it.
 * The web's own switcher does exactly this (`TopNav.tsx`: `English` /
 * `Français`).
 *
 * ── Where this lives, and the SPEC divergence it carries ──────────────────
 * `docs/design/account/SPEC.md`'s references put settings on the account
 * screen. The theme chooser went into the sessions sheet instead, under
 * "Appearance", and this sits beside it — one control where the other already
 * is beats two controls in two places the night before a first build. Recorded
 * as a dated divergence note rather than by moving the pair.
 */
import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { LANGUAGES } from "@/i18n";
import { useLanguage } from "@/stores/language.store";
import { useTranslation } from "react-i18next";

export function LanguageRow({ userId }: { userId?: number | null }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const language = useLanguage((s) => s.language);
  const setLanguage = useLanguage((s) => s.setLanguage);

  return (
    <View style={{ gap: metrics.space.sm }} testID="language-row">
      <Text variant="label" tone="muted" style={{ paddingHorizontal: metrics.space.sm }}>
        {t("language.title")}
      </Text>
      <View style={{ flexDirection: "row", gap: metrics.space.sm, paddingHorizontal: metrics.space.sm }}>
        {LANGUAGES.map((option) => {
          const selected = option.code === language;
          return (
            <Pressable
              key={option.code}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => setLanguage(option.code, userId)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: metrics.space.xs,
                minHeight: metrics.touch,
                paddingHorizontal: metrics.space.lg,
                borderRadius: metrics.radius.pill,
                borderWidth: 1,
                borderColor: selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.accent : "transparent",
              }}
              testID={`language-${option.code}`}
            >
              {selected ? <Check size={14} color={colors.onAccent} /> : null}
              <Text variant="label" style={{ color: selected ? colors.onAccent : colors.ink }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
