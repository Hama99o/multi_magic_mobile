#!/usr/bin/env node
/**
 * REFUSE A RELEASE BUILD FROM A TREE THAT CANNOT MAKE ONE (2026-09-25).
 *
 * Run by EAS on its build worker as the `eas-build-pre-install` script in
 * package.json, "executed before EAS Build runs npm install"
 * (docs.expo.dev/build-reference/npm-hooks, read 2026-09-25). So a cloud
 * build from the wrong branch should stop in its first minute with a
 * sentence, instead of producing a binary that installs and then fails.
 *
 * UNVERIFIED: that page does not say a non-zero exit FAILS the build. It is
 * what the exit code is for, and it has not been seen here. So it is not
 * relied on alone: `scripts/eas-build.sh` runs this same guard on this
 * machine before any upload, under `set -e`, and the documented build
 * commands go through it. That layer is certain; this one is a second.
 * Verified locally: it refuses main (exit 1, naming both problems) and
 * passes sdk-57's package.json (exit 0).
 *
 * Why it exists: `main` is SDK 54 and lacks `expo-asset`, which `expo-audio`
 * requires as a direct dependency ("Your app may crash outside of Expo Go",
 * expo-doctor). The release branch is `sdk-57`, which has both. Adding the
 * package to `main` would be churn that collides with the merge. The harm is
 * somebody building from `main` by accident, so this refuses by name. It is
 * the rig's pattern: name what was found, and refuse rather than infer
 * (qa/QA_HANDBOOK.md, "The rig drives something other than it claims").
 *
 * It keeps its value after the merge: the day the dependency goes missing
 * again, a build says so instead of shipping it.
 *
 *   node scripts/release_guard.js [path/to/package.json]
 */
const fs = require("fs");
const path = require("path");

const pkgPath = process.argv[2] || path.join(__dirname, "..", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const deps = { ...pkg.dependencies };

const MIN_SDK = 57;
// Native modules a release needs INSTALLED DIRECTLY, each with the reason.
const REQUIRED = {
  "expo-asset": "expo-audio requires it as a direct dependency; without it the app may crash outside Expo Go",
};

const problems = [];
const expoVersion = String(deps.expo || "");
const major = Number((expoVersion.match(/\d+/) || [])[0]);
if (!(major >= MIN_SDK)) {
  problems.push(`expo is "${expoVersion || "absent"}", SDK ${MIN_SDK}+ is the release SDK`);
}
for (const [name, why] of Object.entries(REQUIRED)) {
  if (!deps[name]) problems.push(`${name} is not a dependency: ${why}`);
}

if (problems.length) {
  console.error("REFUSED: this tree cannot make a release build.");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("Build from the `sdk-57` branch (or from main after it is merged). docs/RELEASE_WALK.md, finding 4.");
  process.exit(1);
}
console.log(`release guard: expo ${expoVersion}, ${Object.keys(REQUIRED).join(", ")} present`);
