/**
 * The pane-nav codemod, case by case (`scripts/codemods/paneNav.js`). Each
 * fixture is a shape that exists in app/ or src/ today; the idempotence test
 * is what lets a later branch re-run it instead of resolving conflicts.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { transform } = require("../paneNav") as { transform: (code: string, file?: string) => { code: string; changed: boolean; skipped: string[] } };

const run = (code: string) => transform(code, "fixture.tsx");

it("a screen: the hook goes first in the component, callbacks keep the same name, the import moves", () => {
  const before = `import { router } from "expo-router";
import { View } from "react-native";

export default function Notes() {
  const open = (id: number) => router.push({ pathname: "/notes/note", params: { id: String(id) } });
  return <View onTouchEnd={() => router.back()} />;
}
`;
  const out = run(before);
  expect(out.code).toBe(`import { useNav } from "@/lib/nav";
import { View } from "react-native";

export default function Notes() {
  const router = useNav();
  const open = (id: number) => router.push({ pathname: "/notes/note", params: { id: String(id) } });
  return <View onTouchEnd={() => router.back()} />;
}
`);
  expect(out.skipped).toEqual([]);
});

it("params: useLocalSearchParams becomes useNavParams, type arguments kept; other specifiers stay", () => {
  const before = `import { router, useLocalSearchParams, useNavigation, type Href } from "expo-router";

export function TableScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const nav = useNavigation();
  return params.id ? null : router.replace("/tables" as Href);
}
`;
  const out = run(before);
  expect(out.code).toBe(`import { useNavigation, type Href } from "expo-router";
import { useNav, useNavParams } from "@/lib/nav";

export function TableScreen() {
  const router = useNav();
  const params = useNavParams<{ id: string }>();
  const nav = useNavigation();
  return params.id ? null : router.replace("/tables" as Href);
}
`);
});

it("a hook and two components in one file each get their own nav; an arrow component with a body too", () => {
  const before = `import { router } from "expo-router";

function useOpen() {
  return () => router.push("/a");
}
const Row = ({ id }: { id: number }) => {
  return <Pressable onPress={() => router.push("/b")} />;
};
export default function List() {
  return <Row id={1} />;
}
`;
  const out = run(before);
  expect(out.code).toContain(`function useOpen() {\n  const router = useNav();\n  return () => router.push("/a");`);
  expect(out.code).toContain(`const Row = ({ id }: { id: number }) => {\n  const router = useNav();\n  return <Pressable`);
  // List never names router: no hook added there.
  expect(out.code).toContain(`export default function List() {\n  return <Row id={1} />;`);
});

it("router used outside a component (a module helper) leaves the file's router alone and says where", () => {
  const before = `import { router, useLocalSearchParams } from "expo-router";

export function openApp(key: string) {
  router.push(key as never);
}
export default function Screen() {
  const p = useLocalSearchParams();
  return router.canGoBack() ? p : null;
}
`;
  const out = run(before);
  expect(out.skipped).toEqual(["fixture.tsx:4: router used outside a component or hook"]);
  // router stays the singleton everywhere in this file (a hand fix), params still move.
  expect(out.code).toContain(`import { router } from "expo-router";\nimport { useNavParams } from "@/lib/nav";`);
  expect(out.code).not.toContain("useNav()");
  expect(out.code).toContain("const p = useNavParams();");
});

it("an expression-bodied arrow component is skipped and named", () => {
  const before = `import { router } from "expo-router";
export const Back = () => <Pressable onPress={() => router.back()} />;
`;
  const out = run(before);
  expect(out.changed).toBe(false);
  expect(out.skipped).toEqual(["fixture.tsx:2: router in an expression-bodied component"]);
});

it("a local named router, a type-only import, and a file without expo-router are left alone", () => {
  expect(run(`const router = makeRouter();\nexport function A() { return router.go(); }\n`).changed).toBe(false);
  expect(run(`import type { router } from "expo-router";\nexport type R = typeof router;\n`).changed).toBe(false);
  expect(run(`import { Link } from "expo-router";\nexport function A() { return <Link href="/" />; }\n`).changed).toBe(false);
});

it("a hook callback that uses router lists it in its dependencies (react-hooks/exhaustive-deps)", () => {
  const before = `import { router } from "expo-router";

export function Sheet({ id }: { id: number }) {
  const open = useCallback(() => router.push("/a"), [id]);
  const close = useCallback(() => router.back(), []);
  useEffect(() => {
    if (id) router.replace("/b");
  }, [id, open]);
  const label = useMemo(() => String(id), [id]);
  return null;
}
`;
  const out = run(before).code;
  expect(out).toContain(`useCallback(() => router.push("/a"), [id, router]);`);
  expect(out).toContain(`useCallback(() => router.back(), [router]);`);
  expect(out).toContain(`}, [id, open, router]);`);
  expect(out).toContain(`useMemo(() => String(id), [id]);`); // no router inside: untouched
  expect(run(out).changed).toBe(false); // and still idempotent
});

it("is idempotent: a second run changes nothing", () => {
  const before = `import { Stack, router, useLocalSearchParams } from "expo-router";

export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Stack.Screen options={{ title: id }} listeners={{ blur: () => router.back() }} />;
}
`;
  const once = run(before);
  expect(once.changed).toBe(true);
  const twice = run(once.code);
  expect(twice.changed).toBe(false);
  expect(twice.code).toBe(once.code);
  expect(once.code).toContain(`import { Stack } from "expo-router";\nimport { useNav, useNavParams } from "@/lib/nav";`);
});
