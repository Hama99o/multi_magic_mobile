/**
 * A RICH PAGE, EDITED (parity audit #50; web `NodeViewer` + `PageEditor`).
 *
 * The same engine and codec as a note (`screens/notes/editor`): the page's
 * HTML is opened by `openForEditing`, held by engine B, and every change is
 * turned back into HTML the web loads (`saveFromEngine`) before anything is
 * sent. Saved as the web saves a page: `{ node: { content: { html } } }`,
 * one second after the last change, and at once on leaving.
 *
 * The toolbar is the note's, whole: links, images (the web's editor upload
 * route) and code blocks with their language, done exactly as the note screen
 * does them. Only the note-record keys are left out (`forPage`). If the
 * engine refuses the page, or a change cannot become valid HTML, nothing is
 * sent and the screen says so.
 * A page over the size the phone can edit (EDIT_SIZE_LIMIT) is read-only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useNavigation } from "expo-router";
import { useNav, useNavParams } from "@/lib/nav";
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
import { forPage, linkHref } from "@/screens/pages/pageEditor";
import { CodeLanguageSheet, LinkDialog } from "@/screens/pages/PageEditorSheets";
import { deleteBlockAt, setCodeLanguageAt, textblockAt, toCodeBlockAt, toParagraphAt } from "@/screens/notes/editor/blockEdits";
import { imageNode } from "@/screens/notes/editor/imageNode";
import { toEngine } from "@/screens/notes/editor/engineGlue";
import { imageProblem, imagesApi } from "@/api/images";
import * as ImagePicker from "expo-image-picker";

const SAVE_AFTER_MS = 1000;

type SaveState = "saved" | "pending" | "saving" | "failed" | "invalid";

export default function PageEditorScreen() {
  const router = useNav();
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigation = useNavigation();
  const params = useNavParams<{ spaceId: string; nodeId: string; title?: string }>();
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
  const [caretPos, setCaretPos] = useState<number | null>(null);
  const caretScalar = useRef<{ anchor: number; head: number } | null>(null);
  const [linking, setLinking] = useState(false);
  const [codeSheet, setCodeSheet] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageFailed, setImageFailed] = useState<string | null>(null);

  // Which block the caret is in (a code block shows its language key) needs
  // the document: read again shortly after the caret settles, not per key.
  const docTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setDocTick] = useState(0);
  const refreshDoc = () => {
    if (docTimer.current) clearTimeout(docTimer.current);
    docTimer.current = setTimeout(() => {
      const json = editorRef.current?.getContentJson();
      if (json) {
        engineDocRef.current = json as DocNode;
        setDocTick((n) => n + 1);
      }
    }, 250);
  };
  useEffect(() => () => {
    if (docTimer.current) clearTimeout(docTimer.current);
  }, []);

  /** The engine's document as it is now, typing included. */
  const currentDoc = (): DocNode | null => (editorRef.current?.getContentJson() as DocNode | undefined) ?? engineDocRef.current;
  const caretBlockIn = (doc: DocNode | null) => (caretPos !== null && doc ? textblockAt(doc, caretPos) : null);
  // Read at render from the last document we saw; the commands re-read it fresh.
  const caretBlock = caretBlockIn(engineDocRef.current);
  const headingLevel = caretBlock?.node.type === "heading" ? Number(caretBlock.node.attrs?.level ?? 1) : undefined;
  const codeLanguage = caretBlock?.node.type === "codeBlock" ? ((caretBlock.node.attrs?.language as string | null) ?? null) : undefined;
  const nodesForBar = caretBlock ? { ...active.nodes, codeBlock: caretBlock.node.type === "codeBlock" } : active.nodes;
  const keys = forPage(buildToolbar({ ...active, nodes: nodesForBar, ...history, hasSelection, panel, headingLevel, codeLanguage, focused }).keys);

  /** A structural edit the engine has no command for (code blocks), as the note screen does it. */
  const applyStructural = (edit: (doc: DocNode, path: number[]) => DocNode) => {
    const ref = editorRef.current;
    const doc = currentDoc();
    const block = caretBlockIn(doc);
    if (!ref || !doc || !block) return;
    const next = edit(doc, block.path);
    if (next === doc) return;
    try {
      ref.setContentJson(next as never);
    } catch {
      return; // the engine refused it against its schema: the page stays as it was
    }
    engineDocRef.current = next;
    changed();
    // The engine puts the caret at the start after a whole-document replace: put it back.
    const at = caretScalar.current;
    if (at) {
      setTimeout(() => {
        try {
          (ref as unknown as { setTextSelection(anchor: number, head: number): void }).setTextSelection(at.anchor, at.head);
          ref.focus();
        } catch {
          // a position the new document cannot hold: the caret stays where the engine put it
        }
      }, 150);
    }
  };

  // Insert > Image: the web's editor upload route, then the web's image node at the caret.
  const insertImage = async () => {
    setImageFailed(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setImageFailed(t("notes.edit.image.denied"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      const problem = imageProblem({ mimeType: asset.mimeType, fileSize: asset.fileSize });
      if (problem) {
        setImageFailed(t(problem === "size" ? "notes.edit.image.tooBig" : "notes.edit.image.wrongType"));
        return;
      }
      const name = asset.fileName || `image.${asset.mimeType!.split("/")[1]}`;
      setImageBusy(true);
      const url = await imagesApi.upload({ uri: asset.uri, name, mimeType: asset.mimeType! });
      const ref = editorRef.current;
      if (!ref) return;
      ref.insertContentJson(toEngine({ type: "doc", content: [imageNode({ url, name, size: asset.fileSize ?? undefined })] }) as never);
    } catch (e) {
      setImageFailed(failureMessage(e, t("notes.edit.image.failed")));
    } finally {
      setImageBusy(false);
    }
  };

  const saveLink = (typed: string) => {
    const ref = editorRef.current;
    const href = linkHref(typed);
    if (ref) {
      if (href) ref.setLink(href);
      else ref.unsetLink();
    }
    setLinking(false);
  };

  const onCommand = (command: Command) => {
    const block = caretBlockIn(currentDoc());
    if (command.kind === "panel") {
      if (command.panel === "codeLanguage") setCodeSheet(true);
      else setPanel(command.panel);
      return;
    }
    if (command.kind === "block" && command.value === "codeBlock") {
      if (block && block.node.type !== "codeBlock") applyStructural(toCodeBlockAt);
      return;
    }
    if (command.kind === "block" && block?.node.type === "codeBlock") {
      applyStructural(toParagraphAt);
      if (command.value === "paragraph") return;
    }
    if (command.kind === "link") {
      setLinking(true);
      return;
    }
    if (command.kind === "insert" && command.value === "image") {
      void insertImage();
      return;
    }
    if (command.kind === "none" || command.kind === "sheet") return;
    const ref = editorRef.current as unknown as EngineRef | null;
    if (!ref) return;
    const level = block?.node.type === "heading" ? Number(block.node.attrs?.level ?? 1) : undefined;
    runCommand(ref, command, { nodes: block ? { ...active.nodes, codeBlock: block.node.type === "codeBlock" } : active.nodes, headingLevel: level });
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
          {imageBusy ? (
            <View testID="pages-edit-image-busy" style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm }} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.inkMuted} />
              <Text tone="muted">{t("notes.edit.image.uploading")}</Text>
            </View>
          ) : null}
          {imageFailed ? (
            <Text tone="danger" testID="pages-edit-image-failed" accessibilityLiveRegion="polite">
              {imageFailed}
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
              onSelectionChange={(sel) => {
                setHasSelection(sel.type === "text" && sel.anchor !== sel.head);
                setCaretPos(typeof sel.head === "number" ? sel.head : null);
                refreshDoc();
                caretScalar.current = typeof sel.anchorScalar === "number" && typeof sel.headScalar === "number" ? { anchor: sel.anchorScalar, head: sel.headScalar } : null;
              }}
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
          <LinkDialog open={linking} onCancel={() => setLinking(false)} onSave={saveLink} />
          <CodeLanguageSheet
            open={codeSheet}
            current={codeLanguage ?? null}
            onPick={(language) => {
              applyStructural((doc, path) => setCodeLanguageAt(doc, path, language));
              setCodeSheet(false);
            }}
            onDelete={() => {
              applyStructural(deleteBlockAt);
              setCodeSheet(false);
            }}
            onClose={() => setCodeSheet(false)}
          />
        </View>
      )}
    </Screen>
  );
}
