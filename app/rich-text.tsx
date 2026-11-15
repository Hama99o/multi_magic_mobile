/**
 * EDIT A RICH-TEXT FIELD the web writes as Tiptap HTML (owner, 2026-11-15: "no
 * edit-on-web, everything editable on mobile"). First user: a contact's notes
 * (`ContactForm`). The field comes in through `useRichTextSession` and goes
 * back the same way on Done.
 *
 * The Notes app's codec and engine, so the formatting round-trips exactly:
 * HTML → `openForEditing` → engine B (with its own toolbar) → `saveFromEngine`
 * → the web's HTML. The same guards as the note editor: over EDIT_SIZE_LIMIT,
 * or if B refuses, does not keep the whole text, or reports an error, it opens
 * read-only with a code and nothing can be handed back.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { RichTextEditor, createNativeEditorDocumentHandle } from "@apollohg/react-native-rich-text-editor";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { RichText } from "@/components/RichText";
import { useColors, useMetrics } from "@/hooks/useColors";
import { useRichTextSession } from "@/stores/richTextSession.store";
import { EDIT_SIZE_LIMIT, openForEditing, saveFromEngine, type EditSession } from "@/screens/notes/editor/editSession";
import { engineHolds } from "@/screens/notes/editor/engineHolds";
import { notesEngineAtoms, notesEngineSchema } from "@/screens/notes/editor/engineSchema";
import { engineTheme } from "@/screens/notes/editor/engineTheme";
import type { DocNode } from "@/vendor/tiptop-schema";

type EngineRef = { getContentJson(): unknown; blur?(): void };

export default function RichTextScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const session = useRichTextSession((s) => s.session);
  const editorRef = useRef<EngineRef | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [cannotSave, setCannotSave] = useState(false);

  useEffect(() => {
    if (!session) router.back();
  }, [session]);

  const engine = useMemo(() => {
    if (!session) return null;
    if (session.html.length > EDIT_SIZE_LIMIT) return { session: null, handle: null, why: "tooLong" as const };
    let edit: EditSession | null = null;
    try {
      edit = openForEditing(session.html);
      const engineDoc = edit.engineDoc;
      const handle = createNativeEditorDocumentHandle({
        initialization: { type: "localJson", json: engineDoc },
        schema: notesEngineSchema,
        policy: { allowBase64Images: true },
      } as never);
      const held = engineHolds((handle as unknown as { bridge?: Parameters<typeof engineHolds>[0] }).bridge, engineDoc);
      if (!held.ok) {
        handle.destroy();
        return { session: edit, handle: null, why: `NE-HOLDS · ${held.reason}` };
      }
      return { session: edit, handle, why: null };
    } catch (e) {
      return { session: edit, handle: null, why: `NE-CREATE · ${e instanceof Error ? e.message : String(e)}` };
    }
  }, [session]);
  useEffect(() => () => engine?.handle?.destroy(), [engine]);
  useEffect(() => {
    const bridge = (engine?.handle as unknown as { bridge?: { addErrorListener?(fn: (e: unknown) => void): () => void } } | null)?.bridge;
    if (!bridge?.addErrorListener) return;
    return bridge.addErrorListener((e) => {
      const why = e && typeof e === "object" ? `${(e as { code?: string }).code ?? ""} ${(e as { message?: string }).message ?? ""}`.trim() : String(e);
      setEngineError(why || "engine error");
    });
  }, [engine]);

  if (!session || !engine) return <View testID="rich-text-empty" style={{ flex: 1, backgroundColor: colors.ground }} />;

  const close = () => {
    useRichTextSession.getState().clear();
    router.back();
  };
  const done = () => {
    const json = editorRef.current?.getContentJson();
    if (!json || !engine.session) return;
    const out = saveFromEngine(json as DocNode, engine.session);
    if (!out.ok) {
      setCannotSave(true);
      return;
    }
    session.onDone(out.html);
    close();
  };

  const readOnly = !engine.handle || engineError !== null;
  const reason = engine.why === "tooLong" ? t("richText.tooLong") : `${t("richText.cannotOpen")}\n${(engineError ? `NE-ENGINE · ${engineError}` : engine.why ?? "NE-UNKNOWN").slice(0, 200)}`;

  return (
    <Screen avoidKeyboard>
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.md }}>
        <Pressable testID="rich-text-cancel" onPress={close} accessibilityRole="button" hitSlop={8} style={{ minHeight: 40, justifyContent: "center" }}>
          <Text tone="accent">{t("common.cancel")}</Text>
        </Pressable>
        <Text variant="title" accessibilityRole="header" numberOfLines={1} style={{ flex: 1, textAlign: "center", fontSize: 18 }}>
          {session.title}
        </Text>
        {readOnly ? (
          <View style={{ minWidth: 48 }} />
        ) : (
          <Pressable testID="rich-text-done" onPress={done} accessibilityRole="button" hitSlop={8} style={{ minHeight: 40, justifyContent: "center" }}>
            <Text tone="accent" style={{ fontWeight: "700" }}>{t("richText.done")}</Text>
          </Pressable>
        )}
      </View>
      {cannotSave ? (
        <Text testID="rich-text-cannot-save" tone="danger" style={{ marginBottom: metrics.space.sm }}>
          {t("richText.cannotSave")}
        </Text>
      ) : null}
      {readOnly ? (
        <ScrollView contentContainerStyle={{ gap: metrics.space.md, paddingBottom: metrics.space.xl }}>
          <Text testID="rich-text-cannot-open" tone="muted" selectable>
            {reason}
          </Text>
          <RichText value={session.html} />
        </ScrollView>
      ) : (
        <View style={{ flex: 1, borderRadius: metrics.radius.md, backgroundColor: colors.surface, overflow: "hidden" }}>
          <RichTextEditor
            ref={editorRef as never}
            documentHandle={engine.handle}
            atoms={notesEngineAtoms}
            theme={engineTheme(colors, colors.surface) as never}
            showToolbar
            placeholder={t("richText.placeholder")}
            style={{ flex: 1 }}
            containerStyle={{ flex: 1 }}
          />
        </View>
      )}
    </Screen>
  );
}
