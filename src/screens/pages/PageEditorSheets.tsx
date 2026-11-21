/**
 * The page editor's link dialog and code-block sheet (parity #50). They are
 * the note screen's (`app/notes/edit.tsx`), with the same strings and the
 * same engine calls, so a page and a note behave alike.
 */
import { useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { KeyboardPadding } from "@/components/KeyboardPadding";
import { useColors, useMetrics } from "@/hooks/useColors";
import { CODE_LANGUAGES } from "@/screens/notes/editor/blockEdits";

export function LinkDialog({ open, onCancel, onSave }: { open: boolean; onCancel: () => void; onSave: (typed: string) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  const close = () => {
    setTyped("");
    onCancel();
  };
  const save = () => {
    onSave(typed);
    setTyped("");
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <KeyboardPadding>
        <View style={{ flex: 1, justifyContent: "center", padding: metrics.space.lg, backgroundColor: "rgba(0,0,0,0.4)" }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: metrics.radius.lg, padding: metrics.space.lg, gap: metrics.space.md }}>
            <Text variant="label" accessibilityRole="header">
              {t("notes.toolbar.link")}
            </Text>
            <TextInput
              testID="page-link-input"
              value={typed}
              onChangeText={setTyped}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://"
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("notes.toolbar.link")}
              onSubmitEditing={save}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, padding: metrics.space.md, color: colors.ink, fontSize: 16 }}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: metrics.space.md }}>
              <Pressable testID="page-link-cancel" onPress={close} accessibilityRole="button" style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.md }}>
                <Text tone="muted">{t("common.cancel")}</Text>
              </Pressable>
              <Pressable testID="page-link-save" onPress={save} accessibilityRole="button" style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.md }}>
                <Text variant="label" tone="accent">
                  {t("common.save")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardPadding>
    </Modal>
  );
}

export function CodeLanguageSheet({
  open,
  current,
  onPick,
  onDelete,
  onClose,
}: {
  open: boolean;
  current: string | null;
  onPick: (language: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const done = (fn: () => void) => () => {
    fn();
    setQuery("");
  };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={done(onClose)}>
      <KeyboardPadding>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: metrics.radius.lg, borderTopRightRadius: metrics.radius.lg, padding: metrics.space.lg, gap: metrics.space.md, maxHeight: "75%" }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text variant="label" accessibilityRole="header" style={{ flex: 1 }}>
                {t("notes.code.title")}
              </Text>
              <Pressable testID="page-code-done" onPress={done(onClose)} accessibilityRole="button" style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }}>
                <Text variant="label" tone="accent">
                  {t("common.close")}
                </Text>
              </Pressable>
            </View>
            <TextInput
              testID="page-code-language-search"
              value={query}
              onChangeText={setQuery}
              placeholder={t("notes.code.search")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("notes.code.search")}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, padding: metrics.space.md, color: colors.ink, fontSize: 16 }}
            />
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
              {CODE_LANGUAGES.filter((l) => (l.id === null ? t("notes.code.plain") : l.name).toLowerCase().includes(q)).map((l) => {
                const name = l.id === null ? t("notes.code.plain") : l.name;
                const selected = current === l.id;
                return (
                  <Pressable
                    key={l.id ?? "plain"}
                    testID={`page-code-language-${l.id ?? "plain"}`}
                    onPress={done(() => onPick(l.id))}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={{ minHeight: metrics.touch, justifyContent: "center", borderBottomWidth: 1, borderColor: colors.border }}
                  >
                    <Text variant={selected ? "label" : undefined}>{name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable testID="page-code-delete" onPress={done(onDelete)} accessibilityRole="button" style={{ minHeight: metrics.touch, justifyContent: "center" }}>
              <Text tone="danger">{t("notes.code.delete")}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardPadding>
    </Modal>
  );
}
