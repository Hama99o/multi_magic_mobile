/**
 * The page editor's toolbar rule (parity #50, `app/pages/edit.tsx`).
 */
import type { Command } from "@/screens/notes/editor/toolbarModel";

/** The keys whose flows live only in the note screen for now: shown, not offered. */
export function unsupported(command: Command): boolean {
  return (
    command.kind === "link" ||
    command.kind === "sheet" ||
    (command.kind === "insert" && command.value === "image") ||
    (command.kind === "block" && command.value === "codeBlock") ||
    (command.kind === "panel" && command.panel === "codeLanguage")
  );
}
