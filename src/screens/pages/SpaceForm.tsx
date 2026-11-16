/**
 * NEW SPACE — the web's `SpaceFormPanel.tsx`, as a phone sheet (audit P0 #1,
 * 2026-11-16). Same fields, same rules: a title (required, the only one), a
 * description, one of the web's sixteen icons (📁 by default), and a note
 * colour or none (`noteColor.service.ts` `SELECTABLE_COLORS`, stored as its
 * key; "" for none). It sends exactly `space_params`
 * (`spaces_controller.rb`: title, description, icon, color).
 *
 * The form opens empty every time. On success it hands the new space back
 * (the save picker enters it) and the Pages lists refetch.
 */
import { useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FILL } from "@/theme/fill";
import { Check } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics, useScheme } from "@/hooks/useColors";
import type { Space } from "@/api/pages";
import { failureMessage } from "@/api/failure";
import { NOTE_COLOR_KEYS, noteColor, type NoteColorKey } from "@/screens/notes/editor/noteColors";
import { useCreateSpace } from "./usePageMutations";

/** `SPACE_ICONS` in the web's `SpaceFormPanel.tsx`, in its order. */
export const SPACE_ICONS = ["📁", "📝", "🗂️", "📚", "💡", "⭐", "🚀", "🎯", "📊", "🔖", "🏠", "🌐", "🔒", "🛠️", "🎨", "📌"];
/** The web's `SELECTABLE_COLORS`: every note colour but `no_color`, which is "none". */
const SPACE_COLORS = NOTE_COLOR_KEYS.filter((k): k is Exclude<NoteColorKey, "no_color"> => k !== "no_color");

const SWATCH = 36;

export function SpaceForm({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (space: Space) => void }) {
  if (!open) return null;
  // Mounted only while open, so every opening starts empty.
  return <SpaceFormBody onClose={onClose} onCreated={onCreated} />;
}

function SpaceFormBody({ onClose, onCreated }: { onClose: () => void; onCreated?: (space: Space) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState(SPACE_ICONS[0]);
  const [color, setColor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const creating = useCreateSpace();

  const colorLabels = {
    red: t("notes.grid.colors.red"), orange: t("notes.grid.colors.orange"), yellow: t("notes.grid.colors.yellow"),
    green: t("notes.grid.colors.green"), teal: t("notes.grid.colors.teal"), blue: t("notes.grid.colors.blue"),
    purple: t("notes.grid.colors.purple"), pink: t("notes.grid.colors.pink"), gray: t("notes.grid.colors.gray"),
  } satisfies Record<(typeof SPACE_COLORS)[number], string>;

  const submit = async () => {
    const name = title.trim();
    if (!name || creating.isPending) return;
    setError(null);
    try {
      const space = await creating.mutateAsync({ title: name, description: description.trim(), icon, color });
      onCreated?.(space);
      onClose();
    } catch (e) {
      setError(failureMessage(e, t("pages.spaceForm.failed")));
    }
  };

  const field = {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: metrics.radius.md,
    paddingHorizontal: metrics.space.md,
    color: colors.ink,
    backgroundColor: colors.surface,
    fontSize: 16,
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.45)" }} />
        <View
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: metrics.space.lg,
            paddingBottom: metrics.space.md + insets.bottom,
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
            maxHeight: "90%",
          }}
          testID="pages-space-form"
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: metrics.space.xl, gap: metrics.space.md }}>
            <Text variant="label" accessibilityRole="header">
              {t("pages.new.space")}
            </Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              autoFocus
              placeholder={t("pages.spaceForm.name")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("pages.spaceForm.name")}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              style={field}
              testID="pages-space-title"
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t("pages.spaceForm.description")}
              placeholderTextColor={colors.inkMuted}
              accessibilityLabel={t("pages.spaceForm.description")}
              multiline
              style={{ ...field, minHeight: 72, paddingTop: metrics.space.sm, textAlignVertical: "top" }}
              testID="pages-space-description"
            />

            <Text variant="caption" tone="muted">
              {t("pages.spaceForm.icon")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.xs }}>
              {SPACE_ICONS.map((emoji) => {
                const selected = emoji === icon;
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => setIcon(emoji)}
                    accessibilityRole="button"
                    accessibilityLabel={t("pages.spaceForm.iconLabel", { icon: emoji })}
                    accessibilityState={{ selected }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: metrics.radius.md,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? colors.accent : colors.border,
                      backgroundColor: selected ? `${colors.accent}22` : colors.surface,
                    }}
                    testID={`pages-space-icon-${emoji}`}
                  >
                    <Text style={{ fontSize: 20 }}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text variant="caption" tone="muted">
              {t("pages.spaceForm.color")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
              <Pressable
                onPress={() => setColor("")}
                accessibilityRole="button"
                accessibilityLabel={t("pages.spaceForm.noColor")}
                accessibilityState={{ selected: color === "" }}
                style={{
                  width: SWATCH,
                  height: SWATCH,
                  borderRadius: SWATCH / 2,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: color === "" ? colors.accent : colors.border,
                  backgroundColor: colors.surface,
                }}
                testID="pages-space-color-none"
              >
                {color === "" ? <Check size={16} color={colors.ink} /> : null}
              </Pressable>
              {SPACE_COLORS.map((key) => {
                const selected = key === color;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setColor(key)}
                    accessibilityRole="button"
                    accessibilityLabel={colorLabels[key]}
                    accessibilityState={{ selected }}
                    style={{
                      width: SWATCH,
                      height: SWATCH,
                      borderRadius: SWATCH / 2,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderColor: selected ? colors.ink : "transparent",
                      backgroundColor: noteColor(key, scheme).dot,
                    }}
                    testID={`pages-space-color-${key}`}
                  >
                    {selected ? <Check size={16} color="#ffffff" /> : null}
                  </Pressable>
                );
              })}
            </View>

            {error ? (
              <Text tone="danger" accessibilityLiveRegion="polite" testID="pages-space-error">
                {error}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: metrics.space.sm, paddingTop: metrics.space.sm }}>
              <Button label={t("common.cancel")} tone="neutral" block={false} onPress={onClose} testID="pages-space-cancel" />
              <Button
                label={t("pages.save.create")}
                block={false}
                busy={creating.isPending}
                disabled={!title.trim()}
                onPress={() => void submit()}
                testID="pages-space-create"
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
