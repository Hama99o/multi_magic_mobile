/**
 * `docs/SESSION_PARITY.md` IS A SET OF CLAIMS ABOUT CODE, SO IT GETS A GATE.
 *
 * 2026-09-21: its API-surface table said mobile had **nothing** for `activate`
 * and had "never got it". Mobile had been calling it since `3088fd2` on
 * 2026-09-20 15:45 — and the file was last committed at 18:47, three hours
 * AFTER the fix. Somebody edited the document and left the row saying the
 * opposite of the code.
 *
 * That row was then read, believed, and written into `docs/SESSION_FEEL.md` as
 * the single most important thing to fix, with "it is one call in
 * `chooseSession`" attached. Acting on it would have added a SECOND `activate`
 * beside the existing one and no gate in this repo would have objected.
 *
 * ── WHY THIS IS A JEST TEST AND NOT A SCRIPT UNDER `qa/` ─────────────────
 * `qa/flow_lint.py` is excellent and nothing runs it: it is in no npm script
 * and no CI job, so it catches things only when somebody remembers. `npm test`
 * is a gate that actually runs (`.github/workflows/ci.yml`). A check against
 * rot belongs in the thing that cannot be forgotten.
 *
 * ── WHAT IT CHECKS, AND WHAT IT DELIBERATELY DOES NOT ────────────────────
 * Only the API-surface table, and only the one question that went wrong: does
 * the STATE column agree with whether the operation exists in this codebase.
 * It does not try to verify prose, line numbers, or the behaviour tables — a
 * gate that tried to read English would fail for reasons nobody could act on.
 */
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const DOC = join(ROOT, "docs", "SESSION_PARITY.md");
/** Every session call this app has lives here. */
const SESSIONS_API = join(ROOT, "src", "api", "ai.ts");

interface Row {
  operation: string;
  backend: string;
  mobile: string;
  state: string;
}

/** The API-surface table: the rows between its header and the next blank line. */
function apiSurfaceRows(): Row[] {
  const lines = readFileSync(DOC, "utf8").split("\n");
  const header = lines.findIndex((l) => l.startsWith("| Operation | Backend |"));
  if (header < 0) throw new Error("SESSION_PARITY.md: the API-surface table is gone");

  const rows: Row[] = [];
  for (let i = header + 2; i < lines.length && lines[i].startsWith("|"); i += 1) {
    const cells = lines[i].split("|").map((c) => c.trim());
    // ['', Operation, Backend, Web, Mobile, State, '']
    rows.push({ operation: cells[1], backend: cells[2], mobile: cells[4], state: cells[5] });
  }
  return rows;
}

/**
 * THE RAILS ACTION IS NOT THE CLIENT METHOD, and assuming it was is the first
 * thing that went wrong here: `sessions#index` is `sessionsApi.list`, so a
 * naive `sessions#(\w+)` reports every healthy row as broken. Only the names
 * that genuinely differ are mapped; the rest match.
 */
const CLIENT_NAME: Record<string, string> = { index: "list", show: "get" };

/** The backend action a row is about, as the mobile client would spell it. */
function actionOf(row: Row): string | null {
  const match = /`[a-z_]+#([a-z_]+)`/.exec(row.backend);
  if (!match) return null;
  return CLIENT_NAME[match[1]] ?? match[1];
}

/**
 * The method a row CLAIMS mobile has — `sessionsApi.activate` → `activate`,
 * `.create` → `create`. Preferred over the backend action wherever the row
 * names one, because it is the claim being checked.
 */
function claimedOf(row: Row): string | null {
  const match = /`(?:sessionsApi)?\.([a-zA-Z]+)`/.exec(row.mobile);
  return match ? match[1] : null;
}

const api = readFileSync(SESSIONS_API, "utf8");

/** Does `sessionsApi` expose this operation? */
function mobileHas(action: string): boolean {
  return new RegExp(`^\\s*${action}:\\s*async`, "m").test(api);
}

describe("docs/SESSION_PARITY.md, checked against the code it describes", () => {
  const rows = apiSurfaceRows();

  it("still has a table to check", () => {
    expect(rows.length).toBeGreaterThan(3);
  });

  /**
   * THE ONE THAT WOULD HAVE CAUGHT IT. A row saying mobile never got an
   * operation, while `sessionsApi` exposes it, is a document describing an app
   * that no longer exists.
   */
  it("claims nothing is missing that is in fact present", () => {
    const wrong = rows
      .filter((r) => /never got it|nothing/i.test(r.state))
      .map(actionOf)
      .filter((a): a is string => a !== null)
      .filter(mobileHas);

    expect(wrong).toEqual([]);
  });

  /** And the other way: a row claiming parity that names an absent call. */
  it("claims nothing is present that is in fact missing", () => {
    const wrong = rows
      .filter((r) => /has it/i.test(r.state))
      .filter((r) => {
        // The row's OWN claim first, then the action it is about. Rows naming
        // neither — `documents (nested)`, and the `update` row that names two
        // calls at once — are not checkable this way, and a gate that guessed
        // at them would fail for reasons nobody could act on.
        const name = claimedOf(r) ?? actionOf(r);
        if (!name || !/`/.test(r.mobile)) return false;
        return !mobileHas(name);
      })
      .map((r) => r.operation);

    expect(wrong).toEqual([]);
  });
});
