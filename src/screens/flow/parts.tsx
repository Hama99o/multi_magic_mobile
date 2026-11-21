/**
 * Flow's small parts, shared by its screens: the project badge, avatars, the
 * priority badge, a card's tile, the segmented control, colour swatches and
 * the empty state.
 *
 * ── THE TILE HAS A STABLE HEIGHT, AND NO ANIMATION ────────────────────────
 * Owner rule (2026-11-17, ~/.claude/CLAUDE.md "Mobile lists"): no Reanimated
 * layout or transform animation on a cell of a recycled list, and cells keep
 * a stable measured height. A tile is always the same rows (a meta row that
 * is empty still takes its height, the title is clamped to two lines), so a
 * column scrolls without rows jumping or overlapping.
 */
import { useState, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import type { Card, FlowRole, Person } from "@/api/flow";
import type { FieldDefinition, Tag } from "@/api/fields";
import { Calendar, Check, Kanban, MessageSquare, type LucideIcon } from "@/components/icons";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";
import { formatDay } from "@/screens/calendar/dates";
import { TILE, assigneesOf, colorHex, dueOf, initials, isOverdue, labelsOf, priorityOf, textScale, tileHeight, tileShape } from "./logic";

export const FLOW_COLOR = APP_COLORS.flow;
/** The dark glyph every app badge uses on its solid colour (`appColors.ts` GLYPH). */
export const ON_FLOW = "#04161a";

export function ProjectBadge({ color, size = 40 }: { color: string | null; size?: number }) {
  const hex = colorHex(color) ?? FLOW_COLOR;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: `${hex}33`, borderWidth: 1, borderColor: `${hex}88`, alignItems: "center", justifyContent: "center" }}>
      <Kanban size={size * 0.5} color={hex} />
    </View>
  );
}

export function Avatar({ name, size = 24, ring }: { name: string; size?: number; ring?: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: ring ? 2 : 0,
        borderColor: ring,
      }}
    >
      <Text style={{ fontSize: size * 0.42, lineHeight: size * 0.55, fontWeight: "700" }}>{initials(name)}</Text>
    </View>
  );
}

export function Pill({ label, color, testID }: { label: string; color: string; testID?: string }) {
  return (
    <View testID={testID} style={{ paddingHorizontal: 8, minHeight: 22, justifyContent: "center", borderRadius: 11, backgroundColor: `${color}26`, borderWidth: 1, borderColor: `${color}66` }}>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: "600", color }}>
        {label}
      </Text>
    </View>
  );
}

export function RolePill({ role }: { role: FlowRole }) {
  const { t } = useTranslation();
  const colors = useColors();
  return <Pill testID={`role-${role}`} label={t(`flow.roles.${role}`)} color={role === "owner" ? FLOW_COLOR : colors.inkMuted} />;
}

/**
 * A card on the board. Its height is known before it is drawn
 * (`tileHeight(tileShape(…))` in `logic.ts`): a two-line title box, and the
 * badge row and the meta row only when the card has something to put in them.
 */
