/**
 * A file the assistant handed back, opened in the app.
 *
 * `Ai::Actions::FindFiles` answers "I need the PDF of last month's payslip"
 * with the document itself and a link that downloads it. On the web that link
 * is one click. On a phone it has to become something openable, and the answer
 * is not always "hand it to the browser":
 *
 * - **an image opens inline**, because that is the whole of looking at it;
 * - **audio and video play inline** (the owner's voice notes, 2026-11-12);
 * - **anything else offers to open it**, which hands it to whatever on the
 *   device reads that type. Expo Go carries no PDF viewer, so pretending to
 *   render one would be a blank sheet with a spinner.
 *
 * The URL needs the token: these are Active Storage paths behind the same
 * session the app is signed in with, so a bare `Linking.openURL` opens a
 * browser that is not signed in and gets a redirect to the login page. The
 * signed blob path works without a session; anything else is offered as a plain
 * open and says where it is going.
 *
 * WHAT the file is comes from its type, asked of the server with one ranged
 * request (`probeRemoteType`: the Content-Type, or the first bytes when that
 * says octet-stream). Never the URL's extension: a photo named "IMG_2041" has
 * none, and the owner renamed files by hand to get them shown (2026-11-12).
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { FILL } from "@/theme/fill";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "@/components/icons";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { mediaKind, type MediaKind } from "@/lib/mediaKind";
import { probeRemoteType } from "@/lib/probeMimeType";
import type { AnswerLink } from "./AnswerMarkdown";

type Shown = "probing" | MediaKind | "other";

/** What the file at `url` is, from its type; "probing" until the server says. */
function useShown(url: string | null): Shown {
  const [shown, setShown] = useState<{ url: string | null; kind: Shown }>({ url: null, kind: "probing" });
  useEffect(() => {
    if (!url) return;
    let live = true;
    probeRemoteType(url)
      .then((type) => live && setShown({ url, kind: mediaKind(type) ?? "other" }))
      .catch(() => live && setShown({ url, kind: "other" }));
    return () => {
      live = false;
    };
  }, [url]);
  return shown.url === url ? shown.kind : "probing";
}

function InlinePlayer({ uri, kind }: { uri: string; kind: "audio" | "video" }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={{ width: "100%", height: kind === "video" ? 300 : 96 }}
      testID={`file-preview-${kind}`}
    />
  );
}

export function FilePreview({
  link,
  onClose,
}: {
  link: AnswerLink | null;
  onClose: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const shown = useShown(link?.url ?? null);
  if (!link) return null;
  const isImage = shown === "image";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        {/* THE SCRIM IS A SIBLING, NOT A PARENT — docs/ACCESSIBILITY.md N1,
            the same shape as AttachSheet. It was a plain View, so a tap
            outside the sheet did nothing (owner's report, 2026-09-24); now it
            closes, and names only itself to a screen reader. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={onClose}
          style={{ ...FILL, backgroundColor: "rgba(0,0,0,0.6)" }}
          testID="file-preview-scrim"
        />
        <View
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            padding: metrics.space.lg,
            // The "Open file" button is the last row; keep it above the home
            // indicator.
            paddingBottom: metrics.space.lg + insets.bottom,
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
                {t("files.fromYourFiles")}
              </Text>
              <Text variant="title" numberOfLines={2}>
                {link.label}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
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
          ) : shown === "audio" || shown === "video" ? (
            <InlinePlayer uri={link.url} kind={shown} />
          ) : shown === "probing" ? (
            <ActivityIndicator color={colors.inkMuted} testID="file-preview-probing" />
          ) : (
            <Text tone="muted">{t("files.opensOutside")}</Text>
          )}

          <Button
            label={isImage ? t("files.openFullSize") : t("files.openFile")}
            tone="neutral"
            onPress={() => void Linking.openURL(link.url)}
            testID="file-preview-open"
          />
        </View>
      </View>
    </Modal>
  );
}
