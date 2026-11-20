/**
 * New project / Edit project: title (required), description, colour — the
 * web's `ProjectDrawer.tsx`. The web keeps `icon` without a control; so does
 * this sheet (parity audit §2, LATER).
 */
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { Project } from "@/api/flow";
import { failureMessage } from "@/api/failure";
import { BottomSheet } from "@/components/BottomSheet";
import { SheetButton } from "@/components/fields/FieldRow";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { PROJECT_COLORS } from "./logic";
import { Swatches } from "./parts";
import { useCreateProject, useUpdateProject } from "./useFlowMutations";

export function ProjectSheet({ project, onClose, onCreated }: { project: Project | null; onClose: () => void; onCreated?: (p: Project) => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState<string | null>(project?.color ?? "blue");
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const create = useCreateProject({ onDone: (p) => {
      onClose();
      onCreated?.(p);
    }, onError: (e) => setFailure(failureMessage(e, t("flow.project.saveFailed"))) });
  const update = useUpdateProject(project?.id ?? 0, { onError: (e) => setFailure(failureMessage(e, t("flow.project.saveFailed"))) });
  const missing = !title.trim();

  const save = () => {
    setTried(true);
    setFailure(null);
    if (missing) return;
    const input = { title: title.trim(), description: description.trim() || null, color };
    if (project) {
      update.mutate(input);
      onClose();
    } else create.mutate(input);
  };

  const inputStyle = { borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface } as const;

  return (
    <BottomSheet
      open
      title={project ? t("flow.project.edit") : t("flow.project.new")}
      onClose={onClose}
      testID="flow-project-sheet"
      footer={<SheetButton testID="flow-project-save" label={project ? t("fields.save") : t("flow.project.create")} busy={create.isPending} onPress={save} />}
    >
      <View style={{ gap: metrics.space.md }}>
        <View style={{ gap: metrics.space.xs }}>
          <Text variant="label">{t("flow.project.title")}</Text>
          <TextInput
            testID="flow-project-title"
            value={title}
            onChangeText={setTitle}
            autoFocus={!project}
            placeholder={t("flow.project.titlePlaceholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("flow.project.title")}
            returnKeyType="next"
            style={{ ...inputStyle, minHeight: 48, borderColor: tried && missing ? colors.danger : colors.border }}
          />
          {tried && missing ? (
            <Text testID="flow-project-title-error" tone="danger" variant="caption" accessibilityLiveRegion="polite">
              {t("flow.project.titleRequired")}
            </Text>
          ) : null}
        </View>
        <View style={{ gap: metrics.space.xs }}>
          <Text variant="label">{t("flow.project.description")}</Text>
          <TextInput
            testID="flow-project-description"
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder={t("flow.project.descriptionPlaceholder")}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={t("flow.project.description")}
            style={{ ...inputStyle, minHeight: 88, paddingVertical: metrics.space.sm, textAlignVertical: "top" }}
          />
        </View>
        <View style={{ gap: metrics.space.sm }}>
          <Text variant="label">{t("flow.project.color")}</Text>
          <Swatches testID="flow-project-color" colors={PROJECT_COLORS} value={color} onPick={(c) => setColor(c)} labelOf={(k) => t(`flow.color.${k}`)} />
        </View>
        {failure ? (
          <Text testID="flow-project-failure" tone="danger" accessibilityLiveRegion="polite">
            {failure}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
