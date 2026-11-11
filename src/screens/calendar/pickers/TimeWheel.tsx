/**
 * Hours · minutes (· AM/PM): two columns in a 24-hour language, three in a
 * 12-hour one (Evernote vs WhatsApp, SPEC §B). The value is always "HH:MM"
 * on 24 hours; only the display follows the language (`uses12h`).
 *
 * Minutes step by five — every reference does — but a value that is not on
 * the step (an event made on the web at 14:07) keeps its own minute as a row,
 * so opening the wheel never silently moves a time.
 */
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Wheel, type WheelItem } from "./Wheel";
import { uses12h } from "../dates";

const pad = (value: number) => String(value).padStart(2, "0");

/** "AM"/"PM" in the app's language, read off the platform's own formatter. */
function periodLabel(hour: number, language: string): string {
  const text = new Date(2000, 0, 1, hour).toLocaleTimeString(language, { hour: "numeric", hour12: true });
  return text.replace(/[\d\s ]/g, "") || (hour < 12 ? "AM" : "PM");
}

export function TimeWheel({ value, onChange, testID, label }: { value: string; onChange: (value: string) => void; testID: string; label: string }) {
  const { t, i18n } = useTranslation();
  const [hours, minutes] = value.split(":").map(Number);
  const h = Number.isFinite(hours) ? hours : 9;
  const m = Number.isFinite(minutes) ? minutes : 0;
  const twelve = uses12h(i18n.language);

  const minuteValues = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!minuteValues.includes(m)) minuteValues.push(m);
  minuteValues.sort((a, b) => a - b);
  const minuteItems: WheelItem<number>[] = minuteValues.map((value) => ({ value, label: pad(value) }));

  const set = (hour: number, minute: number) => onChange(`${pad(hour)}:${pad(minute)}`);

  if (!twelve) {
    const hourItems: WheelItem<number>[] = Array.from({ length: 24 }, (_, value) => ({ value, label: pad(value) }));
    return (
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }} testID={testID}>
        <Wheel items={hourItems} value={h} onChange={(hour) => set(hour, m)} label={t("calendar.picker.hours", { label })} testID={`${testID}-hour`} />
        <Wheel items={minuteItems} value={m} onChange={(minute) => set(h, minute)} label={t("calendar.picker.minutes", { label })} testID={`${testID}-minute`} />
      </View>
    );
  }

  const pm = h >= 12;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const hourItems: WheelItem<number>[] = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  const periodItems: WheelItem<string>[] = [
    { value: "am", label: periodLabel(9, i18n.language) },
    { value: "pm", label: periodLabel(15, i18n.language) },
  ];
  const to24 = (hour: number, isPm: boolean) => (hour % 12) + (isPm ? 12 : 0);

  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }} testID={testID}>
      <Wheel items={hourItems} value={hour12} onChange={(hour) => set(to24(hour, pm), m)} label={t("calendar.picker.hours", { label })} testID={`${testID}-hour`} />
      <Wheel items={minuteItems} value={m} onChange={(minute) => set(h, minute)} label={t("calendar.picker.minutes", { label })} testID={`${testID}-minute`} />
      <Wheel items={periodItems} value={pm ? "pm" : "am"} onChange={(period) => set(to24(hour12, period === "pm"), m)} label={t("calendar.picker.period", { label })} testID={`${testID}-period`} />
    </View>
  );
}
