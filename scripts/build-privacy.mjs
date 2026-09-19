/**
 * Turn `docs/PRIVACY.draft.md` into a module the app can render.
 *
 * ── WHY GENERATE RATHER THAN IMPORT ───────────────────────────────────────
 * Metro does not resolve `.md` without adding it to `assetExts`, and
 * `metro.config.js` is shared infrastructure that two sessions edit at their
 * peril. A generated `.ts` file needs no bundler configuration at all, and the
 * drift it risks is closed by `src/content/__tests__/privacy.test.ts`, which
 * fails if the generated text no longer equals the source.
 *
 * ── WHY IT STRIPS THE NOTES SECTION RATHER THAN THE FILE DOING SO ─────────
 * `### Notes for Hamma9900, not for the published page` is the record of two
 * FALSE sentences that the multi_magic session caught in the first draft — the
 * one naming DeepSeek when the traffic goes to Google, and the one calling the
 * device identifier "random, not derived from you, your hardware or your
 * behaviour" when it was canvas-derived. That record is why the page can be
 * believed, so it belongs in the repo permanently. It just must not ship.
 *
 * Run: node scripts/build-privacy.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "docs/PRIVACY.draft.md");
const OUT = join(root, "src/content/privacy.generated.ts");

/**
 * THE SOURCE OF TRUTH IS THE BACKEND'S COPY, and this is where the phone's
 * copy is held to it.
 *
 * `multi_magic@46092f8` publishes the policy at `GET /api/v1/legal/privacy`,
 * because both stores require a URL a reviewer can open without an account and
 * only the web can serve one. The phone still BUNDLES the text — its screen has
 * to work with no network and must never show a reviewer a 404 — so there are
 * two renderings of one document.
 *
 * Two renderings of one file is fine. Two DOCUMENTS would not be: a policy that
 * disagrees with itself between a phone and a website is the one place where
 * that is not cosmetic. So when the backend is checked out beside this repo,
 * the build refuses to generate from a copy that has drifted from it.
 *
 * On a machine that has only this repo — CI, or anybody's laptop — the check
 * cannot run, and it says so rather than passing quietly. The sha below is the
 * other half: it is the same twelve characters `Legal::Policy.sha` computes, so
 * the two copies can be compared wherever both are reachable.
 */
const BACKEND_SOURCE = join(root, "..", "multi_magic", "docs/PRIVACY.draft.md");

/** The heading that starts everything the published page must not contain. */
export const NOTES_HEADING = "### Notes for Hamma9900, not for the published page";

/**
 * The published page: everything between the front matter and the notes.
 *
 * **Both ends are cut, and the guard below is what found the first one.** The
 * document's title is *"Privacy — DRAFT, needs Hamma9900's approval before it
 * ships"* and the two paragraphs under it are addressed to him — "Approve,
 * correct, or strike any line". That is front matter for a reviewer, not the
 * opening of a privacy policy, and it named him on the page it was meant to
 * keep him off.
 *
 * So the page starts at the first `---`, which is where the document itself
 * stops talking to its reviewer and starts talking to a user. The screen
 * supplies its own title and, while this is a draft, its own banner.
 */
export function publishedPart(markdown) {
  const end = markdown.indexOf(NOTES_HEADING);
  const body = end === -1 ? markdown : markdown.slice(0, end);

  // The first horizontal rule ends the front matter. If the document ever loses
  // it, publish from the top rather than publishing nothing — and the guard in
  // `main` still refuses anything with his name in it.
  const frontMatter = body.match(/^---\s*$/m);
  const start = frontMatter ? (frontMatter.index ?? 0) + frontMatter[0].length : 0;

  return body.slice(start).replace(/\n+---\s*$/, "").trim() + "\n";
}

/**
 * Whether the text is still awaiting his approval.
 *
 * Read from the document rather than hardcoded, so the banner cannot outlive
 * the draft: renaming the file to `PRIVACY.md` and dropping the DRAFT line is
 * what turns the banner off, and nothing else has to be remembered.
 */
export function isDraft(markdown) {
  return /^#\s.*\bDRAFT\b/m.test(markdown);
}

/** The twelve characters `Legal::Policy.sha` computes from the same text.
 *  Verified equal on 2026-09-19: both sides say `852ca75a38c3`. */
export function shaOf(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

function main() {
  const source = readFileSync(SOURCE, "utf8");

  if (existsSync(BACKEND_SOURCE)) {
    if (readFileSync(BACKEND_SOURCE, "utf8") !== source) {
      throw new Error(
        "build-privacy: docs/PRIVACY.draft.md differs from multi_magic's copy, " +
          "which is the source of truth. Copy it across before generating — " +
          "a phone and a website must not carry different privacy policies.",
      );
    }
  } else {
    console.log("build-privacy: multi_magic is not checked out beside this repo, so the");
    console.log("               phone's copy could NOT be checked against the source.");
  }

  const text = publishedPart(source);

  if (text.includes("Hamma9900")) {
    // A name in the published text means the strip missed something. Fail loudly
    // rather than shipping a page with an internal note in it.
    throw new Error("build-privacy: the published text still names Hamma9900 — check the strip");
  }

  writeFileSync(
    OUT,
    `/**
 * GENERATED by scripts/build-privacy.mjs from docs/PRIVACY.draft.md.
 * Do not edit. Edit the markdown and re-run the script.
 *
 * The "Notes for Hamma9900" section is stripped here and stays in the source —
 * see the script's header for why that record must survive in the repo.
 */

/** True while the text still says DRAFT. Drives the banner on \`app/privacy.tsx\`. */
export const PRIVACY_IS_DRAFT = ${isDraft(source)};

/**
 * The same twelve characters \`Legal::Policy.sha\` computes on the backend, which
 * publishes this document at \`GET /api/v1/legal/privacy\`. It is how a bundled
 * copy and a served one can be shown to be the same document.
 */
export const PRIVACY_SHA = ${JSON.stringify(shaOf(text))};

export const PRIVACY_TEXT = ${JSON.stringify(text)};
`,
    "utf8",
  );

  console.log(`build-privacy: ${text.split("\n").length} lines -> src/content/privacy.generated.ts`);
}

// Importable by the test, runnable by hand.
if (process.argv[1] && process.argv[1].endsWith("build-privacy.mjs")) main();
