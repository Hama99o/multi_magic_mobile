/**
 * WHICH LANGUAGE THE MICROPHONE LISTENS IN.
 *
 * His words: *"speech to text we should be able to choose french or english,
 * and if there is pashto possible add that also, for ai assistant speech to
 * text."*
 *
 * ── THE CHOICE EXISTED AND WAS HIDDEN ────────────────────────────────────
 * Two languages were already there, and the only way to move between them was
 * a LONG PRESS on the mic — an unmarked gesture with nothing on screen saying
 * it was there or which language was current. He has an open question about
 * hidden long presses in this app and this was one of them. The long press
 * still works; it is a shortcut now rather than the only door.
 *
 * ── AND PASHTO IS OFFERED, NOT PROMISED ──────────────────────────────────
 * `Ai::RagChat` already answers in it — "Someone writing Pashto… wants it back
 * the same way" — so the assistant could always hold the conversation; only
 * the microphone could not. Whether a given phone can hear it is the phone's
 * answer: Android ships whichever locales its recogniser has, and `ps-AF` is
 * not among the common ones.
 *
 * So each option is checked against `getSupportedLocales()` and one this phone
 * does not list is shown DISABLED with a line saying so, rather than being
 * hidden (which would make his request look ignored) or offered (which would
 * fail at the mic with a message about the recogniser). When the device cannot
 * say — Android 12 and below return an empty list rather than an error —
 * everything is offered, because greying out a working phone is the worse of
 * the two mistakes.
 */
import { Pressable, View } from "react-native";
import { Check } from "@/components/icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { LANGUAGES, isLocaleSupported, useDictationLocales } from "@/hooks/useSpeechToText";

export function DictationRow({
  lang,
  onChange,
}: {
  lang: string;
  onChange: (code: string) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { locales } = useDictationLocales();

  return (
    <View style={{ gap: metrics.space.sm }} testID="dictation-row">
      <Text variant="label" tone="muted" style={{ paddingHorizontal: metrics.space.sm }}>
        {t("dictation.title")}
      </Text>

      <View style={{ gap: metrics.space.sm, paddingHorizontal: metrics.space.sm }}>
        {LANGUAGES.map((option) => {
          const selected = option.code === lang;
          /**
           * NOTHING IS BLOCKED HERE, deliberately — 2026-09-24, his call:
           * "no blocage which lang we want".
           *
           * This used to disable an option `getSupportedLocales()` did not
           * list. The argument against is in this file already: that API is
           * not a reliable oracle. Android 12 and below return an empty array
           * rather than an error, a service can refuse the question, and a
           * recogniser can list less than it can actually do. Blocking on it
           * greys out a language that would have worked, and the user has no
           * way to find out otherwise.
           *
           * So every language is selectable and the phone gets to answer at
           * the microphone instead, where `problemSentence` turns a real
           * `language-not-supported` into a sentence. A refusal that happens
           * is worth more than a refusal that is predicted.
           */
          return (
            <Pressable
              key={option.code}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.code)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: metrics.space.sm,
                minHeight: metrics.touch,
                paddingHorizontal: metrics.space.lg,
                borderRadius: metrics.radius.pill,
                borderWidth: 1,
                borderColor: selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.accent : "transparent",
              }}
              testID={`dictation-${option.code}`}
            >
              {selected ? <Check size={14} color={colors.onAccent} /> : null}
              <Text variant="label" style={{ color: selected ? colors.onAccent : colors.ink }}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Advisory, not a gate: one line, and only when this phone actually
          answered the question and left something out. */}
      {locales !== null && LANGUAGES.some((l) => !isLocaleSupported(l.code, locales)) ? (
        <Text
          variant="caption"
          tone="muted"
          style={{ paddingHorizontal: metrics.space.sm }}
          testID="dictation-unavailable"
        >
          {t("dictation.someUnavailable")}
        </Text>
      ) : null}
    </View>
  );
}
