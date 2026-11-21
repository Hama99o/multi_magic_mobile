/**
 * EVERY KEY THE APP CALLS RESOLVES — in both languages.
 *
 * i18next's answer to a key it does not have is THE KEY ITSELF, rendered on
 * the screen: a row that should read "12 messages" reads `sessions.messages`.
 * Nothing throws, `tsc` is happy — the key is a string — and a component test
 * that asserts on a testID never looks at the words. So this file walks the
 * source, collects every `t("…")` actually written, and asks the initialised
 * instance for each one.
 *
 * ── It reads the SOURCE rather than a list ───────────────────────────────
 * A written list would agree with itself. This greps the files the app ships,
 * so a key added to a screen tomorrow is checked tomorrow without anybody
 * remembering this file exists.
 *
 * ── And it is the reason a static check is not enough ────────────────────
 * Written after a sibling session's line-based scan of `en.ts` reported 15
 * keys as missing. They were all present; their VALUES sit on the following
 * line, and a parser reading `key: "value"` pairs one line at a time cannot
 * see them. Resolving through i18next is the only check that cannot be fooled
 * by the formatting — and it catches the real thing the scan was looking for.
 */
import fs from "fs";
import path from "path";
import i18n from "..";
import { FAMILY_LABEL_KEYS } from "@/screens/contacts/familyLabel";

const ROOTS = ["app", "src"];
/**
 * `t("…")` and `translate("…")`.
 *
 * `translate` is `import { t as translate }` — the module-level `t`, aliased
 * because these call sites are outside a component and cannot use the hook
 * (`DeleteConfirm.tsx:28`, `sign-up.tsx:38`). The first version of this grep
 * knew only about `t(`, so every key reached through the alias was never
 * resolved by the test below and never counted as called by the one at the
 * foot of the file. `ALIASES` is checked against the source, so a third
 * spelling fails here instead of quietly shrinking what is covered.
 */
const ALIASES = ["translate"];
// All three quote characters, per `docs/TESTING.md` §10 applied to this file:
// the first version matched a double quote only, which is a hypothesis about
// how people write rather than a fact about the code. Nothing in the repo uses
// the other two today and nothing enforces that, which is the whole point —
// the spelling a grep knows is the finding waiting to happen.
const CALL = new RegExp(
  `\\b(?:t|${ALIASES.join("|")})\\(\\s*(["'\`])([a-zA-Z][\\w.]*)\\1`,
  "g",
);
const ALIASED_IMPORT = /\bt\s+as\s+(\w+)/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" || entry.name === "node_modules" ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every `t("…")` written in a shipped file, with where it was written. */
function calledKeys(): Map<string, string> {
  const found = new Map<string, string>();
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(CALL)) {
        if (!found.has(match[2])) found.set(match[2], file);
      }
    }
  }
  return found;
}

/**
 * KEYS WRITTEN AS DATA — `labelKey: "scope.notes"`, `LABEL_KEYS`, and so on —
 * then handed to `t(option.labelKey)`.
 *
 * DEAD INSTRUMENT, found and planted 2026-09-24: these used to come ONLY from
 * the hand list below, so a NEW option was invisible to both checks. A theme
 * option labelled `appearance.doesNotExist` left the whole suite green
 * (77 suites, 869 tests) while the screen would have printed the raw key.
 * Now every string literal shaped like a key, in a namespace the locale
 * really has, is collected from the source, with comments stripped so a
 * filename in a comment (`chat.tsx`) is not mistaken for one.
 */
