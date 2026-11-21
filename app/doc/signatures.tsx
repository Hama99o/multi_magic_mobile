/**
 * YOUR SIGNATURES (SPEC §C.3; web Sign sidebar).
 *
 * Active first, then newest — the server's order. Edit opens the creator with
 * the strokes or the text restored. Delete asks first: the web deletes on one
 * click, and a mis-tap on a phone costs more (parity audit §2.1, deliberate).
 */
import { Alert, FlatList, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Image as ExpoImage } from "expo-image";
import type { Signature } from "@/api/doc";
import { Pencil, Trash2 } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/reusables/button";
import { Text } from "@/components/reusables/text";
import { RowsSkeleton } from "@/components/reusables/skeleton";
import { LoadFailure } from "@/components/LoadFailure";
import { UnreadableNotice } from "@/components/UnreadableNotice";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useDeleteSignature, useSignatures } from "@/screens/doc/useSignatures";

const ROW_HEIGHT = 88;

export default function SignaturesScreen() {
  const metrics = useMetrics();
  const { t } = useTranslation();
  const list = useSignatures();
  const remove = useDeleteSignature();

  const confirmDelete = (s: Signature) =>
    Alert.alert(t("doc.signatures.deleteTitle"), t("doc.signatures.deleteBody"), [
      { text: t("doc.signatures.cancel"), style: "cancel" },
      { text: t("doc.signatures.deleteConfirm"), style: "destructive", onPress: () => remove.mutate(s.id) },
    ]);

  return (
    <Screen measure header={<AppHeader app="doc" title={t("doc.signatures.title")} back />}>
      {list.isPending ? (
        <RowsSkeleton />
      ) : list.isError ? (
        <LoadFailure error={list.error} loadFailed={t("doc.signatures.loadFailed")} hasData={false} updatedAt={list.dataUpdatedAt} onRetry={() => void list.refetch()} testID="doc-signatures-failed" />
      ) : (
        <FlatList
          testID="doc-signatures-list"
          data={list.data.rows}
          keyExtractor={(s) => String(s.id)}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT + metrics.space.sm, offset: (ROW_HEIGHT + metrics.space.sm) * index, index })}
          contentContainerStyle={{ gap: metrics.space.sm, paddingVertical: metrics.space.md }}
          ListHeaderComponent={list.data.unreadable ? <UnreadableNotice count={list.data.unreadable} /> : null}
          ListEmptyComponent={
            <Text tone="muted" style={{ paddingVertical: metrics.space.lg }}>
              {t("doc.sign.noSignatures")}
            </Text>
          }
          renderItem={({ item }) => <SignatureRow signature={item} onEdit={() => router.push({ pathname: "/doc/signature", params: { id: String(item.id) } })} onDelete={() => confirmDelete(item)} />}
          ListFooterComponent={<Button testID="doc-signatures-add" label={t("doc.signatures.add")} onPress={() => router.push("/doc/signature")} />}
        />
      )}
    </Screen>
  );
}

function SignatureRow({ signature, onEdit, onDelete }: { signature: Signature; onEdit: () => void; onDelete: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const icon = (Icon: typeof Pencil, label: string, onPress: () => void, id: string, danger = false) => (
    <Pressable testID={`doc-signature-${id}-${signature.id}`} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}>
      <Icon size={20} color={danger ? colors.danger : colors.ink} />
    </Pressable>
  );
  return (
    <View testID="doc-signature-row" style={{ height: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: metrics.space.md, padding: metrics.space.sm, borderRadius: metrics.radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      {/* Paper in both themes: dark ink on a dark card would vanish (SPEC §B). */}
      <View style={{ width: 120, height: ROW_HEIGHT - 20, borderRadius: metrics.radius.sm, backgroundColor: "#ffffff", padding: 4 }}>
        {signature.imageUrl ? <ExpoImage source={{ uri: signature.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="contain" accessible={false} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="label" numberOfLines={1}>
          {signature.name}
        </Text>
        {signature.active ? (
          <Text variant="caption" tone="accent">
            {t("doc.signatures.active")}
          </Text>
        ) : null}
      </View>
      {icon(Pencil, t("doc.signatures.edit", { name: signature.name }), onEdit, "edit")}
      {icon(Trash2, t("doc.signatures.delete", { name: signature.name }), onDelete, "delete", true)}
    </View>
  );
}
