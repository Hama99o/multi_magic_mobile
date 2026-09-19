/**
 * The smallest markdown renderer that renders THIS document, and no more.
 *
 * ── WHY NOT A LIBRARY ─────────────────────────────────────────────────────
 * `src/api/parse.ts` states the rule this follows: "adding a dependency is a
 * decision to surface rather than take quietly, and these guards are a few
 * lines." A markdown library is 30–60 kB to render nine headings, some bold and
 * some paragraphs from one file we control.
 *
 * ── THE PART THAT MAKES A SUBSET SAFE ─────────────────────────────────────
 * A renderer that silently drops what it does not understand is how a privacy
 * policy loses a sentence. So the subset is not a hope — it is asserted:
 * `src/content/__tests__/privacy.test.ts` parses the published text and FAILS
 * if it contains a construct this file cannot draw. Adding a table to the
 * policy breaks a test rather than quietly rendering nothing.
 *
 * SUPPORTED: `#` `##` `###` headings · paragraphs · `- ` bullets · `---` rules
 * · `**bold**` · `*italic*`.
 * NOT SUPPORTED, deliberately: links, images, tables, code fences, blockquotes,
 * numbered lists, nested lists.
 */
import { Fragment } from "react";
import { View } from "react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "rule" };

/** Everything this renderer cannot draw. Exported so the test asserts on the
 *  same list the renderer is built from, rather than a copy of it. */
export const UNSUPPORTED = [
  { name: "link", pattern: /\[[^\]]*\]\([^)]*\)/ },
  { name: "image", pattern: /!\[[^\]]*\]/ },
  { name: "table", pattern: /^\|/m },
  { name: "code fence", pattern: /^```/m },
  { name: "blockquote", pattern: /^>\s/m },
  { name: "numbered list", pattern: /^\d+\.\s/m },
  { name: "nested list", pattern: /^\s+[-*]\s/m },
  { name: "heading deeper than ###", pattern: /^#{4,}\s/m },
] as const;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  // Paragraphs are separated by a blank line; a heading, a bullet or a rule is
  // its own block even without one around it.
  for (const chunk of source.split(/\n{2,}/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    if (/^---+$/.test(trimmed)) {
      blocks.push({ kind: "rule" });
      continue;
    }

    /**
     * A paragraph may only absorb lines from ITS OWN chunk.
     *
     * Without this the check below found the last block globally, so two
     * paragraphs separated by a blank line merged into one — the words all
     * survived, which is why a word-count test passed while the page rendered
     * as a wall. The paragraph break IS the content here.
     */
    let openParagraph = false;

    for (const line of trimmed.split("\n")) {
      const heading = /^(#{1,3})\s+(.*)$/.exec(line);
      if (heading) {
        blocks.push({
          kind: "heading",
          level: heading[1].length as 1 | 2 | 3,
          text: heading[2].trim(),
        });
        openParagraph = false;
        continue;
      }
      const bullet = /^-\s+(.*)$/.exec(line);
      if (bullet) {
        blocks.push({ kind: "bullet", text: bullet[1].trim() });
        openParagraph = false;
        continue;
      }
      // Not a heading, a bullet or a rule: part of the paragraph being built.
      // Source lines are hard-wrapped at ~80 columns, so they are JOINED rather
      // than kept — a phone rewraps, and honouring the file's wrap would give a
      // ragged column at every width.
      const last = blocks[blocks.length - 1];
      if (openParagraph && last?.kind === "paragraph") last.text += ` ${line.trim()}`;
      else {
        blocks.push({ kind: "paragraph", text: line.trim() });
        openParagraph = true;
      }
    }
  }
  return blocks;
}

type Span = { text: string; bold?: boolean; italic?: boolean };

/** `**bold**` first, then `*italic*` — the other order makes `**x**` two empty
 *  italics around a bold-less `x`. */
export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  for (const boldPart of text.split(/(\*\*[^*]+\*\*)/g)) {
    if (!boldPart) continue;
    if (boldPart.startsWith("**") && boldPart.endsWith("**")) {
      spans.push({ text: boldPart.slice(2, -2), bold: true });
      continue;
    }
    for (const part of boldPart.split(/(\*[^*]+\*)/g)) {
      if (!part) continue;
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        spans.push({ text: part.slice(1, -1), italic: true });
      } else {
        spans.push({ text: part });
      }
    }
  }
  return spans;
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((span, index) => (
        <Text
          key={index}
          style={{
            fontWeight: span.bold ? "700" : "400",
            fontStyle: span.italic ? "italic" : "normal",
          }}
        >
          {span.text}
        </Text>
      ))}
    </>
  );
}

export function Markdown({ source }: { source: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const blocks = parseMarkdown(source);

  return (
    <View>
      {blocks.map((block, index) => (
        <Fragment key={index}>
          {block.kind === "rule" ? (
            <View
              style={{
                height: 1,
                backgroundColor: colors.border,
                marginVertical: metrics.space.lg,
              }}
            />
          ) : block.kind === "heading" ? (
            <Text
              variant={block.level === 1 ? "title" : "label"}
              // Swipe-by-heading is how a screen reader reads a long document,
              // and the privacy policy is the only long document here — a store
              // requirement. Size alone is a heading to an eye and to nothing else.
              accessibilityRole="header"
              style={{
                fontSize: block.level === 1 ? 24 : block.level === 2 ? 18 : 16,
                lineHeight: block.level === 1 ? 30 : 24,
                // Space above a heading and not below it, so a heading sits with
                // the text it introduces rather than floating between two.
                marginTop: index === 0 ? 0 : metrics.space.xl,
                marginBottom: metrics.space.xs,
              }}
            >
              {block.text}
            </Text>
          ) : block.kind === "bullet" ? (
            <View style={{ flexDirection: "row", gap: metrics.space.sm, marginTop: metrics.space.sm }}>
              <Text tone="muted">•</Text>
              <Text selectable style={{ flex: 1 }}>
                <Inline text={block.text} />
              </Text>
            </View>
          ) : (
            <Text selectable style={{ marginTop: metrics.space.md, lineHeight: 24 }}>
              <Inline text={block.text} />
            </Text>
          )}
        </Fragment>
      ))}
    </View>
  );
}
