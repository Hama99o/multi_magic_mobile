/**
 * Note drafts on disk: one JSON file per note under documents/note-drafts.
 * Files, not AsyncStorage: no row-size cap (see noteDrafts.store.ts).
 */
import { Directory, File, Paths } from "expo-file-system";
import { createNoteDrafts, type DraftStorage, type NoteDrafts } from "./noteDrafts.store";

function root(): Directory {
  const dir = new Directory(Paths.document, "note-drafts");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const fileFor = (key: string) => new File(root(), `${key.replace(/[^0-9a-z-]/gi, "_")}.json`);

export const fileDraftStorage: DraftStorage = {
  read: async (key) => {
    const f = fileFor(key);
    return f.exists ? f.text() : null;
  },
  write: async (key, value) => {
    const f = fileFor(key);
    if (!f.exists) f.create();
    f.write(value);
  },
  remove: async (key) => {
    const f = fileFor(key);
    if (f.exists) f.delete();
  },
};

export const noteDrafts: NoteDrafts = createNoteDrafts(fileDraftStorage);
