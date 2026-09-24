/**
 * HOW CLOSE A MESSAGE IS TO THE SERVER'S LIMIT, shown only when it matters.
 *
 * `Message` validates `body` at 10,000 characters (multi_magic
 * `message.rb:22`), for a question to the assistant and a message to a person
 * alike. Past it the server answers 422, and a people message showed
 * "Not sent. Tap to retry" for a retry that could never work.
 *
 * Decided 2026-09-24: a COUNTER, not a cut. It appears only near the limit,
 * send is blocked over it, and nothing somebody typed is ever truncated. That
 * is why neither composer sets `maxLength`, which silently drops the end of a
 * paste. The server's 422 stays the backstop; this is a courtesy.
 */
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { useMetrics } from "@/hooks/useColors";
import { LIMITS } from "@/api/ai";

/** How far below the limit the count starts to show. Read when rendering,
 *  never at import: a module-level read of LIMITS crashed a whole test suite
 *  that mocks `@/api/ai` without it (2026-09-24). */
const SHOW_WITHIN = 1_000;

export const isTooLong = (text: string) => text.length > LIMITS.messageLength;

export function LengthCounter({ length, testID = "composer-length" }: { length: number; testID?: string }) {
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  if (length < LIMITS.messageLength - SHOW_WITHIN) return null;

  const over = length - LIMITS.messageLength;
  const n = (v: number) => v.toLocaleString(i18n.language);
  return (
    <Text
      variant="caption"
      tone={over > 0 ? "danger" : "muted"}
      style={{ textAlign: "right", paddingHorizontal: metrics.space.md }}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      {over > 0
        ? over === 1
          ? t("composer.tooLongOne", { over: n(over) })
          : t("composer.tooLongMany", { over: n(over) })
        : t("composer.length", { length: n(length), limit: n(LIMITS.messageLength) })}
    </Text>
  );
}
