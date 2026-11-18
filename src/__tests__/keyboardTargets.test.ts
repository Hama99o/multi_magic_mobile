/**
 * A FORM'S BUTTON STAYS ABOVE THE KEYBOARD (`src/components/keyboardTarget.tsx`).
 *
 * `Button` registers itself. A submit built by hand from a `Pressable` does
 * not, and on 2026-11-18 one such button ("Vérifier et enregistrer" on AI
 * keys) sat under the keyboard. This walks every keyboard-aware screen and
 * fails on a hand-built submit that is not wrapped in <KeyboardTarget>.
 */
import fs from "fs";
import path from "path";

const APP = path.join(__dirname, "../../app");
const SUBMIT = /testID="[a-z0-9-]*-(save|confirm|send|submit|create)"/;

// The account and settings screens. Other apps' forms (notes/edit.tsx has
// two such submits) belong to their own branches; they were reported, not
// changed here.
const SETTINGS = [
  "profile", "security", "change-email", "change-password", "api-keys", "ai-keys",
  "delete-account", "connect-claude", "account", "privacy",
];
const screens = (dir: string) =>
  SETTINGS.map((name) => path.join(dir, `${name}.tsx`)).filter((file) => fs.existsSync(file));

/** Each `<Pressable …>` opening tag in a file. */
function pressables(source: string): string[] {
  const tags: string[] = [];
  let at = source.indexOf("<Pressable");
  while (at !== -1) {
    let depth = 0;
    let end = at;
    for (; end < source.length; end++) {
      const c = source[end];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    tags.push(source.slice(at, end + 1));
    at = source.indexOf("<Pressable", end);
  }
  return tags;
}

/** Directly inside a <KeyboardTarget> (a hook in the screen would sit above
 *  Screen's context and register nothing — measured on the device). */
const wrapped = (source: string, tag: string) =>
  /<KeyboardTarget>\s*$/.test(source.slice(0, source.indexOf(tag)));

it("gives every hand-built submit on a keyboard-aware settings screen a keyboard-target ref", () => {
  const missing = screens(APP).flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");
    if (!/<Screen[^>]*avoidKeyboard/.test(source)) return [];
    return pressables(source)
      .filter((tag) => SUBMIT.test(tag) && !wrapped(source, tag))
      .map((tag) => `${path.relative(APP, file)}: ${tag.match(SUBMIT)?.[0]}`);
  });
  expect(missing).toEqual([]);
});
