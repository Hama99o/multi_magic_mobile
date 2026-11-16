import { dropIndex } from "../DragList";

describe("dropIndex: where a dragged task lands", () => {
  const rows = [56, 80, 56, 56];
  it("stays put until half the next row is passed", () => {
    expect(dropIndex(rows, 0, 39)).toBe(0);
    expect(dropIndex(rows, 0, 41)).toBe(1);
  });
  it("crosses several rows of different heights", () => {
    expect(dropIndex(rows, 0, 80 + 29)).toBe(2);
    expect(dropIndex(rows, 3, -(56 + 41))).toBe(1);
  });
  it("never leaves the list", () => {
    expect(dropIndex(rows, 0, 9999)).toBe(3);
    expect(dropIndex(rows, 2, -9999)).toBe(0);
  });
});
