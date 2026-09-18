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
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";

/** `Ai::Sessions::INSTRUCTIONS_LIMIT` — enforced here so the field trims rather
 *  than the server rejecting a round trip. */
const INSTRUCTIONS_LIMIT = 2000;

/** `Ai::AppScope::APPS` — do not invent keys; unknown ones are dropped. */
export const SCOPE_APPS = [
  { key: "notes", label: "Notes" },
  { key: "page_app", label: "Pages" },
  { key: "contacts", label: "Contacts" },
  { key: "todos", label: "To-dos" },
  { key: "finance", label: "Money" },
  { key: "flow", label: "Flow" },
  { key: "calendar", label: "Calendar" },
] as const;

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
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
    </Modal>
  );
}

export function InstructionsDialog({
  visible,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: string;
  busy?: boolean;
  onCancel: () => void;
  onSave: (instructions: string) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const [text, setText] = useState(initial);

  useEffect(() => {
    if (visible) setText(initial);
  }, [visible, initial]);

  if (!visible) return null;

  return (
    <Sheet onClose={onCancel}>
      <View style={{ gap: metrics.space.xs }}>
        <Text variant="title">How to answer in this chat</Text>
        <Text variant="caption" tone="muted">
          Written once, read every time. &ldquo;This chat is about my flat renovation, answer
          in French.&rdquo;
        </Text>
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
          accessibilityLabel="Standing instructions"
          placeholder="Optional"
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
        <Button label="Save" busy={busy} onPress={() => onSave(text)} testID="instructions-save" />
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
          testID="instructions-cancel"
        >
          <Text tone="muted">Cancel</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

export function ScopeDialog({
  visible,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: string[];
  busy?: boolean;
  onCancel: () => void;
  onSave: (apps: string[]) => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const [selected, setSelected] = useState<string[]>(initial);

  useEffect(() => {
    if (visible) setSelected(initial);
  }, [visible, initial]);

  if (!visible) return null;

  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  return (
    <Sheet onClose={onCancel}>
      <View style={{ gap: metrics.space.xs }}>
        <Text variant="title">Search in</Text>
        {/* The sentence that stops "none selected" reading as "search nothing". */}
        <Text variant="caption" tone="muted">
          {selected.length === 0
            ? "All apps. Choose some to narrow this chat."
            : `Only ${selected.length} of ${SCOPE_APPS.length} apps.`}
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
              accessibilityLabel={app.label}
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
              <Text>{app.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ gap: metrics.space.sm }}>
        <Button label="Save" busy={busy} onPress={() => onSave(selected)} testID="scope-save" />
        {selected.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelected([])}
            style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
            testID="scope-all"
          >
            <Text tone="accent">Search all apps</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={{ minHeight: metrics.touch, alignItems: "center", justifyContent: "center" }}
          testID="scope-cancel"
        >
          <Text tone="muted">Cancel</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
