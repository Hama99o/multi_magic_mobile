/**
 * src/vendor/tiptop-schema is a copy of tiptop-editor/schema, the codec that
 * reads and writes notes exactly like the web editor. It is proven there,
 * against the real web editor; here it must stay byte-identical to that
 * proven copy. Edit it in tiptop-editor and re-run
 * `node scripts/vendor-schema.mjs <this repo>/src/vendor/tiptop-schema`.
 */
import { createHash } from "crypto";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const dir = join(__dirname, "..", "vendor", "tiptop-schema");

function files(at: string): string[] {
  return readdirSync(at).flatMap((name) => {
    const path = join(at, name);
    if (statSync(path).isDirectory()) return files(path);
    return name.endsWith(".ts") ? [path] : [];
  });
}

function recorded(): Map<string, string> {
  const md = readFileSync(join(dir, "SOURCE.md"), "utf8");
  return new Map([...md.matchAll(/^\| `([^`]+)` \| `([0-9a-f]{64})` \|$/gm)].map((m) => [m[1], m[2]]));
}

describe("vendored tiptop-editor/schema", () => {
  const hashes = recorded();

  it("records a commit and at least the codec files", () => {
    expect(readFileSync(join(dir, "SOURCE.md"), "utf8")).toMatch(/commit `[0-9a-f]{40}`/);
    expect([...hashes.keys()]).toEqual(expect.arrayContaining(["index.ts", "html/parse.ts", "html/serialize.ts"]));
  });

  it("has exactly the files SOURCE.md lists, each with its recorded sha256", () => {
    const actual = new Map(
      files(dir).map((path) => [relative(dir, path), createHash("sha256").update(readFileSync(path)).digest("hex")]),
    );
    expect([...actual.keys()].sort()).toEqual([...hashes.keys()].sort());
    for (const [file, hash] of hashes) expect({ file, hash: actual.get(file) }).toEqual({ file, hash });
  });
});
