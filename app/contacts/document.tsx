/**
 * One of a contact's documents, opened (`/contacts/document?contactId=7&documentId=4`),
 * audit #8. The web's `ContactDocumentPreview.tsx` shows an image, a PDF
 * (the Pages app's pdf.js viewer) or a Download card, with prev/next.
 *
 * Here the Pages viewer's own pieces do it, by what the file is
 * (`viewerModes.ts`): images swipe in the Pages gallery among this contact's
 * images, newest first like the card (the web's prev/next); a PDF opens in
 * iOS's WebView or Android's pdf.js view; anything else is a card with
 * Share. Share (the web's Download) is the Pages share sheet.
 *
 * The documents come with the contact (`contactsKeys.detail`), so this reads
 * the card's own query: opened from the card it draws at once.
 */
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { WebView } from "react-native-webview";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { LoadFailure } from "@/components/LoadFailure";
import { Download } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { contactsApi } from "@/api/contacts";
import { contactsKeys } from "@/api/keys";
import { failureMessage } from "@/api/failure";
import type { PageNode } from "@/api/pages";
import { ImageGallery } from "@/screens/pages/ImageGallery";
import { PdfView } from "@/screens/pages/PdfView";
import { shareNode } from "@/screens/pages/ItemSheet";
import { HeaderButton, NodeGlyph, formatBytes } from "@/screens/pages/parts";
import { modeFor } from "@/screens/pages/viewerModes";
import { asPageNode } from "@/screens/contacts/documents";
import { parseId } from "./contact";

export default function ContactDocumentScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ contactId?: string; documentId?: string }>();
  const contactId = parseId(params.contactId);
  const documentId = parseId(params.documentId);

  const query = useQuery({
    queryKey: contactsKeys.detail(contactId ?? 0),
    queryFn: () => contactsApi.show(contactId ?? 0),
    enabled: contactId != null,
  });
  const nodes = useMemo(
    () => (query.data?.documents ?? []).map((d) => asPageNode(d, contactId ?? 0)),
    [query.data, contactId],
  );
  const node = nodes.find((n) => n.id === documentId) ?? null;
  const mode = node ? modeFor(node) : null;
  const images = useMemo(() => nodes.filter((n) => modeFor(n) === "image"), [nodes]);

  // Swiping changes what the header names and what Share sends.
  const [shown, setShown] = useState<PageNode | null>(null);
  const current = shown ?? node;
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const share = useCallback(async () => {
    if (!current) return;
    setSharing(true);
    setShareError(null);
    try {
      await shareNode(current);
    } catch (e) {
      setShareError(failureMessage(e, t("pages.item.shareFailed")));
    } finally {
      setSharing(false);
    }
  }, [current, t]);

  const known = query.data?.documents != null;

  return (
    <Screen measure={mode !== "image" && mode !== "pdf" && mode !== "document"}>
      <AppHeader app="contacts" title={current?.title ?? t("contacts.documents.title")} back />
      {current ? (
        // The document's own row, under the shared header: its size, and share.
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: metrics.space.sm, paddingVertical: metrics.space.xs }}>
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {formatBytes(current.fileSize, t, i18n.language)}
          </Text>
          <HeaderButton icon={Download} label={t("pages.item.share")} onPress={() => void share()} testID="contact-document-share" />
        </View>
      ) : null}
      {shareError ? (
        <Text tone="danger" testID="contact-document-share-error">
          {shareError}
        </Text>
      ) : null}
      <LoadFailure
        error={query.error}
        loadFailed={t("contacts.detail.loadFailed")}
        hasData={Boolean(query.data)}
        updatedAt={query.dataUpdatedAt}
        onRetry={() => void query.refetch()}
        testID="contact-document-failed"
      />
      {!node ? (
        known ? (
          <View style={{ alignItems: "center", gap: metrics.space.md, paddingTop: metrics.space.xl * 2 }} testID="contact-document-gone">
            <Text tone="muted" style={{ textAlign: "center" }}>
              {t("contacts.documents.notFound")}
            </Text>
            <Button label={t("common.back")} tone="neutral" block={false} onPress={() => router.back()} />
          </View>
        ) : query.error ? null : (
          <ActivityIndicator color={colors.inkMuted} style={{ marginTop: metrics.space.xl }} testID="contact-document-loading" />
        )
      ) : (
        <View style={{ flex: 1, paddingBottom: metrics.space.md }} testID={`contact-document-view-${mode}`}>
          {mode === "image" ? (
            <ImageGallery images={images} startId={node.id} onShown={setShown} />
          ) : mode === "pdf" ? (
            <PdfView node={node} onShare={() => void share()} sharing={sharing} />
          ) : mode === "document" ? (
            <WebView source={{ uri: node.attachmentUrl ?? "" }} style={{ flex: 1 }} startInLoadingState />
          ) : (
            <View style={{ alignItems: "center", gap: metrics.space.md, paddingTop: metrics.space.xl * 2 }}>
              <NodeGlyph node={node} size={72} />
              <Text tone="muted" style={{ textAlign: "center" }}>
                {t("pages.view.noPreview")}
              </Text>
              <Button label={t("pages.item.share")} block={false} busy={sharing} onPress={() => void share()} testID="contact-document-share-button" />
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}
