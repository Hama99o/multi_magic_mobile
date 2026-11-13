/**
 * What engine B draws for a read-only atom (engineGlue.ts): the exact node
 * the atom carries, drawn by our own read view. Tables, code, legacy markup
 * and images already draw as their card; other blocks draw as text. There is
 * no web link (owner, 2026-11-13).
 *
 * B gives an atom component only its attrs, so colours, strings and the web
 * link come from a context the editor screen provides. Props only otherwise
 * (SPEC §E): no store, API or i18n import.
 */
import React, { createContext, useContext, useMemo } from "react";
import { View } from "react-native";

import { NoteDocument } from "./NoteDocument";
import { RawBlockCard } from "./RawBlockCard";
import type { DocNode, EditorColors, EditorLabels } from "./types";

export interface ReadOnlyAtomContext {
  colors: EditorColors;
  labels: EditorLabels;
  onLinkPress(href: string): void;
}

const Ctx = createContext<ReadOnlyAtomContext | null>(null);
export const ReadOnlyAtomProvider = Ctx.Provider;

const CARD_KINDS = new Set(["codeBlock", "table", "rawBlock", "imageUploader"]);

interface Props {
  attrs: Readonly<Record<string, unknown>>;
}

function parse(payload: unknown): DocNode | null {
  try {
    const node = JSON.parse(String(payload ?? "")) as DocNode;
    return node && typeof node.type === "string" ? node : null;
  } catch {
    return null;
  }
}

export function ReadOnlyAtom({ attrs }: Props) {
  const ctx = useContext(Ctx);
  const node = useMemo(() => parse(attrs.node), [attrs.node]);
  if (!ctx) return null;
  const { colors, labels, onLinkPress } = ctx;
  const kind = String(attrs.kind ?? "");

  if (!node) {
    return (
      <RawBlockCard testID="note-atom-damaged" kind="unknown" title={labels.unknown(kind)} colors={colors} />
    );
  }
  const doc: DocNode = { type: "doc", content: [node] };
  const view = <NoteDocument doc={doc} colors={colors} labels={labels} onLinkPress={onLinkPress} />;
  if (CARD_KINDS.has(node.type)) return <View testID="note-atom">{view}</View>;
  return <View testID="note-atom-locked">{view}</View>;
}
