/**
 * @mentions in a comment (the web's `CommentsFeed.tsx:176-198`): typing "@"
 * offers the base's people; picking one writes "@Name " and remembers who.
 * Only people still named in the text when it is sent are mentioned (a name
 * picked then deleted rings nobody's bell).
 */

/** The text after the last "@" while it is still being typed (no space yet), or null. */
export function mentionQuery(text: string): string | null {
  const m = text.match(/(?:^|\s)@([^\s@]*)$/);
  return m ? m[1] : null;
}

/** Replaces the "@partial" being typed with "@Name ". */
export function addMention(text: string, name: string): string {
  return text.replace(/(^|\s)@([^\s@]*)$/, `$1@${name} `);
}

/** The ids of the picked people whose "@Name" is still in the text. */
export function mentionsIn(text: string, picked: { id: number; name: string }[]): number[] {
  return picked.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id);
}
