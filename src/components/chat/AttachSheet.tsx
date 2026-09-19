/**
 * The `+` sheet: Photo · Camera · Document.
 *
 * Three rows because those are the three ways a person actually has a file on a
 * phone — one already taken, one about to be taken, and one that arrived some
 * other way. ChatGPT's shape: no separate upload screen, because a file is
 * something you add to a sentence you are writing.
 *
 * The count against the cap is shown while a conversation is filling up rather
 * than only at the point of refusal — "17 of 20 files" is information; meeting
 * the limit with no warning is a surprise.
 */
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Camera, FileText, Image as ImageIcon } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { ALLOWED_UPLOAD_EXTENSIONS, LIMITS } from "@/api/ai";

/** "PDF, PNG, JPG, …" — from the list the endpoint enforces, never retyped. */
export function describeAllowedTypes(): string {
  return ALLOWED_UPLOAD_EXTENSIONS.map((ext) => ext.toUpperCase()).join(", ");
}

export function AttachSheet({
  visible,
  fileCount,
  onClose,
  onPickImage,
  onTakePhoto,
  onPickDocument,
}: {
  visible: boolean;
  fileCount: number;
  onClose: () => void;
  onPickImage: () => void;
  onTakePhoto: () => void;
  onPickDocument: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const rows = [
    { icon: ImageIcon, label: "Photo", hint: "From your library", onPress: onPickImage, testID: "attach-photo" },
    { icon: Camera, label: "Camera", hint: "Take one now", onPress: onTakePhoto, testID: "attach-camera" },
    { icon: FileText, label: "Document", hint: "PDF or CSV", onPress: onPickDocument, testID: "attach-document" },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
      >
        <View
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            padding: metrics.space.lg,
            // Measured on a device: the last row sat under the gesture bar.
            paddingBottom: metrics.space.lg + insets.bottom,
            gap: metrics.space.sm,
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
          }}
          testID="attach-sheet"
        >
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text variant="label" tone="muted">
              Add to this conversation
            </Text>
            {/* Shown while filling up, not only at refusal. */}
            {fileCount > 0 ? (
              <Text variant="caption" tone="muted" testID="attach-count">
                {fileCount} of {LIMITS.maxFilesPerSession} files
              </Text>
            ) : null}
          </View>

          {/* The limits, BEFORE the picker opens. A person who picks a 14 MB
              scan and is then told "under 10 MB" has done the work twice;
              the sentence costs one line and the server enforces every word
              of it (`AiDocument::MAX_BYTES`, `MAX_PER_CONVERSATION`,
              `ALLOWED_EXTENSIONS`). */}
          <Text variant="caption" tone="muted" testID="attach-limits">
            Up to {LIMITS.maxFilesPerSession} files of {LIMITS.maxFileBytes / (1024 * 1024)} MB
            each. {describeAllowedTypes()}.
          </Text>

          {rows.map((row) => (
            <Pressable
              key={row.label}
              accessibilityRole="button"
              accessibilityLabel={`${row.label}. ${row.hint}`}
              onPress={() => {
                onClose();
                row.onPress();
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: metrics.space.lg,
                minHeight: metrics.touch + 8,
                paddingHorizontal: metrics.space.md,
                borderRadius: metrics.radius.md,
              }}
              testID={row.testID}
            >
              <row.icon size={22} color={colors.accent} />
              <View>
                <Text>{row.label}</Text>
                <Text variant="caption" tone="muted">
                  {row.hint}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
