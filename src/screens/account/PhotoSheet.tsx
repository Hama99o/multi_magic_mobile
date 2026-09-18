/**
 * Where a profile photo comes from: the library, the camera, or gone.
 *
 * TheFork's sheet is two rows — "Choose image from library" and "Take a photo".
 * We add a third, **Remove photo**, because `DELETE /users/:id/destroy_avatar`
 * is a real endpoint: an app that can remove a photo and hides the button is
 * making the user go to the website to undo something they did here.
 *
 * Permissions are asked for at the moment they are needed and not at launch —
 * a permission prompt before a person has said what they want is the one they
 * refuse. Refusal is not an error state either: the sheet simply closes, and
 * the photo stays what it was.
 */
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { Camera, Images, Trash2 } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";

export interface PickedPhoto {
  uri: string;
  name: string;
  mimeType: string;
}

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedPhoto {
  // `fileName` is null for a camera capture on Android, and a multipart part
  // with no filename is one Rails parses as a plain string rather than a file.
  const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
  return { uri: asset.uri, name, mimeType: asset.mimeType ?? "image/jpeg" };
}

export function PhotoSheet({
  visible,
  hasPhoto,
  onPicked,
  onRemove,
  onClose,
}: {
  visible: boolean;
  /** Remove is offered only when there is something to remove. */
  hasPhoto: boolean;
  onPicked: (photo: PickedPhoto) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();

  const fromLibrary = async () => {
    onClose();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      // Square, because every place this is rendered is a circle. Cropping here
      // beats cropping at three different call sites.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) onPicked(toPicked(result.assets[0]));
  };

  const fromCamera = async () => {
    onClose();
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) onPicked(toPicked(result.assets[0]));
  };

  if (!visible) return null;

  const rows = [
    { key: "library", label: "Choose from library", icon: Images, run: fromLibrary },
    { key: "camera", label: "Take a photo", icon: Camera, run: fromCamera },
    ...(hasPhoto
      ? [
          {
            key: "remove",
            label: "Remove photo",
            icon: Trash2,
            run: () => {
              onClose();
              onRemove();
            },
          },
        ]
      : []),
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={{ flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" }}
      >
        <Pressable
          testID="photo-sheet"
          onPress={() => {}}
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            padding: metrics.space.lg,
            paddingBottom: metrics.space.lg + insets.bottom,
          }}
        >
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: metrics.radius.md,
              overflow: "hidden",
            }}
          >
            {rows.map((row, index) => (
              <Pressable
                key={row.key}
                testID={`photo-${row.key}`}
                onPress={() => void row.run()}
                accessibilityRole="button"
                android_ripple={{ color: colors.border }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: metrics.space.md,
                  paddingHorizontal: metrics.space.lg,
                  minHeight: metrics.touch,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <row.icon
                  size={18}
                  color={row.key === "remove" ? colors.danger : colors.ink}
                />
                <Text tone={row.key === "remove" ? "danger" : "default"}>{row.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
