/** A list's progress as a ring (Amie 01): the done share of its tasks, in the app colour. */
import Svg, { Circle as SvgCircle } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { APP_COLORS } from "@/theme/appColors";

export function ProgressRing({ done, total, size = 40 }: { done: number; total: number; size?: number }) {
  const colors = useColors();
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? done / total : 0;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
      <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
      {pct > 0 ? <SvgCircle cx={size / 2} cy={size / 2} r={r} stroke={APP_COLORS.todos} strokeWidth={stroke} fill="none" strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" /> : null}
    </Svg>
  );
}
