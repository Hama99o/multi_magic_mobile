/**
 * A save refused because the note moved since the version the phone edited
 * from (`PUT notes/:id` with `expected_updated_at` → 409). Carries the
 * server's current note so the editor can ask which version to keep.
 * Neutral ground: thrown by the API, caught by the editor's saver.
 */
export class StaleNoteError<T extends { title: string; html: string; updatedAt: string } = { title: string; html: string; updatedAt: string }> extends Error {
  readonly current: T;
  constructor(current: T) {
    super("The note changed on the server since it was opened.");
    this.name = "StaleNoteError";
    this.current = current;
  }
}
