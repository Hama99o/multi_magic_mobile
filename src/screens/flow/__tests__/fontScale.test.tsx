/**
 * Hidden criterion (Hello, 2026-11-21): the board at a 200 % system font.
 *
 * A tile's height is fixed per card so the recycled list never measures
 * (`tileHeight`, the owner's list rule). Android scales a Text's fontSize AND
 * its lineHeight by the system font scale (`PixelRatio.getFontScale()`, React
 * Native's `TextAttributes.getEffectiveLineHeight`), so a box sized for two
 * 20 dp lines holds ONE line at 200 %: the title is cut in half. The rows that
 * hold text must grow with the font scale; padding and gaps do not.
 */
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { Card } from "@/api/flow";
import { CardTile } from "../parts";
import { TILE, tileHeight } from "../logic";

const RN = require("react-native");

const card: Card = {
  id: 1, projectId: 7, columnId: 1, sprintId: null, title: "A title long enough to need its second line on a phone", description: null,
  position: 0, dueDate: null, creator: { id: 1, name: "Ada" } as Card["creator"], commentsCount: 2, fieldValues: {} as Card["fieldValues"],
  createdAt: "2026-11-20T10:00:00Z", updatedAt: "2026-11-20T10:00:00Z",
};

function atScale(fontScale: number) {
  jest.spyOn(RN, "useWindowDimensions").mockReturnValue({ width: 411, height: 900, scale: 2.6, fontScale });
  render(<CardTile card={card} fields={[]} tagsByCategory={{}} people={[]} today="2026-11-21" onPress={() => undefined} testID="tile" />);
  const tile = StyleSheet.flatten(screen.getByTestId("tile").props.style);
  const title = StyleSheet.flatten(screen.getByText(card.title).props.style);
  return { tile, title };
}

afterEach(() => jest.restoreAllMocks());

it("at 100 % the tile is the height the list was told", () => {
  const { tile, title } = atScale(1);
  expect(title.height).toBe(TILE.title);
  expect(tile.height).toBe(tileHeight({ badges: false, meta: true }, 1));
});

it("at 200 % the title box holds two scaled lines, and the tile grows by what the rows grew", () => {
  const { tile, title } = atScale(2);
  expect(title.height).toBe(2 * title.lineHeight * 2);
  expect(tile.height).toBe(2 * TILE.pad + TILE.title * 2 + (TILE.meta * 2 + TILE.gap));
  // The list's arithmetic is the tile's: getItemLayout reads the same function.
  expect(tileHeight({ badges: false, meta: true }, 2)).toBe(tile.height);
});

it("a smaller system font never shrinks a row below its 100 % size (icons do not scale)", () => {
  expect(tileHeight({ badges: true, meta: true }, 0.85)).toBe(tileHeight({ badges: true, meta: true }, 1));
});
