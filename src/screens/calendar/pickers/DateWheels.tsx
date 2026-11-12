/**
 * A date far from today — a birthday — as three wheels: day · month · year
 * (iOS's own date wheel). The month grid the Calendar uses is right for "next
 * Tuesday" and wrong for 1958: it would be 800 taps of ‹.
 *
 * The day column shrinks to the month's length (31 → 30 → 28/29), and a
 * picked 31 slides to the last day that exists, so the value is never an
 * impossible date. Order follows the language: day first in French, month
 * first in English.
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Wheel, type WheelItem } from "./Wheel";

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, "0");

export function DateWheels({
  value,
  onChange,
  testID,
  label,
  maxYear,
}: {
  /** `YYYY-MM-DD`. */
  value: string;
  onChange: (value: string) => void;
  testID: string;
  label: string;
  maxYear: number;
}) {
  const { t, i18n } = useTranslation();
  const [y, m, d] = value.split("-").map(Number);
  const set = (year: number, month: number, day: number) =>
    onChange(`${year}-${pad(month)}-${pad(Math.min(day, daysIn(year, month)))}`);

  const dayItems: WheelItem<number>[] = Array.from({ length: daysIn(y, m) }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  const monthItems: WheelItem<number>[] = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(Date.UTC(2000, i, 15)).toLocaleDateString(i18n.language, { month: "short", timeZone: "UTC" }),
  }));
  const yearItems: WheelItem<number>[] = Array.from({ length: maxYear - 1900 + 1 }, (_, i) => ({ value: maxYear - i, label: String(maxYear - i) }));

  const day = <Wheel key="d" items={dayItems} value={d} onChange={(next) => set(y, m, next)} label={t("calendar.picker.day", { label })} testID={`${testID}-day`} width={56} />;
  const month = <Wheel key="m" items={monthItems} value={m} onChange={(next) => set(y, next, d)} label={t("calendar.picker.month", { label })} testID={`${testID}-month`} width={88} />;
  const year = <Wheel key="y" items={yearItems} value={y} onChange={(next) => set(next, m, d)} label={t("calendar.picker.year", { label })} testID={`${testID}-year`} width={76} />;

  return (
    <View testID={testID} style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
      {i18n.language === "fr" ? [day, month, year] : [month, day, year]}
    </View>
  );
}
