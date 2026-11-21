/**
 * WHERE DOC RESULTS LIVE, AND WHEN THEY GO (review 88, D6, 2026-11-21).
 *
 * Every Doc result (a merged, signed, compressed… PDF) is written under
 * Paths.cache/doc, one folder per result (`resultDir`, src/api/doc.ts). Nothing
 * removed them, so after a sign-out the next account on the same phone still had
 * the previous one's documents on disk. Ending a session deletes the folder.
 *
 * Its own small module, imported by app/_layout.tsx, so the handler is there from
 * launch: registered only when Doc's API loaded, a session that never opened Doc
 * would leave an older run's files behind.
 */
import { Directory, Paths } from "expo-file-system";
import { onSessionEnd } from "./sessionEnd";

export const DOC_CACHE = "doc";

export function forgetDocResults(): void {
  const dir = new Directory(Paths.cache, DOC_CACHE);
  if (dir.exists) dir.delete();
}

onSessionEnd(forgetDocResults);
