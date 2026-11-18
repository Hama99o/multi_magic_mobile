/**
 * The owner calls this app his task app: "Tasks" in English, "Tâches" in
 * French, wherever a user sees the app's name (Home tile, header, the chat's
 * "Search in" list). The web names it "My Tasks" / "Mes Tâches"; mobile drops
 * the "My" on every tile. Code names and routes stay `todos`.
 *
 * The notes editor's "To-do list" block is a different thing (a checklist
 * inside a note) and keeps its name.
 */
import { en } from "../locales/en";
import { fr } from "../locales/fr";

function strings(node: unknown, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  if (node && typeof node === "object")
    return Object.entries(node).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

describe("the task app's name", () => {
  it("is Tasks / Tâches on the tile, the header and the chat scope", () => {
    expect(en.todos.title).toBe("Tasks");
    expect(fr.todos.title).toBe("Tâches");
    expect(en.scope.todos).toBe("Tasks");
    expect(fr.scope.todos).toBe("Tâches");
  });

  it("no English string calls the app Todo or To-dos", () => {
    const offenders = strings(en)
      .filter(([path]) => !path.endsWith(".taskList"))
      .filter(([, value]) => /\bto-?dos?\b/i.test(value));
    expect(offenders).toEqual([]);
  });
});