function literalKeys(namespaces: Set<string>): Map<string, string> {
  const LITERAL = /(["'`])([a-z][A-Za-z]*\.[a-zA-Z][\w.]*)\1/g;
  const found = new Map<string, string>();
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const code = fs
        .readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
      for (const match of code.matchAll(LITERAL)) {
        const key = match[2];
        // A parser's SHAPE LABEL — `str(record.id, "session.id")` names a
        // payload path for an error message, not a translation.
        const before = code.slice(Math.max(0, (match.index ?? 0) - 80), match.index);
        if (/\b(?:str|num|id|obj|arr|optArr|parseId|bool)\((?:[^()]|\([^()]*\))*,\s*$/.test(before)) continue;
        if (namespaces.has(key.split(".")[0]) && !found.has(key)) found.set(key, file);
      }
    }
  }
  return found;
}

/**
 * Keys built from a TEMPLATE at the call site — `t(\`session.${reason}\`)` —
 * the one shape no source scan can read. Everything that used to be here
 * because it sat in a data map is found by `literalKeys` now; keep this list
 * to templates only.
 */
const COMPOSED = [
  // `sessionEndSentence` in auth.store.ts: t(`session.${reason}`), reason is
  // `SessionEndReason` ("expired" | "revoked") in api/http.ts.
  "session.expired",
  "session.revoked",
  // The calendar's enums, rendered as t(`calendar.<group>.${value}`). Each
  // group is the server's own enum (`CalendarApp::Event`, `EventShare`,
  // `Reminder::PRESETS`) or the web's colour keys (`EventDrawer.tsx`).
  ...["event", "appointment", "birthday", "anniversary"].map((v) => `calendar.kind.${v}`),
  ...["none", "daily", "weekly", "monthly", "yearly"].map((v) => `calendar.recurrence.${v}`),
  ...["0", "15", "60", "1440", "10080"].map((v) => `calendar.lead.${v}`),
  ...["blue", "green", "amber", "red", "grey"].map((v) => `calendar.color.${v}`),
  ...["owner", "editor", "viewer"].map((v) => `calendar.permission.${v}`),
  ...["pending", "accepted", "declined"].map((v) => `calendar.response.${v}`),
  // Contacts: t(`contacts.choose.${channel}`) (`useContactActions.tsx`),
  // t(`contacts.family.kinds.${kind}`) over the server's `Relation` kinds,
  // and t(`contacts.labels.${label}`) over a phone/email label — ours, plus
  // the vCard TYPEs the server's reader keeps (`VcardReader::TYPE_LABELS`).
  ...["call", "whatsapp", "sms", "email"].map((v) => `contacts.choose.${v}`),
  // The social kinds only: family ties are worded by `family.ts`, as
  // t(`contacts.family.words.${kind}.${qualifier}.${gender}`) over the table
  // it allows, and t(`contacts.family.qualifiers.${q}`).
  ...["friend", "colleague", "neighbour", "other"].map((v) => `contacts.family.kinds.${v}`),
  ...[
    ...["biological", "step", "adoptive"].flatMap((q) => [`parent.${q}`, `child.${q}`]),
    ...["biological", "step", "half", "adoptive"].map((q) => `sibling.${q}`),
    "spouse.biological",
  ].flatMap((w) => ["male", "female", "neutral"].map((g) => `contacts.family.words.${w}.${g}`)),
  ...["biological", "step", "half", "adoptive"].map((v) => `contacts.family.qualifiers.${v}`),
  // t(`contacts.familyLabels.${key}`) over the server's family words (`familyLabel.ts`).
  ...FAMILY_LABEL_KEYS.map((v) => `contacts.familyLabels.${v}`),
  // The web drawer's enums (`ContactApp::Family`): t(`contacts.genders.${g}`),
  // t(`contacts.closenessLevels.${c}`).
  ...["unknown", "male", "female", "other"].map((v) => `contacts.genders.${v}`),
  ...["unset", "close", "regular", "distant", "estranged"].map((v) => `contacts.closenessLevels.${v}`),
  // The tree's rows by generation (`app/contacts/family.tsx`).
  ...["greatGrandparents", "grandparents", "parents", "same", "children", "grandchildren", "greatGrandchildren"].map((v) => `contacts.tree.rows.${v}`),
  ...["mobile", "home", "work", "other", "main", "fax", "linkedin", "twitter", "instagram", "facebook", "github", "website"].map((v) => `contacts.labels.${v}`),
  // SafeZone: t(`safezone.tabs|empty|emptyTitle.${kind}`) over `SAFEZONE_KINDS`,
  // t(`safezone.field.${key}`) over `ITEM_FIELDS` (`api/safezone.ts`), and the
  // server's enums `SafezoneApp::Identity::TYPES`, `PaymentCard.card_types`.
  ...["passwords", "payment_cards", "identities"].flatMap((v) => [`safezone.tabs.${v}`, `safezone.empty.${v}`, `safezone.emptyTitle.${v}`]),
  // The form (app/safezone/edit.tsx): t(`safezone.form.add|edit.${kind}`) and
  // t(`safezone.form.errors.${why}`) over `FormErrors` (forms.ts).
  ...["passwords", "payment_cards", "identities"].flatMap((v) => [`safezone.form.add.${v}`, `safezone.form.edit.${v}`]),
  ...["required", "email", "date"].map((v) => `safezone.form.errors.${v}`),
  // …and over `FORM_FIELDS` (`screens/safezone/forms.ts`), which adds the title and the card's name.
  ...["title", "name", "username", "email", "password", "link", "note", "card_type", "card_number", "expiry_date", "cvv", "code", "type", "document_number", "issued_at", "expires_at"].map((v) => `safezone.field.${v}`),
  ...["passport", "national_id", "drivers_license", "residence_permit", "other"].map((v) => `safezone.identityTypes.${v}`),
  ...["credit_card", "debit_card"].map((v) => `safezone.cardTypes.${v}`),
  // A note's share roles (`NoteApp::Share` enum): t(`notes.share.roles.${role}`) (ShareSheet.tsx).
  ...["viewer", "contributor", "administrator"].map((v) => `notes.share.roles.${v}`),
  // Todo (app/todos, src/screens/todos): the server's priority and frequency
  // enums (`TodoApp::Todo`, `TodoApp::Template`) and the three due views.
  ...["none", "low", "medium", "high"].map((v) => `todos.priority.${v}`),
  ...["none", "daily", "weekly", "monthly"].map((v) => `todos.frequency.${v}`),
  ...["daily", "weekly", "monthly"].map((v) => `todos.repeatEvery.${v}`),
  ...["today", "upcoming", "overdue"].flatMap((v) => [`todos.views.${v}`, `todos.emptyView.${v}`]),
  // Flow (app/flow, src/screens/flow): t(`flow.roles.${role}`) over FLOW_ROLES,
  // t(`flow.roleHints.${r}`) over ASSIGNABLE_ROLES, t(`flow.sprints.status.${s}`)
  // over SPRINT_STATUSES (api/flow.ts), t(`flow.color.${key}`) over
  // PROJECT_COLORS (screens/flow/logic.ts), t(`flow.move.${where}`).
  ...["owner", "admin", "member", "viewer"].map((v) => `flow.roles.${v}`),
  ...["admin", "member", "viewer"].map((v) => `flow.roleHints.${v}`),
  ...["planning", "active", "completed"].map((v) => `flow.sprints.status.${v}`),
  ...["blue", "green", "red", "yellow", "purple", "pink", "orange"].map((v) => `flow.color.${v}`),
  // The shared field editors (src/components/fields, app/flow/fields.tsx):
  // t(`fields.types.${type}`) over FIELD_TYPES (api/fields.ts) and
  // t(`fields.recordClasses.${key}`) over RECORD_CLASS_KEY.
  ...["text", "rich_text", "integer", "decimal", "boolean", "date", "datetime", "single_select", "multi_select", "single_record", "multi_record", "attachment", "attachments", "long_text", "phone", "email", "url", "created_time", "last_modified_time", "lookup", "rollup"].map((v) => `fields.types.${v}`),
  ...["user", "tag", "card", "sprint", "record"].map((v) => `fields.recordClasses.${v}`),
  // Tables (app/tables): t(`tables.baseSort.${s}`) over BASE_SORTS and
  // t(`tables.viewTypes.${v}`) over VIEW_TYPES (api/tables.ts).
  ...["created_at_desc", "updated_at_desc", "name_asc"].map((v) => `tables.baseSort.${v}`),
  ...["grid", "kanban", "calendar", "gallery"].map((v) => `tables.viewTypes.${v}`),
  // t(`tables.ops.${op}`) over ALL_OPERATORS and t(`tables.sortDir.${set}.${dir}`)
  // over directionSet (screens/tables/filters.ts).
  ...["contains", "not_contains", "is", "is_not", "gt", "gte", "lt", "lte", "empty", "not_empty", "before", "after", "on_or_before", "on_or_after", "any_of", "all_of", "none_of"].map((v) => `tables.ops.${v}`),
  ...["text", "number", "date", "boolean", "option"].flatMap((v) => [`tables.sortDir.${v}.asc`, `tables.sortDir.${v}.desc`]),
  // history.ts: t(lineKey(action)) over HISTORY_ACTIONS, and the roles a share line names.
  ...["row_created", "row_updated", "rows_deleted", "rows_restored", "rows_written", "rows_updated", "column_added", "column_updated", "column_deleted", "column_restored", "columns_reordered", "link_added", "link_removed", "share_added", "share_changed", "share_removed", "view_created", "view_renamed", "view_deleted", "table_renamed", "table_duplicated", "import_done", "import_failed", "import_cancelled"].map((v) => `tables.history.lines.${v}`),
  ...["editor", "viewer"].map((v) => `tables.share.roles.${v}`),
  ...["editor", "viewer"].map((v) => `tables.share.roleHints.${v}`),
  // activity.tsx: the history kinds (HISTORY_KINDS + "all") and the two badged sources.
  ...["all", "rows", "columns", "imports", "links", "sharing", "table"].map((v) => `tables.history.kinds.${v}`),
  ...["assistant", "import"].map((v) => `tables.history.sources.${v}`),
  // A new view's column label and empty note, by type (`ViewsSheet.tsx`).
  ...["kanban", "calendar", "gallery"].flatMap((v) => [`tables.viewsSheet.column.${v}`, `tables.viewsSheet.noColumn.${v}`]),
  // Reordering a card within its column (`table.tsx`, MoveWithin).
  ...["top", "up", "down"].map((v) => `tables.kanban.within.${v}`),
  // Why an import could not read its file (`importFlow.ts` ReadOutcome, `tableImports.ts` PreviewRefusal).
  ...["too_large", "unsupported_type", "unreadable", "empty", "no_sheet", "needs_server", "missing", "other"].map((v) => `tables.import.refused.${v}`),
  // The access modes of a form (`tableForms.ts` ACCESS_MODES): each name and hint.
  ...["public", "signed_in", "only_me", "invited"].flatMap((v) => [`tables.forms.access.${v}`, `tables.form.accessHint.${v}`]),
  // The column editor (`FieldEditorSheet.tsx`): relations, rollup functions, why Save is off.
  ...["one_to_many", "many_to_one", "one_to_one", "many_to_many"].flatMap((v) => [`tables.fieldEditor.relations.${v}.label`, `tables.fieldEditor.relations.${v}.sentence`]),
  ...["count", "sum", "avg", "min", "max"].map((v) => `tables.fieldEditor.functions.${v}`),
  ...["name", "options", "linkTable", "linkColumn", "target"].map((v) => `tables.fieldEditor.blocked.${v}`),
  // A refused comment file (`commentFiles.ts` CommentFileRefusal["why"]), t(`tables.activity.refused.${why}`).
  ...["type", "size", "count"].map((v) => `tables.activity.refused.${v}`),
  // t(`tables.find.${q.key}`) over the date filter's quick days (FilterSortSheet.tsx DateValue).
  ...["yesterday", "today", "tomorrow"].map((v) => `tables.find.${v}`),
  // Finance: the five tabs (app/finance/index.tsx) and the Help sheet's sections (HelpSheet.tsx).
  ...["overview", "expenses", "income", "loans", "budgets"].map((v) => `finance.tabs.${v}`),
  ...["overview", "expenses", "recurring", "income", "loans", "budgets", "reports", "categories"].flatMap((v) => [`finance.help.${v}.title`, `finance.help.${v}.body`]),
];

/** Plurals live as `key_one` / `key_other`; the call site asks for `key`. */
const PLURAL = new Set([
  "fields.more",
  "tables.rowCount",
  "tables.tableCount",
  "tables.find.showCount",
  "tables.bulk.selected",
  "tables.admin.cleared",
  "tables.import.summary",
  "tables.import.wouldRefuse",
  "tables.import.start",
  "tables.forms.answers",
  "tables.form.inviteN",
  "tables.form.inviteTitle",
  "tables.columns.deleteFilled",
  "tables.columns.trashedLine",
  "tables.bulk.editTitle",
  "tables.bulk.hint",
  "tables.bulk.apply",
  "tables.bulk.edited",
  "tables.bulk.deleteTitle",
  "tables.bulk.deleteBody",
  "tables.bulk.deleted",
  "tables.remove.rowsN",
  "tables.remove.columnsN",
  "tables.remove.linksFrom",
  "tables.remove.baseImpact",
  "tables.history.lines.rows_deleted",
  "tables.history.lines.rows_restored",
  "tables.history.lines.rows_updated",
  "doc.file.pages",
  "doc.merge.count",
  "doc.merge.totalPages",
  "doc.pages.count",
  "doc.pages.extract",
  "doc.result.savedFiles",
  "doc.result.savedGallery",
  "doc.sign.placed",
  "doc.text.changes",
  "doc.text.legendEditable",
  "doc.text.legendInvisible",
  "doc.text.legendPicture",
  "doc.text.legendUnreadable",
  "doc.text.saved",
  "doc.text.savedShared",
  "doc.text.savedWithSubstitute",
  "doc.text.someRejected",
  "pages.folderUpload.confirm",
  "shell.chatsWaiting",
  "shell.notificationsUnread",
  "finance.ledger.entries",
  "finance.pending.title",
  "finance.overview.expenseCount",
  "finance.overview.active",
  "finance.loans.activeCount",
  "finance.manage.recurring.count",
  "contacts.myFamily.count",
  "finance.manage.recurring.everyDay",
  "finance.manage.recurring.everyWeek",
  "finance.manage.recurring.everyMonth",
  "finance.manage.recurring.everyYear",
  "finance.manage.recurring.unitDay",
  "finance.manage.recurring.unitWeek",
  "finance.manage.recurring.unitMonth",
  "finance.manage.recurring.unitYear",
  "finance.manage.categories.subCount",
  "finance.manage.categories.deleteBody",
  "todos.overdueCount",
  "todos.more",
  "todos.doneCount",
  "todos.clearBody",
  "todos.deleteListBody",
  "todos.taskCount",
  "todos.templateItemsHint",
  "todos.repeatEvery.daily",
  "todos.repeatEvery.weekly",
  "todos.repeatEvery.monthly",
  "pages.trash.deleteManyTitle",
  "safezone.health.reusedAcross",
  "shareDoor.unreadableTitle",
  "shareDoor.unreadableBody",
  "calendar.eventCount",
  "calendar.detail.age",
  "pages.trash.emptied",
  "sessions.messages",
  "sessions.files",
  "deleteConversation.questionWithFiles",
  "common.unreadable",
  "pages.itemCount",
  "pages.save.summary",
  "pages.save.uploadHere",
  "pages.uploads.active",
  "pages.uploads.bannerFailed",
  "pages.actions.trashedMany",
  "pages.share.linkJoined",
  "pages.share.linkRevokedWithAccess",
  "pages.share.linkRevokeExplain",
  "pages.share.linkRevokeAndRemove",
  "pages.move.titleMany",
  "pages.select.count",
  "notes.grid.selected",
  "notes.grid.deleteTitle",
  "notes.views.foreverTitle",
  "pages.uploads.barItems",
  "pages.download.saved",
  "pages.download.failed",
  "pages.download.skipped",
  "pages.download.savedGallery",
  "contacts.birthdays.inDays",
  "contacts.birthdays.inDaysShort",
  "contacts.detail.age",
  "contacts.import.done",
  "contacts.import.go",
  "contacts.import.pickTitle",
  "contacts.import.resume",
  "contacts.list.exportSelected",
  "contacts.list.searchPlaceholder",
  "contacts.list.selected",
  "contacts.phone.limited",
  "contacts.share.restBody",
  "safezone.pin.wrong",
  "chats.chosen",
  "thread.membersCount",
  "fields.fileCount",
  "flow.board.cardCount",
  "flow.tile.comments",
  "flow.project.cards",
  "flow.project.sprints",
  "flow.project.people",
  "flow.project.deleteBody",
  "flow.comments.tabCount",
  "flow.filter.button",
]);

const CALLED = calledKeys();
const NAMESPACES = new Set(Object.keys(i18n.getResourceBundle("en", "translation")));
const LITERAL = literalKeys(NAMESPACES);
for (const [key, file] of LITERAL) if (!CALLED.has(key)) CALLED.set(key, file);
const ALL = [...new Set([...CALLED.keys(), ...COMPOSED])].sort();

describe("the keys the app actually calls", () => {
  it("found a realistic number of them, so the grep is not silently broken", () => {
    expect(CALLED.size).toBeGreaterThan(200);
  });

  it("knows every name `t` is imported under, so the grep cannot go blind", () => {
    const unknown = new Set<string>();
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        for (const match of fs.readFileSync(file, "utf8").matchAll(ALIASED_IMPORT)) {
          if (!ALIASES.includes(match[1])) unknown.add(`${match[1]} (in ${file})`);
        }
      }
    }
    // Add the alias to ALIASES above — not to this expectation.
    expect([...unknown]).toEqual([]);
  });

  describe.each(["en", "fr"])("in %s", (language) => {
    beforeAll(async () => {
      await i18n.changeLanguage(language);
    });
    afterAll(async () => {
      await i18n.changeLanguage("en");
    });

    it("resolves every one to a sentence rather than to the key", () => {
      const unresolved = ALL.filter((key) => {
        const resolved = PLURAL.has(key) ? i18n.t(key, { count: 2 }) : i18n.t(key);
        return typeof resolved !== "string" || resolved === key || resolved.trim() === "";
      }).map((key) => `${key} (called in ${CALLED.get(key) ?? "a composed call"})`);

      expect(unresolved).toEqual([]);
    });

    it("leaves no interpolation unfilled in a key that takes one", () => {
      const leaky = ALL.filter((key) => {
        const raw = i18n.getResource(language, "translation", key);
        if (typeof raw !== "string" || !raw.includes("{{")) return false;
        // Filled with every placeholder the string names.
        const values = Object.fromEntries(
          [...raw.matchAll(/\{\{(\w+)\}\}/g)].map((m) => [m[1], "x"]),
        );
        return i18n.t(key, values).includes("{{");
      });

      expect(leaky).toEqual([]);
    });
  });
});

