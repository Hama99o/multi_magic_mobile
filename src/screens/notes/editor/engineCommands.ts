/**
 * A toolbar command (toolbarModel.ts) → engine B's editor calls
 * (RichTextEditorRef). Commands that need the screen (a sheet, a picker, a
 * structural change through our document model) come back as "screen":
 * link, image, code block, opening a panel.
 */
import { ENGINE_COLOR_MARK } from "./engineGlue";
import type { Command, TableOp } from "./toolbarModel";

/** The engine's table commands we send (B TableCommand). */
export type TableCommand =
  | { type: "insertTable"; rows: number; columns: number; withHeaderRow: boolean }
  | { type: "addTableRow" | "addTableColumn"; side: "before" | "after" }
  | { type: "toggleTableHeader"; target: "row" | "column" }
  | { type: "mergeTableCells" | "splitTableCell" | "deleteTableRows" | "deleteTableColumns" | "deleteTable" };

const TABLE: Record<TableOp, TableCommand> = {
  addRowBefore: { type: "addTableRow", side: "before" },
  addRowAfter: { type: "addTableRow", side: "after" },
  addColumnBefore: { type: "addTableColumn", side: "before" },
  addColumnAfter: { type: "addTableColumn", side: "after" },
  toggleHeaderRow: { type: "toggleTableHeader", target: "row" },
  toggleHeaderColumn: { type: "toggleTableHeader", target: "column" },
  mergeCells: { type: "mergeTableCells" },
  splitCell: { type: "splitTableCell" },
  deleteRow: { type: "deleteTableRows" },
  deleteColumn: { type: "deleteTableColumns" },
  deleteTable: { type: "deleteTable" },
};

/** The part of B's RichTextEditorRef the toolbar drives. */
export interface EngineRef {
  toggleMark(mark: string): void;
  setMark(mark: string, attrs: Record<string, unknown>): void;
  unsetMark(mark: string): void;
  setLink(href: string): void;
  unsetLink(): void;
  toggleHeading(level: 1 | 2 | 3): void;
  toggleBlockquote(): void;
  toggleList(list: string): void;
  setTextAlign(align: "left" | "center" | "right" | "justify"): void;
  indentListItem(): void;
  outdentListItem(): void;
  insertNode(type: string): void;
  insertText(text: string): void;
  undo(): void;
  redo(): void;
  blur(): void;
  runTableCommand(command: TableCommand): Promise<void>;
}

export interface CommandContext {
  nodes: Record<string, boolean>;
  headingLevel?: number;
}

const LEVEL = { h1: 1, h2: 2, h3: 3 } as const;

export function runCommand(ref: EngineRef, command: Command, ctx: CommandContext): "done" | "screen" {
  switch (command.kind) {
    case "mark":
      ref.toggleMark(command.mark);
      return "done";
    case "color": {
      const mark = command.which === "text" ? ENGINE_COLOR_MARK : "highlight";
      if (command.value === null) ref.unsetMark(mark);
      else ref.setMark(mark, { color: command.value });
      return "done";
    }
    case "align":
      ref.setTextAlign(command.value);
      return "done";
    case "list":
      ref.toggleList(command.value);
      return "done";
    case "block":
      switch (command.value) {
        case "h1":
        case "h2":
        case "h3":
          ref.toggleHeading(LEVEL[command.value]);
          return "done";
        case "blockquote":
          ref.toggleBlockquote();
          return "done";
        case "paragraph":
          // Back to a plain paragraph: undo what the caret is in.
          if (ctx.nodes.codeBlock) return "screen";
          if (ctx.nodes.heading) ref.toggleHeading(((ctx.headingLevel ?? 1) as 1 | 2 | 3));
          else if (ctx.nodes.blockquote) ref.toggleBlockquote();
          return "done";
        case "codeBlock":
          return "screen"; // B has no code-block toggle: the screen converts through model.ts
      }
      return "done";
    case "insert":
      if (command.value === "horizontalRule") {
        ref.insertNode("horizontalRule");
        return "done";
      }
      if (command.value === "table") {
        // The web's slash command: insertTable({ rows: 3, cols: 3, withHeaderRow: true }).
        void ref.runTableCommand({ type: "insertTable", rows: 3, columns: 3, withHeaderRow: true });
        return "done";
      }
      return "screen";
    case "table":
      void ref.runTableCommand(TABLE[command.op]);
      return "done";
    case "indent":
      // In code, an indent is text (soft keyboards have no Tab key).
      if (ctx.nodes.codeBlock) ref.insertText("  ");
      else ref.indentListItem();
      return "done";
    case "outdent":
      if (!ctx.nodes.codeBlock) ref.outdentListItem();
      return "done";
    case "undo":
      ref.undo();
      return "done";
    case "redo":
      ref.redo();
      return "done";
    case "hideKeyboard":
      ref.blur();
      return "done";
    case "link":
    case "panel":
    case "sheet":
      return "screen";
    case "none":
      return "done";
  }
}
