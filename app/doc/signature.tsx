/**
 * NEW OR EDITED SIGNATURE: draw it, or type it in a script font
 * (SPEC §C.4; web `SignaturePad.tsx`, `TypeSignature.tsx`).
 *
 * Saved without a PNG: the server draws the picture from the strokes or the
 * text (G7), in the same six fonts as here. Leaving with unsaved ink asks
 * first. `?id=` edits an existing one, restoring its strokes or text.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, TextInput, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { GestureHandlerRootView, ScrollView } from "react-native-gesture-handler";
import type { SignatureInput, Stroke } from "@/api/doc";
import { Screen } from "@/components/ScreenContainer";
import { AppHeader } from "@/components/shell/AppHeader";
import { Button } from "@/components/reusables/button";
import { Text } from "@/components/reusables/text";
import { Undo2, Trash2 } from "@/components/icons";
import { useColors, useMetrics } from "@/hooks/useColors";
import { SignaturePad } from "@/screens/doc/SignaturePad";
import { Chip, SectionLabel, Segmented, Stepper, Swatches } from "@/screens/doc/controls";
import { DRAW_BACKGROUNDS, PEN_COLORS, THICKNESS, TYPE_BACKGROUNDS, fitStrokes, hasInk } from "@/screens/doc/strokes";
import { SIGNATURE_FONTS, fontFor, useSignatureFonts } from "@/screens/doc/fonts";
import { nextSignatureName, useSaveSignature, useSignatures } from "@/screens/doc/useSignatures";

const FONT_MIN = 40;
const FONT_MAX = 120;
const FONT_STEP = 8;

export default function SignatureCreator() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const list = useSignatures();
  const editing = useMemo(() => (editingId ? (list.data?.rows.find((s) => s.id === editingId) ?? null) : null), [editingId, list.data]);
  const fontsReady = useSignatureFonts();
  const save = useSaveSignature();

  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [padSize, setPadSize] = useState({ width: 0, height: 0 });
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0].value);
  const [thickness, setThickness] = useState<number>(THICKNESS[1].value);
  const [brush, setBrush] = useState<"pen" | "pencil">("pen");
  const [drawBg, setDrawBg] = useState<string>(DRAW_BACKGROUNDS[3].value);
  const [text, setText] = useState("");
  const [font, setFont] = useState(SIGNATURE_FONTS[0]);
  const [textColor, setTextColor] = useState<string>(PEN_COLORS[0].value);
  const [typeBg, setTypeBg] = useState<string>(TYPE_BACKGROUNDS[0].value);
  const [fontSize, setFontSize] = useState(72);
  const [restored, setRestored] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const padHeight = width >= 600 ? 300 : 220;

  // Restore what is being edited, once, and once the pad knows its size.
  useEffect(() => {
    if (restored || !editing) return;
    if (editing.kind === "type") {
      setMode("type");
      setText(editing.text ?? "");
      setFont(fontFor(editing.font));
      setTextColor(editing.color ?? PEN_COLORS[0].value);
      setTypeBg(editing.bgColor);
      setFontSize(editing.fontSize ?? 72);
      setRestored(true);
    } else if (padSize.width > 0) {
      setMode("draw");
      setStrokes(fitStrokes(editing.strokes, { width: editing.width, height: editing.height }, padSize));
      setDrawBg(editing.bgColor);
      setRestored(true);
    }
  }, [editing, padSize, restored]);

  const ready = mode === "draw" ? hasInk(strokes) : text.trim().length > 0;

  const leave = () => {
    if (!dirty) return router.back();
    Alert.alert(t("doc.creator.discardTitle"), t("doc.creator.discardBody"), [
      { text: t("doc.creator.keep"), style: "cancel" },
      { text: t("doc.creator.discard"), style: "destructive", onPress: () => router.back() },
    ]);
  };

  const onSave = () => {
    if (!ready) return;
    setFailed(false);
    const name = editing?.name ?? nextSignatureName(list.data?.rows ?? [], (n) => t("doc.signatures.defaultName", { n }));
    const input: SignatureInput =
      mode === "draw"
        ? { name, kind: "draw", strokes, width: padSize.width, height: padSize.height, bgColor: drawBg, active: editing?.active }
        : { name, kind: "type", text: text.trim(), font: font.css, color: textColor, fontSize, bgColor: typeBg, active: editing?.active };
    save.mutate(
      { id: editing?.id ?? null, input },
      {
        onSuccess: () => {
          setDirty(false);
          router.back();
        },
        onError: () => setFailed(true),
      },
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Screen measure avoidKeyboard header={<AppHeader app="doc" title={editingId ? t("doc.creator.editTitle") : t("doc.creator.newTitle")} back onBack={leave} />}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: metrics.space.lg, paddingVertical: metrics.space.md }} scrollEnabled={!drawing}>
          <Segmented
            testID="doc-creator-mode"
            value={mode}
            onChange={setMode}
            options={[
              { key: "draw", label: t("doc.creator.draw") },
              { key: "type", label: t("doc.creator.type") },
            ]}
          />

          {mode === "draw" ? (
            <>
              <SignaturePad
                strokes={strokes}
                onChange={(next) => {
                  setStrokes(next);
                  setDirty(true);
                }}
                color={penColor}
                size={thickness}
                brush={brush}
                background={drawBg}
                height={padHeight}
                onLayoutSize={setPadSize}
                onDrawing={setDrawing}
              />
              <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
                <Chip testID="doc-creator-undo" icon={Undo2} label={t("doc.creator.undo")} selected={false} disabled={strokes.length === 0} onPress={() => setStrokes((s) => s.slice(0, -1))} />
                <Chip testID="doc-creator-clear" icon={Trash2} label={t("doc.creator.clear")} selected={false} disabled={strokes.length === 0} onPress={() => setStrokes([])} />
              </View>
              <SectionLabel>{t("doc.creator.feel")}</SectionLabel>
              <View style={{ flexDirection: "row", gap: metrics.space.sm }}>
                <Chip testID="doc-creator-pen" label={t("doc.creator.pen")} selected={brush === "pen"} onPress={() => setBrush("pen")} />
                <Chip testID="doc-creator-pencil" label={t("doc.creator.pencil")} selected={brush === "pencil"} onPress={() => setBrush("pencil")} />
              </View>
              <SectionLabel>{t("doc.creator.penColor")}</SectionLabel>
              <Swatches testID="doc-creator-pen-color" values={PEN_COLORS} value={penColor} onChange={setPenColor} />
              <SectionLabel>{t("doc.creator.thickness")}</SectionLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
                {THICKNESS.map((k) => (
                  <Chip key={k.value} testID={`doc-creator-thickness-${k.value}`} label={t(k.label)} selected={thickness === k.value} onPress={() => setThickness(k.value)} />
                ))}
              </View>
              <SectionLabel>{t("doc.creator.background")}</SectionLabel>
              <Swatches
                testID="doc-creator-draw-bg"
                values={DRAW_BACKGROUNDS}
                value={drawBg}
                onChange={(v) => {
                  setDrawBg(v);
                  setDirty(true);
                }}
              />
            </>
          ) : (
            <>
              <TextInput
                testID="doc-creator-text"
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  setDirty(true);
                }}
                placeholder={t("doc.creator.typePlaceholder")}
                placeholderTextColor={colors.inkMuted}
                accessibilityLabel={t("doc.creator.yourName")}
                maxLength={60}
                style={{ minHeight: metrics.touch, borderWidth: 1, borderColor: colors.border, borderRadius: metrics.radius.md, paddingHorizontal: metrics.space.md, color: colors.ink, fontSize: 16, backgroundColor: colors.surface }}
              />
              <View
                testID="doc-creator-preview"
                style={{
                  minHeight: padHeight * 0.7,
                  borderRadius: metrics.radius.md,
                  borderWidth: 1,
                  borderStyle: typeBg === "transparent" ? "dashed" : "solid",
                  borderColor: colors.border,
                  backgroundColor: typeBg === "transparent" ? "#ffffff" : typeBg,
                  alignItems: "center",
                  justifyContent: "center",
                  padding: metrics.space.lg,
                }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.3}
                  style={{ fontFamily: fontsReady ? font.family : undefined, fontSize: Math.min(fontSize, 96), lineHeight: Math.min(fontSize, 96) * 1.35, color: textColor }}
                >
                  {text.trim() || t("doc.creator.yourName")}
                </Text>
              </View>
              <SectionLabel>{t("doc.creator.fontStyle")}</SectionLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
                {SIGNATURE_FONTS.map((f) => (
                  <Chip
                    key={f.family}
                    testID={`doc-creator-font-${f.label.replace(" ", "")}`}
                    label={f.label}
                    fontFamily={fontsReady ? f.family : undefined}
                    selected={font.family === f.family}
                    onPress={() => {
                      setFont(f);
                      setDirty(true);
                    }}
                  />
                ))}
              </View>
              <SectionLabel>{t("doc.creator.color")}</SectionLabel>
              <Swatches testID="doc-creator-text-color" values={PEN_COLORS} value={textColor} onChange={setTextColor} />
              <SectionLabel>{t("doc.creator.background")}</SectionLabel>
              <Swatches testID="doc-creator-type-bg" values={TYPE_BACKGROUNDS} value={typeBg} onChange={setTypeBg} />
              <Stepper
                testID="doc-creator-size"
                label={t("doc.creator.size")}
                value={t("doc.creator.sizeValue", { n: fontSize })}
                minusLabel={t("doc.creator.smaller")}
                plusLabel={t("doc.creator.bigger")}
                onMinus={() => setFontSize((s) => Math.max(FONT_MIN, s - FONT_STEP))}
                onPlus={() => setFontSize((s) => Math.min(FONT_MAX, s + FONT_STEP))}
              />
            </>
          )}

          {failed ? (
            <Text tone="danger" accessibilityLiveRegion="assertive" testID="doc-creator-failed">
              {t("doc.creator.failed")}
            </Text>
          ) : !ready && dirty ? (
            <Text tone="muted" variant="caption">
              {t("doc.creator.empty")}
            </Text>
          ) : null}
          <Button testID="doc-creator-save" label={editingId ? t("doc.creator.saveChanges") : t("doc.creator.save")} disabled={!ready} busy={save.isPending} onPress={onSave} />
        </ScrollView>
      </Screen>
    </GestureHandlerRootView>
  );
}