export function CardTile({
  card,
  fields,
  tagsByCategory,
  people,
  today,
  onPress,
  onLongPress,
  testID,
}: {
  card: Card;
  fields: FieldDefinition[];
  tagsByCategory: Record<number, Tag[]>;
  people: Person[];
  today: string;
  onPress: () => void;
  onLongPress?: () => void;
  testID: string;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t, i18n } = useTranslation();
  const [pressed, setPressed] = useState(false);
  const priority = priorityOf(card, fields);
  const due = dueOf(card, fields);
  const late = isOverdue(due, today);
  const labels = labelsOf(card, fields, tagsByCategory);
  const assignees = assigneesOf(card, fields, people);
  const shape = tileShape(card, fields, tagsByCategory, people);
  const { fontScale } = useWindowDimensions();
  const k = textScale(fontScale);
  const pending = card.id < 0;

  const parts = [
    card.title,
    priority ? t("flow.tile.priority", { priority: priority.label }) : null,
    due ? t(late ? "flow.tile.overdue" : "flow.tile.due", { date: formatDay(due, i18n.language) }) : null,
    assignees.length ? t("flow.tile.assignees", { names: assignees.map((a) => a.name).join(", ") }) : null,
    card.commentsCount ? t("flow.tile.comments", { count: card.commentsCount }) : null,
    labels.length ? labels.map((l) => l.label).join(", ") : null,
  ].filter(Boolean);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      disabled={pending}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={parts.join(". ")}
      accessibilityHint={onLongPress ? t("flow.tile.hint") : undefined}
      style={{
        height: tileHeight(shape, fontScale),
        padding: TILE.pad,
        gap: TILE.gap,
        borderRadius: metrics.radius.md,
        backgroundColor: pressed ? colors.border : colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pending ? 0.6 : 1,
      }}
    >
      {shape.badges ? (
      <View style={{ flexDirection: "row", gap: 4, height: TILE.badges * k, overflow: "hidden" }}>
        {priority ? <Pill label={priority.label} color={priority.color ?? colors.inkMuted} /> : null}
        {labels.slice(0, 3).map((l) => (
          <View key={l.id} style={{ paddingHorizontal: 6, height: TILE.badges * k, justifyContent: "center", borderRadius: 4, backgroundColor: `${l.color ?? colors.inkMuted}33` }}>
            <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: "600", color: colors.ink, maxWidth: 90 }}>
              {l.label}
            </Text>
          </View>
        ))}
      </View>
      ) : null}
      <Text numberOfLines={2} style={{ fontWeight: "600", fontSize: 15, lineHeight: 20, height: TILE.title * k }}>
        {card.title}
      </Text>
      {shape.meta ? (
      <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.space.sm, height: TILE.meta * k }}>
        {due ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Calendar size={13} color={late ? colors.danger : colors.inkMuted} />
            <Text variant="caption" tone={late ? "danger" : "muted"} style={{ fontWeight: late ? "600" : "400" }}>
              {formatDay(due, i18n.language)}
            </Text>
          </View>
        ) : null}
        {card.commentsCount ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <MessageSquare size={13} color={colors.inkMuted} />
            <Text variant="caption" tone="muted">
              {String(card.commentsCount)}
            </Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row" }}>
          {assignees.slice(0, 3).map((a, i) => (
            <View key={a.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
              <Avatar name={a.name} size={22} ring={colors.surface} />
            </View>
          ))}
        </View>
      </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Each option as wide as its label, the rest shared out: equal thirds cut
 * "Commentaires (1)" to "Commentaire…" in French at 411 dp (device, 2026-11-20).
 */
export function Segmented<T extends string>({ value, options, onChange, testID }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID={testID} accessibilityRole="tablist" style={{ flexDirection: "row", padding: 3, borderRadius: metrics.radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testID}-${o.value}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={{ flexGrow: 1, flexShrink: 1, flexBasis: "auto", minHeight: 40, borderRadius: metrics.radius.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: metrics.space.md, backgroundColor: on ? colors.accent : "transparent" }}
          >
            <Text variant="label" tone={on ? "onAccent" : "muted"} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A row of colour swatches (≥ 44 dp each, the touch floor). `none` adds a "no colour" swatch. */
export function Swatches({ colors: hexes, value, onPick, none = false, testID, labelOf }: { colors: readonly { key: string; hex: string }[]; value: string | null; onPick: (key: string | null) => void; none?: boolean; testID: string; labelOf: (key: string) => string }) {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  return (
    <View testID={testID} style={{ flexDirection: "row", flexWrap: "wrap", gap: metrics.space.sm }}>
      {none ? (
        <Pressable testID={`${testID}-none`} onPress={() => onPick(null)} accessibilityRole="radio" accessibilityState={{ checked: value == null }} accessibilityLabel={t("flow.color.none")} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: value == null ? colors.ink : colors.border, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 24, height: 2, backgroundColor: colors.inkMuted, transform: [{ rotate: "-45deg" }] }} />
        </Pressable>
      ) : null}
      {hexes.map((c) => {
        const on = value === c.key;
        return (
          <Pressable
            key={c.key}
            testID={`${testID}-${c.key.replace("#", "")}`}
            onPress={() => onPick(c.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={labelOf(c.key)}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.hex, alignItems: "center", justifyContent: "center", borderWidth: on ? 3 : 0, borderColor: colors.ink }}
          >
            {on ? <Check size={20} color={ON_FLOW} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({ icon: Icon, title, body, action, testID }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode; testID: string }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <View testID={testID} style={{ alignItems: "center", gap: metrics.space.sm, paddingVertical: metrics.space.xl, paddingHorizontal: metrics.space.lg }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${FLOW_COLOR}2e`, alignItems: "center", justifyContent: "center", marginBottom: metrics.space.sm }}>
        <Icon size={36} color={colors.ink} />
      </View>
      <Text variant="title" style={{ textAlign: "center", fontSize: 20, lineHeight: 26 }} testID={`${testID}-title`}>
        {title}
      </Text>
      {body ? (
        <Text tone="muted" style={{ textAlign: "center" }}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function PrimaryPill({ label, onPress, testID, icon: Icon }: { label: string; onPress: () => void; testID: string; icon?: LucideIcon }) {
  const metrics = useMetrics();
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ marginTop: metrics.space.sm, minHeight: 44, flexDirection: "row", gap: 6, paddingHorizontal: metrics.space.lg, borderRadius: metrics.radius.pill, backgroundColor: FLOW_COLOR, alignItems: "center", justifyContent: "center" }}>
      {Icon ? <Icon size={18} color={ON_FLOW} /> : null}
      <Text variant="label" style={{ color: ON_FLOW }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A tappable chip in a filter row. */
export function FilterChip({ label, active, onPress, testID, icon: Icon, dot }: { label: string; active: boolean; onPress: () => void; testID: string; icon?: LucideIcon; dot?: string | null }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: metrics.space.md, borderRadius: metrics.radius.pill, borderWidth: 1, borderColor: active ? colors.accent : colors.border, backgroundColor: active ? `${colors.accent}22` : colors.surface }}
    >
      {Icon ? <Icon size={15} color={active ? colors.accent : colors.inkMuted} /> : null}
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text variant="label" numberOfLines={1} style={{ maxWidth: 180, color: active ? colors.accent : colors.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}
