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

/**
 * `[label](target)`, `**bold**`, `*italic*`, `` `code` `` — in one pass.
 *
 * Two rules added 2026-09-25, because the model's output is not the app's to
 * choose, and each of these silently changed what an answer SAID:
 * - Bold and italic open and close only against TEXT (CommonMark's flanking
 *   rule). Without it "12 * 3 * 4 = 144" rendered as "12  3  4 = 144", the
 *   multiplication signs gone and the 3 in italics, in an app that answers
 *   questions about money.
 * - A link target may hold one level of balanced parentheses. Without it
 *   `[Foo](https://…/Foo_(bar))` opened `…/Foo_(bar` and left a stray ")".
 *
 * And one more, the same night: bold and italic CONTENTS are parsed again.
 * The assistant sends a file as `**[qa-invoice.pdf](/rails/active_storage/…)**`
 * (captured from the live backend, `liveReplies.json`). The bold alternative
 * matched the whole thing and printed its inside as text, so the reader saw
 * brackets and the full blob URL, nothing was tappable, and TalkBack read the
 * URL aloud. Each call gets its OWN regex: the shared global one carries
 * `lastIndex`, which an inner call would clobber mid-loop.
 */
const INLINE =
  /(\[[^\]]+\]\((?:[^()\s]|\([^()\s]*\))+\))|(\*\*[^*\s](?:[^*]*[^*\s])?\*\*)|(\*[^*\s](?:[^*\n]*[^*\s])?\*)|(`[^`\n]+`)/g;

/** What a screen reader should say for a block: the words the eye sees, not
 *  the markup. The label used to be the raw source, so TalkBack read
 *  "asterisk asterisk Total asterisk asterisk" (found 2026-09-25). */
function spokenText(source: string): string {
  return source.replace(new RegExp(INLINE.source, "g"), (token) => {
    if (token.startsWith("[")) return token.slice(1, token.indexOf("]"));
    if (token.startsWith("**")) return spokenText(token.slice(2, -2));
    if (token.startsWith("*")) return spokenText(token.slice(1, -1));
    return token.slice(1, -1);
  });
}

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
  prefix = "",
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(INLINE.source, "g");

  while ((match = re.exec(line)) !== null) {
    if (match.index > last) out.push(<Fragment key={`${prefix}t${last}`}>{line.slice(last, match.index)}</Fragment>);
    const token = match[0];

    if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const target = token.slice(token.indexOf("](") + 2, -1); // balanced parens kept
      out.push(
        <RNText
          key={`${prefix}l${match.index}`}
          accessibilityRole="link"
          style={{ color: colors.accent, textDecorationLine: "underline" }}
          onPress={() => onOpenLink({ label, url: absoluteUrl(target) })}
        >
          {label}
        </RNText>,
      );
    } else if (token.startsWith("**")) {
      out.push(
        <RNText key={`${prefix}b${match.index}`} style={{ fontWeight: "700" }}>
          {renderInline(token.slice(2, -2), colors, onOpenLink, `${prefix}b${match.index}.`)}
        </RNText>,
      );
    } else if (token.startsWith("*")) {
      out.push(
        <RNText key={`${prefix}i${match.index}`} style={{ fontStyle: "italic" }}>
          {renderInline(token.slice(1, -1), colors, onOpenLink, `${prefix}i${match.index}.`)}
        </RNText>,
      );
    } else {
      out.push(
        <RNText key={`${prefix}c${match.index}`} style={{ fontFamily: FONTS.mono, color: colors.inkMuted }}>
          {token.slice(1, -1)}
        </RNText>,
      );
    }
    last = match.index + token.length;
  }
  if (last < line.length) out.push(<Fragment key={`${prefix}t${last}`}>{line.slice(last)}</Fragment>);
  return out;
}

export function AnswerMarkdown({
  content,
  onOpenLink,
  speaker,
}: {
  content: string;
  onOpenLink?: (link: AnswerLink) => void;
  /**
   * Spoken before the answer, so somebody who cannot see the shape is told who
   * is talking — `MessageRow`'s header says authorship is legible by shape,
   * which is true and is a claim about eyes.
   *
   * It goes on ONE TEXT BLOCK, never on the container. Wrapping the answer in
   * an element with a name would group its children — `docs/ACCESSIBILITY.md`
   * N1 — and every link in an answer would stop being reachable, which is this
   * audit's own finding reintroduced by its own fix. And it skips a block that
   * holds a link, because a label REPLACES what is read: attributing the block
   * a link lives in would bury the link inside a sentence.
   */
  speaker?: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();

  const open = (link: AnswerLink) => {
    if (onOpenLink) onOpenLink(link);
    else void Linking.openURL(link.url);
  };

  const blocks: ReactNode[] = [];
  let attributed = false;
  /** The name, once, on the first block that can carry it without hiding a link. */
  const nameFor = (plain: string): string | undefined => {
    if (!speaker || attributed) return undefined;
    if (/\[[^\]]*\]\([^)]*\)/.test(plain)) return undefined;
    attributed = true;
    return `${speaker}. ${spokenText(plain)}`;
  };
  const lines = content.split("\n");
  let paragraph: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = (key: string) => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ");
    paragraph = [];
    blocks.push(
      <Text key={key} variant="answer" selectable accessibilityLabel={nameFor(text)}>
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
          <Text
            variant="answer"
            selectable
            style={{ flex: 1 }}
            accessibilityLabel={nameFor((bullet?.[1] ?? numbered?.[2]) as string)}
          >
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