describe("the plural keys", () => {
  it.each([...PLURAL])("%s has a form for one and for many", (key) => {
    expect(i18n.t(key, { count: 1 })).not.toBe(key);
    expect(i18n.t(key, { count: 5 })).not.toBe(key);
    expect(i18n.t(key, { count: 1 })).not.toBe(i18n.t(key, { count: 5 }));
  });
});

/**
 * THE OTHER DIRECTION, WHICH NOTHING ASKED UNTIL A KEY WENT UNUSED.
 *
 * Everything above starts from the calls and asks whether the key exists.
 * `calendar.event` was the reverse: written in `en.ts`, written in `fr.ts`,
 * asserted by `locales.test.ts`, listed in `docs/LANGUAGES.md` — and called
 * by nobody, while `EventRow` interpolated its own English template beside
 * it. Three gates agreed the translation was present. None of them asked
 * whether anything wanted it.
 *
 * An unused key is not a broken screen, which is why it can sit for weeks. It
 * is the SIGN of one: a key is written because a string was going somewhere,
 * so a key with no caller means the string went somewhere else, and "somewhere
 * else" is a literal in a component — untranslated by definition.
 *
 * Deliberately no allowlist. A key kept for later is a key nobody can tell
 * from a key that was forgotten.
 */
describe("the keys the app defines", () => {
  /** `{ a: { b: "x" } }` → `a.b`, with plural suffixes folded back to the
   *  name the call site actually writes. */
  function definedKeys(node: unknown, prefix = ""): string[] {
    if (typeof node !== "object" || node === null) return [];
    return Object.entries(node).flatMap(([key, value]) => {
      const dotted = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "string") {
        return [dotted.replace(/_(zero|one|two|few|many|other)$/, "")];
      }
      return definedKeys(value, dotted);
    });
  }

  it("is called by something, every one of them", () => {
    const wanted = new Set(ALL);
    const orphans = [...new Set(definedKeys(i18n.getResourceBundle("en", "translation")))]
      .filter((key) => !wanted.has(key))
      .sort();

    expect(orphans).toEqual([]);
  });
});
