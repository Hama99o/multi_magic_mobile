/**
 * Import contacts (`docs/design/contacts/SPEC.md` §C.7): one from the phone,
 * several or all from the phone, or a .vcf file — then a real progress bar
 * (Tinder, Brink: a count under it) and a summary (Phantom): added · already
 * there · failed.
 *
 * Permission for the address book is asked when "Choose from my phone" is
 * tapped, never before. Denied → a sentence and Open Settings. iOS 18
 * "limited" → we import what was shared, and say how to share more.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Linking, Pressable, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { BookUser, ChevronLeft, Circle, CircleCheck, FileText, Search, UserPlus, X } from "@/components/icons";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { contactsApi, type ImportResult } from "@/api/contacts";
import { failureMessage } from "@/api/failure";
import { phoneBook, PhoneBookUnavailable } from "@/screens/contacts/phoneBook";
import { displayOf, toVcard, toVcards, type PhoneContact } from "@/screens/contacts/vcard";
import { runImport, splitCards, type ImportOutcome } from "@/screens/contacts/importer";
import { useSharedIntoContacts } from "@/stores/sharedIntoContacts.store";

type Stage =
  | { kind: "choose"; note?: string }
  | { kind: "loading" }
  | { kind: "pick"; contacts: PhoneContact[]; limited: boolean }
  | { kind: "progress"; sent: number; total: number }
  | { kind: "done"; outcome: ImportOutcome; cards: string[] };

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function ImportContacts() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [showNames, setShowNames] = useState(false);

  const fail = (e: unknown) => {
    // The sentence the person sees is generic; the cause goes to the dev log.
    if (__DEV__) console.warn("[contacts-import]", e instanceof Error ? `${e.name}: ${e.message} / cause: ${String((e as { cause?: unknown }).cause ?? "")} / ${String((e as { code?: unknown }).code ?? "")}` : e);
    setStage({ kind: "choose", note: e instanceof PhoneBookUnavailable ? t("contacts.phone.unavailable") : failureMessage(e, t("contacts.import.failed")) });
  };

  const send = async (cards: string[], resume?: Extract<ImportOutcome, { status: "stopped" }>) => {
    if (!cards.length) {
      setStage({ kind: "choose", note: t("contacts.import.nothing") });
      return;
    }
    setStage({ kind: "progress", sent: resume?.sent ?? 0, total: cards.length });
    const outcome = await runImport(cards, {
      send: contactsApi.importVcf,
      onProgress: (sent, total) => setStage({ kind: "progress", sent, total }),
      from: resume?.sent,
      so: resume?.result,
    });
    if (outcome.result.created) await queryClient.invalidateQueries({ queryKey: ["contacts"] });
    setShowNames(false);
    setStage({ kind: "done", outcome, cards });
  };

  // Several cards shared from another app (`ShareIntentBridge`): straight to
  // the bulk import, the same bar and summary as a file.
  const params = useLocalSearchParams<{ shared?: string }>();
  const started = useRef(false);
  useEffect(() => {
    if (params.shared !== "1" || started.current) return;
    started.current = true;
    const pending = useSharedIntoContacts.getState().take();
    if (pending?.kind === "cards") void send(pending.cards);
    // `send` is a plain function of this render; the import starts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.shared]);

  const pickOne = async () => {
    try {
      const contact = await phoneBook.pickOne();
      if (contact) await send([toVcard(contact)]);
    } catch (e) {
      fail(e);
    }
  };

  const fromPhone = async () => {
    setStage({ kind: "loading" });
    try {
      const access = await phoneBook.requestAccess();
      if (access === "denied") {
        setStage({ kind: "choose", note: t("contacts.phone.denied") });
        return;
      }
      const all = (await phoneBook.readAll()).filter((c) => displayOf(c) || c.phones?.length || c.emails?.length);
      all.sort((a, b) => fold(displayOf(a)).localeCompare(fold(displayOf(b))));
      setChosen(new Set(all.map((c) => c.id)));
      setFilter("");
      setStage({ kind: "pick", contacts: all, limited: access === "limited" });
    } catch (e) {
      fail(e);
    }
  };

  const fromFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["text/vcard", "text/x-vcard", "text/directory", "*/*"], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets[0]) return;
      setStage({ kind: "loading" });
      const file = new File(picked.assets[0].uri);
      const cards = splitCards(await file.text());
      try {
        if (file.exists) file.delete();
      } catch {
        // A copy in the cache; the system clears it.
      }
      if (!cards.length) {
        setStage({ kind: "choose", note: t("contacts.import.notVcf") });
        return;
      }
      await send(cards);
    } catch (e) {
      fail(e);
    }
  };

  const visible = useMemo(() => {
    if (stage.kind !== "pick") return [];
    const q = fold(filter.trim());
    if (!q) return stage.contacts;
    const digits = q.replace(/\D/g, "");
    return stage.contacts.filter(
      (c) => fold(displayOf(c)).includes(q) || (digits.length >= 3 && (c.phones ?? []).some((p) => (p.number ?? "").replace(/\D/g, "").includes(digits))),
    );
  }, [stage, filter]);

  const header = (title: string, onBack: () => void) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
      <Pressable testID="contacts-import-back" onPress={onBack} accessibilityRole="button" accessibilityLabel={t("common.back")} hitSlop={8} style={{ width: 32, height: 32, justifyContent: "center" }}>
        <ChevronLeft size={24} color={colors.ink} />
      </Pressable>
      <Text variant="title" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {title}
      </Text>
    </View>
  );

  // ── choose ───────────────────────────────────────────────────────────────
  if (stage.kind === "choose" || stage.kind === "loading") {
    const option = (testID: string, icon: ReactNode, title: string, body: string, onPress: () => void) => (
      <Pressable
        testID={testID}
        onPress={onPress}
        disabled={stage.kind === "loading"}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={body}
        android_ripple={{ color: colors.border }}
        style={{ flexDirection: "row", gap: metrics.space.md, alignItems: "center", padding: metrics.space.lg, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
      >
        {icon}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontWeight: "600" }}>{title}</Text>
          <Text variant="caption" tone="muted">
            {body}
          </Text>
        </View>
      </Pressable>
    );
    return (
      <Screen measure>
        {header(t("contacts.import.title"), () => router.back())}
        <View style={{ gap: metrics.space.md }}>
          {option("contacts-import-one", <UserPlus size={24} color={colors.accent} />, t("contacts.import.one"), t("contacts.import.oneBody"), () => void pickOne())}
          {option("contacts-import-phone", <BookUser size={24} color={colors.accent} />, t("contacts.import.phone"), t("contacts.import.phoneBody"), () => void fromPhone())}
          {option("contacts-import-file", <FileText size={24} color={colors.accent} />, t("contacts.import.file"), t("contacts.import.fileBody"), () => void fromFile())}
          {stage.kind === "loading" ? <ActivityIndicator testID="contacts-import-loading" /> : null}
          {stage.kind === "choose" && stage.note ? (
            <View style={{ gap: metrics.space.sm }}>
              <Text testID="contacts-import-note" tone="danger" accessibilityLiveRegion="polite">
                {stage.note}
              </Text>
              {stage.note === t("contacts.phone.denied") ? (
                <Button testID="contacts-import-settings" tone="neutral" label={t("contacts.phone.openSettings")} onPress={() => void Linking.openSettings()} />
              ) : null}
            </View>
          ) : null}
          <Text variant="caption" tone="muted" style={{ paddingTop: metrics.space.sm }}>
            {t("contacts.import.duplicatesNote")}
          </Text>
        </View>
      </Screen>
    );
  }

  // ── pick from the phone ──────────────────────────────────────────────────
  if (stage.kind === "pick") {
    const allOn = chosen.size === stage.contacts.length;
    return (
      <Screen measure>
        {header(t("contacts.import.pickTitle", { count: chosen.size }), () => setStage({ kind: "choose" }))}
        {stage.limited ? (
          <View style={{ gap: metrics.space.xs, paddingBottom: metrics.space.sm }}>
            <Text testID="contacts-import-limited" variant="caption" tone="muted">
              {t("contacts.phone.limited", { count: stage.contacts.length })}
            </Text>
            <Pressable testID="contacts-import-share-more" onPress={() => void phoneBook.shareMore().then(fromPhone).catch(fail)} accessibilityRole="button" accessibilityLabel={t("contacts.phone.shareMore")} style={{ minHeight: 40, justifyContent: "center" }}>
              <Text tone="accent" variant="label">
                {t("contacts.phone.shareMore")}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Search size={18} color={colors.inkMuted} />
            <TextInput testID="contacts-import-search" value={filter} onChangeText={setFilter} placeholder={t("contacts.list.search")} placeholderTextColor={colors.inkMuted} accessibilityLabel={t("contacts.list.search")} autoCorrect={false} style={{ flex: 1, minHeight: 44, color: colors.ink, fontSize: 16 }} />
            {filter ? (
              <Pressable onPress={() => setFilter("")} accessibilityRole="button" accessibilityLabel={t("contacts.list.clearSearch")} hitSlop={8}>
                <X size={18} color={colors.inkMuted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            testID="contacts-import-all"
            onPress={() => setChosen(allOn ? new Set() : new Set(stage.contacts.map((c) => c.id)))}
            accessibilityRole="button"
            accessibilityLabel={allOn ? t("contacts.list.selectNone") : t("contacts.list.selectAll")}
            style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }}
          >
            <Text tone="accent" variant="label">
              {allOn ? t("contacts.list.selectNone") : t("contacts.list.selectAll")}
            </Text>
          </Pressable>
        </View>
        <FlatList
          testID="contacts-import-list"
          data={visible}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          ListEmptyComponent={
            <Text testID="contacts-import-empty" tone="muted" style={{ textAlign: "center", paddingVertical: metrics.space.xl }}>
              {stage.contacts.length ? t("contacts.list.noResults", { term: filter.trim() }) : t("contacts.phone.none")}
            </Text>
          }
          renderItem={({ item }) => {
            const on = chosen.has(item.id);
            const name = displayOf(item) || item.phones?.[0]?.number || item.emails?.[0]?.address || "";
            const sub = item.phones?.[0]?.number ?? item.emails?.[0]?.address ?? "";
            return (
              <Pressable
                testID={`contacts-import-row-${item.id}`}
                onPress={() =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={[name, sub && sub !== name ? sub : null].filter(Boolean).join(", ")}
                style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.md, minHeight: 60 }}
              >
                {on ? <CircleCheck size={24} color={colors.accent} /> : <Circle size={24} color={colors.inkMuted} />}
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>{name}</Text>
                  {sub && sub !== name ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {sub}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingBottom: 96 }}
        />
        <View style={{ position: "absolute", left: metrics.space.lg, right: metrics.space.lg, bottom: metrics.space.lg }}>
          <Button
            testID="contacts-import-go"
            label={t("contacts.import.go", { count: chosen.size })}
            disabled={chosen.size === 0}
            onPress={() => void send(toVcards(stage.contacts.filter((c) => chosen.has(c.id))))}
          />
        </View>
      </Screen>
    );
  }

  // ── progress ─────────────────────────────────────────────────────────────
  if (stage.kind === "progress") {
    const share = stage.total ? stage.sent / stage.total : 0;
    return (
      <Screen measure>
        <View style={{ flex: 1, justifyContent: "center", gap: metrics.space.md, paddingHorizontal: metrics.space.lg }}>
          <Text variant="title" style={{ textAlign: "center", fontSize: 22 }}>
            {t("contacts.import.adding")}
          </Text>
          <View
            testID="contacts-import-progress"
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t("contacts.import.adding")}
            accessibilityValue={{ min: 0, max: stage.total, now: stage.sent }}
            style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}
          >
            <View style={{ width: `${Math.round(share * 100)}%`, height: 8, backgroundColor: colors.accent }} />
          </View>
          <Text testID="contacts-import-count" tone="muted" style={{ textAlign: "center" }}>
            {t("contacts.import.sentOf", { sent: stage.sent, total: stage.total })}
          </Text>
        </View>
      </Screen>
    );
  }

  // ── summary ──────────────────────────────────────────────────────────────
  const { outcome, cards } = stage;
  const r: ImportResult = outcome.result;
  const line = (testID: string, label: string, value: number, tone: "default" | "muted" | "danger") => (
    <View testID={testID} accessible accessibilityLabel={`${label}: ${value}`} style={{ flexDirection: "row", justifyContent: "space-between", minHeight: 44, alignItems: "center" }}>
      <Text tone={tone === "danger" && value === 0 ? "default" : tone}>{label}</Text>
      <Text tone={tone === "danger" && value === 0 ? "default" : tone} style={{ fontWeight: "700", fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
  return (
    <Screen measure>
      {header(t("contacts.import.doneTitle"), () => router.back())}
      <View style={{ gap: metrics.space.md }}>
        <Text testID="contacts-import-summary" variant="title" style={{ fontSize: 22 }} accessibilityLiveRegion="polite">
          {outcome.status === "unsupported"
            ? t("contacts.import.unsupported")
            : outcome.status === "stopped"
              ? t("contacts.import.stopped", { sent: outcome.sent, total: cards.length })
              : t("contacts.import.done", { count: r.created })}
        </Text>
        {outcome.status === "stopped" ? (
          <Text tone="danger">{failureMessage(outcome.error, t("contacts.import.failed"))}</Text>
        ) : null}
        <View style={{ borderRadius: metrics.radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: metrics.space.md }}>
          {line("contacts-import-added", t("contacts.import.added"), r.created, "default")}
          {line("contacts-import-skipped", t("contacts.import.skipped"), r.skipped, "muted")}
          {line("contacts-import-failed", t("contacts.import.failedCount"), r.failed, "danger")}
        </View>
        {r.skippedNames.length || r.failedNames.length ? (
          <Pressable testID="contacts-import-names" onPress={() => setShowNames((s) => !s)} accessibilityRole="button" accessibilityState={{ expanded: showNames }} accessibilityLabel={t("contacts.import.showNames")} style={{ minHeight: 40, justifyContent: "center" }}>
            <Text tone="accent" variant="label">
              {showNames ? t("contacts.import.hideNames") : t("contacts.import.showNames")}
            </Text>
          </Pressable>
        ) : null}
        {showNames ? (
          <Text testID="contacts-import-name-list" variant="caption" tone="muted">
            {[
              r.skippedNames.length ? `${t("contacts.import.skipped")}: ${r.skippedNames.join(", ")}` : null,
              r.failedNames.length ? `${t("contacts.import.failedCount")}: ${r.failedNames.join(", ")}` : null,
            ].filter(Boolean).join("\n\n")}
          </Text>
        ) : null}
        {outcome.status === "stopped" ? (
          <Button testID="contacts-import-resume" label={t("contacts.import.resume", { count: cards.length - outcome.sent })} onPress={() => void send(cards, outcome)} />
        ) : null}
        <Button testID="contacts-import-done" tone={outcome.status === "stopped" ? "neutral" : "primary"} label={t("contacts.import.finish")} onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
