/**
 * Notes screens read and write the server ONLY through api/queries.ts (owner,
 * 2026-11-13: "use the query style well so it doesn't get hard"). A direct
 * notesApi call, a hand-written key or a fresh useQuery in a screen is how the
 * cache and the screen drift apart again.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../../../..");
const FILES = [
  ...fs.readdirSync(path.join(ROOT, "app/notes")).map((f) => `app/notes/${f}`),
  ...["labels.tsx", "ReminderSheet.tsx", "NoteColorPicker.tsx"].map((f) => `src/screens/notes/${f}`),
];

describe("notes data layer", () => {
  it.each(FILES)("%s goes through api/queries.ts", (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    expect(src).not.toMatch(/\bnotesApi\b|\bnoteTagsApi\b/);
    expect(src).not.toMatch(/queryKey:\s*\[/);
    expect(src).not.toMatch(/\buse(Infinite)?Query\(\{/);
    expect(src).not.toMatch(/invalidateQueries\(\{\s*queryKey:\s*\["notes"\]/);
  });
});
