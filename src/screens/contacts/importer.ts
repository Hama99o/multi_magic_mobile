/**
 * Bulk import, as chunks (`docs/design/contacts/SPEC.md` §C.7).
 *
 * 50 cards a request: the bar moves for real (cards sent / total), one slow
 * request never holds 300 contacts, and a dropped connection loses one chunk,
 * not the import. The server decides what is already there.
 */
import { ImportNotSupported, type ImportResult } from "@/api/contacts";

export const CHUNK = 50;

export const EMPTY_RESULT: ImportResult = { created: 0, skipped: 0, failed: 0, total: 0, skippedNames: [], failedNames: [] };

/** Whole cards from a .vcf, each ending in a line break. */
export function splitCards(text: string): string[] {
  const found = text.replace(/^﻿/, "").match(/BEGIN:VCARD[\s\S]*?END:VCARD[^\S\n]*(?:\r?\n|$)/gi) ?? [];
  return found.map((card) => (/\n$/.test(card) ? card : `${card}\r\n`));
}

export function addResults(a: ImportResult, b: ImportResult): ImportResult {
  return {
    created: a.created + b.created,
    skipped: a.skipped + b.skipped,
    failed: a.failed + b.failed,
    total: a.total + b.total,
    skippedNames: [...a.skippedNames, ...b.skippedNames],
    failedNames: [...a.failedNames, ...b.failedNames],
  };
}

export type ImportOutcome =
  | { status: "done"; sent: number; result: ImportResult }
  | { status: "stopped"; sent: number; result: ImportResult; error: unknown }
  | { status: "unsupported"; sent: number; result: ImportResult };

export async function runImport(
  cards: readonly string[],
  {
    send,
    onProgress,
    from = 0,
    so = EMPTY_RESULT,
  }: {
    send: (vcf: string) => Promise<ImportResult>;
    onProgress: (sent: number, total: number) => void;
    /** Cards already sent by an earlier, stopped run. */
    from?: number;
    so?: ImportResult;
  },
): Promise<ImportOutcome> {
  let result = so;
  let sent = from;
  if (cards.length) onProgress(sent, cards.length);
  while (sent < cards.length) {
    const part = cards.slice(sent, sent + CHUNK);
    try {
      result = addResults(result, await send(part.join("")));
    } catch (error) {
      if (error instanceof ImportNotSupported) return { status: "unsupported", sent, result };
      return { status: "stopped", sent, result, error };
    }
    sent += part.length;
    onProgress(sent, cards.length);
  }
  return { status: "done", sent, result };
}
