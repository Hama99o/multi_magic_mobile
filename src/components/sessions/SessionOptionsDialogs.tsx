/**
 * The two per-chat settings the server already supports and nothing rendered.
 *
 * ── Standing instructions ─────────────────────────────────────────────────
 * `conversations.ai_instructions` — free text written once per chat: what it is
 * about, how to answer in it ("this chat is about my flat renovation, answer in
 * French"). It goes into the stable half of the system prompt, after the base
 * rules rather than instead of them, capped at 2000 characters so it cannot
 * crowd out the retrieved data.
 *
 * **Sent with `params.key?`, not presence** — `instructions: ''` has to mean
 * "clear them", and a presence check would swallow it. So an emptied field is
 * still sent.
 *
 * ── Search scope ──────────────────────────────────────────────────────────
 * `conversations.ai_search_scope` — which apps this chat searches. **Nothing
 * selected means ALL of them**, which is the default and what every chat keeps
 * until told otherwise; it does not mean "search nothing". Files attached to
 * the chat are never scoped out, because the user put them there for this
 * conversation.
 *
 * The keys are `Ai::AppScope::APPS`', which are also `Ai::AppCatalog`'s and the
 * web's `lib/apps.ts` — the same word means the same thing everywhere, and a
 * key this app invented would simply be dropped server-side.
 */
import { useState } from "react";
import {
  KeyboardAvoidingView, Modal, Pressable, ScrollView, TextInput, View,
} from "react-native";
import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";

/** `Ai::Sessions::INSTRUCTIONS_LIMIT` — enforced here so the field trims rather
 *  than the server rejecting a round trip. */
const INSTRUCTIONS_LIMIT = 2000;

/** `Ai::AppScope::APPS` — do not invent keys; unknown ones are dropped. */
export const SCOPE_APPS = [
  { key: "notes", labelKey: "scope.notes" },
  { key: "page_app", labelKey: "scope.pages" },
  { key: "contacts", labelKey: "scope.contacts" },
  { key: "todos", labelKey: "scope.todos" },
  { key: "finance", labelKey: "scope.money" },
  { key: "flow", labelKey: "scope.flow" },
  { key: "calendar", labelKey: "scope.calendar" },
] as const;

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* `padding` on BOTH platforms — see ScreenContainer's header. A Modal
          is its own window, so it is not resized under edge-to-edge either,
          and the measurement makes the padding 0 wherever the window IS
          resized. RenameDialog autofocuses, so on a short phone the field
          would be under the keyboard from the moment it opens. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            alignItems: "center",
            justifyContent: "center",
            padding: metrics.space.lg,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: colors.ground,
              borderRadius: metrics.radius.lg,
              padding: metrics.space.xl,
              gap: metrics.space.lg,
              maxHeight: "80%",
            }}
          >
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * ── THE GATE IS THE MOUNT, NOT AN EFFECT ──────────────────────────────────
 * This used to be `useState(seed)` plus an effect re-seeding it whenever
 * `visible` or the seed changed, which the React Compiler (SDK 57) rejects as
 * a setState inside an effect — rightly: it is a render, then a second render
 * to correct it.
 *
 * The shape that needs no correcting is to let the state EXIST only while the
 * dialog does. The wrapper holds no state and returns null when closed, so
 * every open constructs the body fresh; `key` on the seed covers the case the
 * effect's dependency array covered — a seed that changes while the dialog is
 * already open starts it over. Two rows with the same seed do not remount, and
 * do not need to: the state already equals it.
 */
export function InstructionsDialog({ visible, initial, ...rest }: {
  visible: boolean;
  initial: string;
  busy?: boolean;
  onCancel: () => void;
  onSave: (instructions: string) => void;
}) {
  if (!visible) return null;
  return <InstructionsDialogBody key={initial} initial={initial} {...rest} />;
}

function InstructionsDialogBody({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: string;
  busy?: boolean;
  onCancel: () => void;
  onSave: (instructions: string) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [text, setText] = useState(initial);


  return (
    <Sheet onClose={onCancel}>
      <View style={{ gap: metrics.space.xs }}>
        <Text variant="title">{t("instructions.title")}</Text>
        <Text variant="caption" tone="muted">{t("instructions.hint")}</Text>
      </View>

      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: metrics.radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: metrics.space.md,
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={INSTRUCTIONS_LIMIT}
          accessibilityLabel={t("instructions.label")}
          placeholder={t("instructions.optional")}
          placeholderTextColor={colors.inkMuted}
          style={{ color: colors.ink, fontSize: 16, minHeight: 110, paddingVertical: metrics.space.md }}
          testID="instructions-input"
        />
      </View>

      <Text variant="caption" tone="muted">
        {text.length} / {INSTRUCTIONS_LIMIT}
      </Text>

      <View style={{ gap: metrics.space.sm }}>
        {/* Sent even when emptied — clearing is a real instruction. */}
        <Button label={t("common.save")} busy={busy} onPress={() => onSave(text)} testID="instructions-save" />
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
          testID="instructions-cancel"
        >
          <Text tone="muted">{t("common.cancel")}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

/**
 * ── THE GATE IS THE MOUNT, NOT AN EFFECT ──────────────────────────────────
 * This used to be `useState(seed)` plus an effect re-seeding it whenever
 * `visible` or the seed changed, which the React Compiler (SDK 57) rejects as
 * a setState inside an effect — rightly: it is a render, then a second render
 * to correct it.
 *
 * The shape that needs no correcting is to let the state EXIST only while the
 * dialog does. The wrapper holds no state and returns null when closed, so
 * every open constructs the body fresh; `key` on the seed covers the case the
 * effect's dependency array covered — a seed that changes while the dialog is
 * already open starts it over. Two rows with the same seed do not remount, and
 * do not need to: the state already equals it.
 */
export function ScopeDialog({ visible, initial, ...rest }: {
  visible: boolean;
  initial: string[];
  busy?: boolean;
  onCancel: () => void;
  onSave: (apps: string[]) => void;
}) {
  if (!visible) return null;
  return <ScopeDialogBody key={initial.join(",")} initial={initial} {...rest} />;
}

function ScopeDialogBody({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial: string[];
  busy?: boolean;
  onCancel: () => void;
  onSave: (apps: string[]) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(initial);


  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  return (
    <Sheet onClose={onCancel}>
      <View style={{ gap: metrics.space.xs }}>
        <Text variant="title">{t("scope.title")}</Text>
        {/* The sentence that stops "none selected" reading as "search nothing". */}
        <Text variant="caption" tone="muted">
          {selected.length === 0
            ? t("scope.allHint")
            : t("scope.someHint", { count: selected.length, total: SCOPE_APPS.length })}
        </Text>
      </View>

      <ScrollView>
        {SCOPE_APPS.map((app) => {
          const on = selected.includes(app.key);
          return (
            <Pressable
              key={app.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={t(app.labelKey)}
              onPress={() => toggle(app.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: metrics.space.md,
                minHeight: metrics.touch,
              }}
              testID={`scope-${app.key}`}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: on ? colors.accent : colors.border,
                  backgroundColor: on ? colors.accent : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on ? <Check size={15} color={colors.onAccent} /> : null}
              </View>
              <Text>{t(app.labelKey)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ gap: metrics.space.sm }}>
        <Button label={t("common.save")} busy={busy} onPress={() => onSave(selected)} testID="scope-save" />
        {selected.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelected([])}
            style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
            testID="scope-all"
          >
            <Text tone="accent">{t("scope.searchAll")}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
          testID="scope-cancel"
        >
          <Text tone="muted">{t("common.cancel")}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
