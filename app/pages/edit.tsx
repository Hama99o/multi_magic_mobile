/**
 * A RICH PAGE, EDITED (parity audit #50; web `NodeViewer` + `PageEditor`).
 *
 * The same engine and codec as a note (`screens/notes/editor`): the page's
 * HTML is opened by `openForEditing`, held by engine B, and every change is
 * turned back into HTML the web loads (`saveFromEngine`) before anything is
 * sent. Saved as the web saves a page: `{ node: { content: { html } } }`,
 * one second after the last change, and at once on leaving.
 *
 * What this screen does not do yet, and says so by disabling the key rather
 * than half-doing it: links, images and code blocks (the note screen's own
 * flows for those are not shared). If the engine refuses the page, or a
 * change cannot become valid HTML, nothing is sent and the screen says so.
 * A page over the size the phone can edit (EDIT_SIZE_LIMIT) is read-only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNativeEditorDocumentHandle, RichTextEditor, type RichTextEditorRef } from "@apollohg/react-native-rich-text-editor";
import { pagesKeys } from "@/api/keys";
import { pagesApi } from "@/api/pages";
import { failureMessage } from "@/api/failure";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { PagesHeader } from "@/screens/pages/parts";
import { EDIT_SIZE_LIMIT, openForEditing, saveFromEngine, type EditSession } from "@/screens/notes/editor/editSession";
import { notesEngineAtoms, notesEngineSchema } from "@/screens/notes/editor/engineSchema";
import { engineTheme } from "@/screens/notes/editor/engineTheme";
import { engineHolds } from "@/screens/notes/editor/engineHolds";
import { EditorToolbar } from "@/screens/notes/editor/EditorToolbar";
import { buildToolbar, type Command, type Panel } from "@/screens/notes/editor/toolbarModel";
import { runCommand, type EngineRef } from "@/screens/notes/editor/engineCommands";
import { toolbarLabels } from "@/screens/notes/toolbarLabels";
import type { DocNode } from "@/screens/notes/editor/types";
import { unsupported } from "@/screens/pages/pageEditor";

const SAVE_AFTER_MS = 1000;

type SaveState = "saved" | "pending" | "saving" | "failed" | "invalid";

export default function PageEditorScreen() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ spaceId: string; nodeId: string; title?: string }>();
  const spaceId = Number(params.spaceId);
  const nodeId = Number(params.nodeId);

  const page = useQuery({ queryKey: pagesKeys.node(spaceId, nodeId), queryFn: () => pagesApi.node(spaceId, nodeId), enabled: Number.isFinite(spaceId) && Number.isFinite(nodeId) });
  const html = page.data?.html ?? null;

  // Opened once per loaded body: the engine is not re-created under the person's typing.
  const [openedHtml, setOpenedHtml] = useState<string | null>(null);
  useEffect(() => {
    if (openedHtml == null && html != null) setOpenedHtml(html);
  }, [html, openedHtml]);

  const engine = useMemo(() => {
    if (openedHtml == null) return null;
    if (openedHtml.length > EDIT_SIZE_LIMIT) return { session: null, handle: null, why: "tooLong" as const };
    let session: EditSession | null = null;
    try {
      session = openForEditing(openedHtml);
      const handle = createNativeEditorDocumentHandle({
        initialization: { type: "localJson", json: session.engineDoc },
        schema: notesEngineSchema,
        policy: { allowBase64Images: true },
      } as never);
      const held = engineHolds((handle as unknown as { bridge?: Parameters<typeof engineHolds>[0] }).bridge, session.engineDoc);
      if (!held.ok) {
        handle.destroy();
        return { session, handle: null, why: "refused" as const };
      }
      return { session, handle, why: null };
    } catch {
      return { session, handle: null, why: "refused" as const };
    }
  }, [openedHtml]);
  useEffect(() => () => engine?.handle?.destroy(), [engine]);

  // ── Saving ────────────────────────────────────────────────────────────────
  const editorRef = useRef<RichTextEditorRef | null>(null);
  const engineDocRef = useRef<DocNode | null>(null);
  const lastSent = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<SaveState>("saved");

  const saving = useMutation({
    mutationFn: (body: string) => pagesApi.savePage(spaceId, nodeId, body),
    onSuccess: (node) => {
      client.setQueryData(pagesKeys.node(spaceId, nodeId), node);
      void client.invalidateQueries({ queryKey: pagesKeys.all, refetchType: "none" });
    },
  });

  const saveNow = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!engine?.session) return;
    const json = editorRef.current?.getContentJson() ?? engineDocRef.current;
    if (!json) return;
    engineDocRef.current = json as DocNode;
    const out = saveFromEngine(json as DocNode, engine.session);
    if (!out.ok) {
      setState("invalid");
      return;
    }
    if (out.html === (lastSent.current ?? openedHtml)) {
      setState("saved");
      return;
    }
    setState("saving");
    try {
      await saving.mutateAsync(out.html);
      lastSent.current = out.html;
      setState("saved");
    } catch {
      setState("failed");
    }
  }, [engine, openedHtml, saving]);

  const changed = () => {
    setState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNow(), SAVE_AFTER_MS);
  };

  // Leaving by any way saves what is pending first.
  const saveRef = useRef(saveNow);
  useEffect(() => {
    saveRef.current = saveNow;
  }, [saveNow]);
  useEffect(() => navigation.addListener("beforeRemove", () => void saveRef.current()), [navigation]);

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const barRef = useRef<View | null>(null);
  const [active, setActive] = useState<{ marks: Record<string, boolean>; nodes: Record<string, boolean> }>({ marks: {}, nodes: { paragraph: true } });
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [hasSelection, setHasSelection] = useState(false);
  const [focused, setFocused] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const labels = useMemo(() => toolbarLabels(t), [t]);
  const keys = buildToolbar({ ...active, ...history, hasSelection, panel, focused }).keys.map((k) => (unsupported(k.command) ? { ...k, disabled: true } : k));
  const onCommand = (command: Command) => {
    if (unsupported(command) || command.kind === "none") return;
    if (command.kind === "panel") {
      setPanel(command.panel);
      return;
    }
    const ref = editorRef.current as unknown as EngineRef | null;
    if (!ref) return;
    runCommand(ref, command, { nodes: active.nodes });
    if (command.kind === "color") setPanel(null);
  };

  const title = page.data?.title ?? params.title ?? "";
  const status =
    state === "saving" || state === "pending"
      ? t("pages.page.saving")
      : state === "failed"
        ? t("pages.page.failed")
        : state === "invalid"
          ? t("pages.page.invalid")
          : t("pages.page.saved");

  return (
    <Screen measure scroll={false}>
      <PagesHeader title={title} subtitle={engine?.handle ? status : null} onBack={() => void saveNow().finally(() => router.back())} />
      {page.isPending || (html != null && !engine) ? (
        <ActivityIndicator color={colors.inkMuted} style={{ marginTop: metrics.space.xl }} />
      ) : page.isError ? (
        <Text tone="danger">{failureMessage(page.error, t("pages.view.loadFailed"))}</Text>
      ) : !engine?.handle ? (
        <Text tone="muted" testID="pages-edit-cannot" style={{ paddingVertical: metrics.space.lg }}>
          {engine?.why === "tooLong" ? t("pages.page.tooLong") : t("pages.page.refused")}
        </Text>
      ) : (
        <View style={{ flex: 1 }}>
          {state === "failed" || state === "invalid" ? (
            <Text tone="danger" testID="pages-edit-problem" accessibilityLiveRegion="assertive">
              {status}
            </Text>
          ) : null}
          <View style={{ flex: 1 }}>
            <RichTextEditor
              ref={editorRef}
              documentHandle={engine.handle}
              atoms={notesEngineAtoms}
              theme={engineTheme(colors, colors.ground) as never}
              focusPreservingRefs={barRef}
              editable
              showToolbar={false}
              placeholder={t("pages.page.placeholder")}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                void saveNow();
              }}
              onActiveStateChange={(s) => setActive({ marks: { ...s.marks }, nodes: { ...s.nodes } })}
              onHistoryStateChange={(h) => setHistory({ canUndo: h.canUndo, canRedo: h.canRedo })}
              onSelectionChange={(sel) => setHasSelection(sel.type === "text" && sel.anchor !== sel.head)}
              onDocumentChange={changed}
              autoCorrect
              autoCapitalize="sentences"
              heightBehavior="fixed"
              style={{ flex: 1 }}
              containerStyle={{ flex: 1 }}
              accessibilityLabel={t("pages.page.placeholder")}
            />
          </View>
          <View ref={barRef} collapsable={false} style={{ marginHorizontal: -metrics.space.lg }}>
            <EditorToolbar keys={keys} labels={labels} colors={colors} onCommand={onCommand} />
          </View>
        </View>
      )}
    </Screen>
  );
}
