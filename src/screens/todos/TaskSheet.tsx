/**
 * One task, opened (`docs/design/todos/SPEC.md` §D.4; Todoist 11, Evernote
 * 12, ClickUp 13). The list's name small on top, the check and the title,
 * then one row per property: notes, due date, reminder (only when the server
 * keeps one), priority, and the task's place in the list. Delete sits alone
 * at the bottom.
 *
 * Every change is saved as it is made, through the list's optimistic
 * mutations, so closing the sheet never loses anything and there is no Save
 * button to forget. Text is saved on blur and on close.
 */
import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { TODO_PRIORITIES, type Todo, type TodoInput } from "@/api/todos";
import { AlarmClock, ArrowDown, ArrowUp, Calendar, Flag, NotebookPen, Trash2, X } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { useColors, useMetrics } from "@/hooks/useColors";
import { FILL } from "@/theme/fill";
import { Chip, DueChooser, PropertyRow, ReminderChooser } from "./parts";
import { priorityColor, TodoCheck } from "./TaskRow";

export function TaskSheet({
  todo,
  listName,
  today,
  canMoveUp,
  canMoveDown,
  onUpdate,
  onToggle,
  onMove,
  onDelete,
  onClose,
}: {
  todo: Todo | null;
  listName: string;
  today: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUpdate: (todo: Todo, input: TodoInput) => void;
  onToggle: (todo: Todo) => void;
  onMove?: (todo: Todo, by: number) => void;
  onDelete: (todo: Todo) => void;
  onClose: () => void;
}) {
  if (!todo) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Body
        key={todo.id}
        todo={todo}
        listName={listName}
        today={today}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onUpdate={onUpdate}
        onToggle={onToggle}
        onMove={onMove}
        onDelete={onDelete}
        onClose={onClose}
      />
    </Modal>
  );
}

function Body({
  todo,
  listName,
  today,
  canMoveUp,
  canMoveDown,
  onUpdate,
  onToggle,
  onMove,
  onDelete,
  onClose,
}: Omit<Parameters<typeof TaskSheet>[0], "todo"> & { todo: Todo }) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? "");
  // What was last sent, so a blur then a close do not send the same text twice.
  const sent = useRef({ title: todo.title, notes: todo.notes ?? "" });

  const saveText = () => {
    const nextTitle = title.trim();
    const input: TodoInput = {};
    if (nextTitle && nextTitle !== sent.current.title) input.title = nextTitle;
    if (notes !== sent.current.notes) input.notes = notes.trim() ? notes : null;
    if (Object.keys(input).length === 0) return;
    sent.current = { title: input.title ?? sent.current.title, notes: input.notes === undefined ? sent.current.notes : notes };
    onUpdate(todo, input);
  };
  const close = () => {
    saveText();
    onClose();
  };
  const field = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: metrics.radius.md,
    paddingHorizontal: metrics.space.md,
    color: colors.ink,
    backgroundColor: colors.surface,
    fontSize: 16,
  } as const;

  return (
    <KeyboardPadding>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={close} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View
          testID="todo-sheet"
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            paddingTop: metrics.space.sm,
            paddingBottom: insets.bottom + metrics.space.md,
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
            maxHeight: "92%",
          }}
        >
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: metrics.space.sm }} />
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: metrics.space.lg }}>
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }} testID="todo-sheet-list">
              {listName}
            </Text>
            <Pressable testID="todo-sheet-close" onPress={close} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8} style={{ width: metrics.touch, height: metrics.touch, alignItems: "flex-end", justifyContent: "center" }}>
              <X size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: metrics.space.lg, paddingBottom: metrics.space.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.xs, marginLeft: -10 }}>
              <TodoCheck
                done={todo.completed}
                onPress={() => onToggle(todo)}
                label={todo.completed ? t("todos.markPending", { title: todo.title }) : t("todos.markDone", { title: todo.title })}
                testID="todo-sheet-check"
              />
              <TextInput
                testID="todo-sheet-title"
                value={title}
                onChangeText={setTitle}
                onBlur={saveText}
                onSubmitEditing={saveText}
                returnKeyType="done"
                blurOnSubmit
                multiline
                accessibilityLabel={t("todos.taskTitle")}
                style={{ flex: 1, fontSize: 20, fontWeight: "600", color: colors.ink, paddingVertical: metrics.space.sm, textDecorationLine: todo.completed ? "line-through" : "none" }}
              />
            </View>

            <PropertyRow icon={NotebookPen} title={t("todos.notes")}>
              <TextInput
                testID="todo-sheet-notes"
                value={notes}
                onChangeText={setNotes}
                onBlur={saveText}
                placeholder={t("todos.notesPlaceholder")}
                placeholderTextColor={colors.inkMuted}
                multiline
                accessibilityLabel={t("todos.notes")}
                style={{ ...field, minHeight: 72, paddingTop: metrics.space.sm, textAlignVertical: "top" }}
              />
            </PropertyRow>

            <PropertyRow icon={Calendar} title={t("todos.dueDate")}>
              <DueChooser testID="todo-sheet-due" value={todo.dueDate} today={today} onChange={(dueDate) => onUpdate(todo, { dueDate })} />
            </PropertyRow>

            {todo.remindSupported ? (
              <PropertyRow icon={AlarmClock} title={t("todos.reminder.title")}>
                <ReminderChooser testID="todo-sheet-reminder" value={todo.remindAt} dueDate={todo.dueDate} today={today} onChange={(remindAt) => onUpdate(todo, { remindAt })} />
              </PropertyRow>
            ) : null}

            <PropertyRow icon={Flag} title={t("todos.priority.title")}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
                {TODO_PRIORITIES.map((p) => (
                  <Chip
                    key={p}
                    testID={`todo-sheet-priority-${p}`}
                    label={t(`todos.priority.${p}`)}
                    icon={p === "none" ? undefined : Flag}
                    tint={priorityColor(p, colors.danger) ?? undefined}
                    selected={todo.priority === p}
                    onPress={() => onUpdate(todo, { priority: p })}
                  />
                ))}
              </View>
            </PropertyRow>

            {onMove && (canMoveUp || canMoveDown) ? (
              <View style={{ flexDirection: "row", gap: metrics.space.sm, paddingVertical: metrics.space.sm }}>
                {canMoveUp ? <Chip testID="todo-sheet-up" icon={ArrowUp} label={t("todos.moveUp")} onPress={() => onMove(todo, -1)} /> : null}
                {canMoveDown ? <Chip testID="todo-sheet-down" icon={ArrowDown} label={t("todos.moveDown")} onPress={() => onMove(todo, 1)} /> : null}
              </View>
            ) : null}

            <Pressable
              testID="todo-sheet-delete"
              onPress={() => onDelete(todo)}
              accessibilityRole="button"
              accessibilityLabel={t("todos.deleteTask")}
              style={{
                marginTop: metrics.space.lg,
                minHeight: 48,
                borderRadius: metrics.radius.md,
                borderWidth: 1,
                borderColor: `${colors.danger}66`,
                flexDirection: "row",
                gap: metrics.space.sm,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trash2 size={18} color={colors.danger} />
              <Text variant="label" tone="danger">
                {t("todos.deleteTask")}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </KeyboardPadding>
  );
}
