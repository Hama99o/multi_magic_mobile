/**
 * The assistant's answer, rendered rather than printed.
 *
 * ── WHY THIS EXISTS, AND IT IS NOT A POLISH ITEM ──────────────────────────
 * The web renders every reply through `react-markdown` (`AiMarkdown.tsx`), and
 * this app was rendering the raw string in a `<Text>`. Most of the time that
 * looks merely untidy — `**bold**` with its asterisks showing. For ONE answer
 * it is a broken feature:
 *
 *   Ai::Actions::FindFiles puts the download link in the answer itself —
 *   `[payslip.pdf](/rails/active_storage/…)` — precisely so that "a model that
 *   only repeats what it was told still hands the user something clickable".
 *
 * Printed as text, that is not a link. The user asks for their payslip, the
 * assistant finds it, and the reply shows them a filename in brackets followed
 * by a path. **The file is unreachable**, and nothing on screen says so.
 *
 * ── The subset, deliberately ──────────────────────────────────────────────
 * Paragraphs, links, bold, italic, inline code, fenced code, bullet and
 * numbered lists. NOT tables, images or headings — the assistant does not emit
 * them, and a parser that pretends to handle what it drops is how a sentence
 * disappears between the model and the screen. Anything unrecognised is
 * rendered as its own literal text, which is ugly and honest, never silent.
 */
import { Fragment, type ReactNode } from "react";
import { Linking, ScrollView, Text as RNText, View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { API_URL } from "@/config/env";
import { FONTS } from "@/theme/fonts";

export interface AnswerLink {
  label: string;
  url: string;
}

/** `[label](target)`, `**bold**`, `*italic*`, `` `code` `` — in one pass. */
const INLINE = /(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(`[^`\n]+`)/g;

/**
 * A relative path from the server is relative to the SERVER, not to the phone.
 *
 * `FindFiles` returns `rails_blob_path(only_path: true)` — deliberately, so it
 * needs no host configured — which is correct for a browser already on that
 * origin and useless on a device. It only becomes openable once it is joined to
 * the API host.
 */
export function absoluteUrl(target: string): string {
  if (/^https?:\/\//i.test(target)) return target;
  return `${API_URL}${target.startsWith("/") ? "" : "/"}${target}`;
}

/** A link that points at a stored file rather than at a page in the web app. */
export function isFileLink(url: string): boolean {
  return /\/rails\/active_storage\//.test(url) || /\.(pdf|png|jpe?g|webp|gif|heic|heif|csv)(\?|$)/i.test(url);
}

function renderInline(
  line: string,
  colors: ReturnType<typeof useColors>,
  onOpenLink: (link: AnswerLink) => void,
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;

  while ((match = INLINE.exec(line)) !== null) {
    if (match.index > last) out.push(<Fragment key={`t${last}`}>{line.slice(last, match.index)}</Fragment>);
    const token = match[0];

    if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const target = token.slice(token.indexOf("](") + 2, -1);
      out.push(
        <RNText
          key={`l${match.index}`}
          accessibilityRole="link"
          style={{ color: colors.accent, textDecorationLine: "underline" }}
          onPress={() => onOpenLink({ label, url: absoluteUrl(target) })}
        >
          {label}
        </RNText>,
      );
    } else if (token.startsWith("**")) {
      out.push(<RNText key={`b${match.index}`} style={{ fontWeight: "700" }}>{token.slice(2, -2)}</RNText>);
    } else if (token.startsWith("*")) {
      out.push(<RNText key={`i${match.index}`} style={{ fontStyle: "italic" }}>{token.slice(1, -1)}</RNText>);
    } else {
      out.push(
        <RNText key={`c${match.index}`} style={{ fontFamily: FONTS.mono, color: colors.inkMuted }}>
          {token.slice(1, -1)}
        </RNText>,
      );
    }
    last = match.index + token.length;
  }
  if (last < line.length) out.push(<Fragment key={`t${last}`}>{line.slice(last)}</Fragment>);
  return out;
}

export function AnswerMarkdown({
  content,
  onOpenLink,
}: {
  content: string;
  onOpenLink?: (link: AnswerLink) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();

  const open = (link: AnswerLink) => {
    if (onOpenLink) onOpenLink(link);
    else void Linking.openURL(link.url);
  };

  const blocks: ReactNode[] = [];
  const lines = content.split("\n");
  let paragraph: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = (key: string) => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ");
    paragraph = [];
    blocks.push(
      <Text key={key} variant="answer" selectable>
        {renderInline(text, colors, open)}
      </Text>,
    );
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();

    if (line.trim().startsWith("```")) {
      if (code) {
        // A code block scrolls sideways rather than wrapping: a wrapped line of
        // code is a different line of code.
        blocks.push(
          <ScrollView
            key={`code${i}`}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{
              backgroundColor: colors.surface,
              borderRadius: metrics.radius.sm,
              borderWidth: 1,
              borderColor: colors.border,
              padding: metrics.space.md,
            }}
          >
            <RNText selectable style={{ fontFamily: FONTS.mono, color: colors.ink, fontSize: 13 }}>
              {code.join("\n")}
            </RNText>
          </ScrollView>,
        );
        code = null;
      } else {
        flushParagraph(`p${i}`);
        code = [];
      }
      return;
    }
    if (code) {
      code.push(raw);
      return;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph(`p${i}`);
      blocks.push(
        <View key={`li${i}`} style={{ flexDirection: "row", gap: metrics.space.sm }}>
          <Text variant="answer" tone="muted">{numbered ? `${numbered[1]}.` : "•"}</Text>
          <Text variant="answer" selectable style={{ flex: 1 }}>
            {renderInline((bullet?.[1] ?? numbered?.[2]) as string, colors, open)}
          </Text>
        </View>,
      );
      return;
    }

    if (line.trim() === "") flushParagraph(`p${i}`);
    else paragraph.push(line.trim());
  });
  flushParagraph("plast");
  // An unterminated fence still has to show its content rather than swallow it.
  if (code) {
    blocks.push(
      <Text key="codetail" variant="answer" selectable>
        {(code as string[]).join("\n")}
      </Text>,
    );
  }

  return <View style={{ gap: metrics.space.sm }} testID="assistant-answer">{blocks}</View>;
}
