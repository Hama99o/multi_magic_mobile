/**
 * When Contacts splits into list + card (`docs/design/contacts/SPEC.md`
 * §C.11). At 800 dp and wider, a tablet in either orientation: the owner
 * saw one phone-width column on an 800 dp tablet, small and lost in the
 * middle (`docs/MISSING_FEATURES.md` row 3).
 *
 * The list pane keeps a phone's width (360–420 dp, 38 % of the screen in
 * between) so its rows, the A–Z index and the 44 dp avatars look exactly as
 * on a phone; the card takes the rest.
 */
import { useWindowDimensions } from "react-native";

export const SPLIT_AT = 800;
const PANE_MIN = 360;
const PANE_MAX = 420;

export function isSplit(width: number): boolean {
  return width >= SPLIT_AT;
}

export function listPaneWidth(width: number): number {
  return Math.round(Math.min(PANE_MAX, Math.max(PANE_MIN, width * 0.38)));
}

export interface Split {
  split: boolean;
  paneWidth: number;
}

export function splitFor(width: number): Split {
  return { split: isSplit(width), paneWidth: listPaneWidth(width) };
}

/** Re-renders on rotation: `useWindowDimensions` follows the window. */
export function useSplit(): Split {
  return splitFor(useWindowDimensions().width);
}
