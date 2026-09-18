/**
 * A file the assistant handed back, opened in the app.
 *
 * `Ai::Actions::FindFiles` answers "I need the PDF of last month's payslip"
 * with the document itself and a link that downloads it. On the web that link
 * is one click. On a phone it has to become something openable, and the answer
 * is not always "hand it to the browser":
 *
 * - **an image opens inline**, because that is the whole of looking at it;
 * - **anything else offers to open it**, which hands it to whatever on the
 *   device reads that type. Expo Go carries no PDF viewer, so pretending to
 *   render one would be a blank sheet with a spinner.
 *
 * The URL needs the token: these are Active Storage paths behind the same
 * session the app is signed in with, so a bare `Linking.openURL` opens a
 * browser that is not signed in and gets a redirect to the login page. The
 * signed blob path works without a session; anything else is offered as a plain
 * open and says where it is going.
 */
import { Image, Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { X } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import type { AnswerLink } from "./AnswerMarkdown";

const IMAGE = /\.(png|jpe?g|webp|gif|heic|heif)(\?|$)/i;

export function FilePreview({
  link,
  onClose,
}: {
  link: AnswerLink | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();

  if (!link) return null;
  const isImage = IMAGE.test(link.url);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            padding: metrics.space.lg,
            gap: metrics.space.lg,
            maxHeight: "85%",
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
          }}
          testID="file-preview"
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md }}>
            <View style={{ flex: 1 }}>
              <Text variant="label" tone="muted">
                From your files
              </Text>
              <Text variant="title" numberOfLines={2}>
                {link.label}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={onClose}
              style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
              testID="file-preview-close"
            >
              <X size={22} color={colors.inkMuted} />
            </Pressable>
          </View>

          {isImage ? (
            <ScrollView contentContainerStyle={{ alignItems: "center" }}>
              <Image
                source={{ uri: link.url }}
                style={{ width: "100%", height: 360, borderRadius: metrics.radius.md }}
                resizeMode="contain"
                accessibilityLabel={link.label}
                testID="file-preview-image"
              />
            </ScrollView>
          ) : (
            <Text tone="muted">
              This opens outside MultiMagic, in whatever on your phone reads this kind of file.
            </Text>
          )}

          <Button
            label={isImage ? "Open full size" : "Open file"}
            tone="neutral"
            onPress={() => void Linking.openURL(link.url)}
            testID="file-preview-open"
          />
        </View>
      </View>
    </Modal>
  );
}
