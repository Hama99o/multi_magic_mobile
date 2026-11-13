/**
 * SECURITY.md §8 read structurally: the SafeZone files import no storage,
 * persist nothing, log nothing, and hand nothing to the assistant or the
 * share sheet. Plus the pure display helpers.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { isExpired, maskedTail, rowSubtitle, siteUrl, withoutSecrets } from "../display";

const ROOT = join(__dirname, "../../../..");
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "__tests__") return [];
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}
const SAFEZONE_FILES = [
  ...filesUnder(join(ROOT, "src/screens/safezone")),
  ...filesUnder(join(ROOT, "app/safezone")),
  join(ROOT, "src/api/safezone.ts"),
  join(ROOT, "src/stores/safezoneLock.store.ts"),
];

describe("no storage, no logs, nowhere else", () => {
  it("finds the files it checks", () => {
    expect(SAFEZONE_FILES.length).toBeGreaterThanOrEqual(12);
  });

  it.each(SAFEZONE_FILES.map((f) => [f.replace(ROOT + "/", ""), f]))("%s", (_name, file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/async-storage|expo-secure-store|zustand\/middleware|\bpersist\(/);
    expect(source).not.toMatch(/\bconsole\./);
    expect(source).not.toMatch(/expo-sharing|useAssistantEcho|composer/i);
  });
});

it("an item's secrets never go through React Query (SECURITY.md §8)", () => {
  const item = readFileSync(join(ROOT, "app/safezone/item.tsx"), "utf8");
  expect(item).not.toMatch(/useQuery|useInfiniteQuery|useMutation|queryClient/);
});

describe("display", () => {
  it("masks with the last four at most", () => {
    expect(maskedTail("4242")).toBe("•••• 4242");
    expect(maskedTail(null)).toBe("••••••••");
    expect(rowSubtitle({ kind: "payment_cards", id: 1, name: "V", cardType: null, expiry: null, last4: "4242", updatedAt: null })).toBe("•••• 4242");
    expect(rowSubtitle({ kind: "passwords", id: 1, title: "M", username: null, email: "a@b.test", link: null, weak: null, updatedAt: null })).toBe("a@b.test");
  });

  it("an identity is expired the day after its date", () => {
    const now = new Date(2026, 10, 13, 12);
    expect(isExpired("2026-11-12", now)).toBe(true);
    expect(isExpired("2026-11-13", now)).toBe(false);
    expect(isExpired(null, now)).toBe(false);
  });

  it("a site without a scheme opens over https", () => {
    expect(siteUrl("mail.example.test")).toBe("https://mail.example.test");
    expect(siteUrl("http://x.test")).toBe("http://x.test");
  });

  it("withoutSecrets blanks every secret and keeps the rest", () => {
    const item = withoutSecrets({
      kind: "payment_cards", id: 1, title: "V",
      fields: [{ key: "card_number", value: "4111", secret: true }, { key: "expiry_date", value: "12/29", secret: false }],
    });
    expect(item.fields).toEqual([{ key: "card_number", value: "", secret: true }, { key: "expiry_date", value: "12/29", secret: false }]);
  });
});
