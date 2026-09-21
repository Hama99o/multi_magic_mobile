/**
 * THE ONE ANIMATION IN THIS APP, and the two things it must not do.
 *
 * His words, two days old and untouched until now: *"mm mobile miss animation
 * man."* What is asserted here is not that it looks nice — no gate in this
 * repo can see a pixel — but that it cannot hurt anybody: a row that is not
 * arriving never flickers, and somebody who has asked their phone for less
 * movement gets none.
 */
import { render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";
import { Arriving } from "../Arriving";

const child = <Text>a message</Text>;

afterEach(() => jest.restoreAllMocks());

describe("a row that is not the newest", () => {
  /**
   * A FlatList mounts rows as they scroll into view. If those faded, the whole
   * history would flicker under a finger — which is worse than no animation
   * and is the reason this takes a prop at all.
   */
  it("is on screen synchronously, with nothing to wait for", () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    render(<Arriving arriving={false}>{child}</Arriving>);

    // No `await`: a row that is not arriving must be visible in the first
    // paint rather than after an accessibility round trip.
    expect(screen.getByText("a message")).toBeTruthy();
  });

  /**
   * This first read `expect(isReduceMotionEnabled).not.toHaveBeenCalled()` and
   * failed with one call — which was NOT this component. React Native calls it
   * once on any render at all: a bare `render(<Text/>)` with no `Arriving` in
   * the tree shows the same single call. The assertion was coupled to the
   * framework rather than to the code under test, which is a test that fails
   * for a reason nobody can act on.
   */
  it("does not fade — the opacity it starts at is the opacity it keeps", () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    const { toJSON } = render(<Arriving arriving={false}>{child}</Arriving>);
    const tree = JSON.stringify(toJSON());

    // The animated value is 1 from construction and is only ever set to 0 on
    // the arriving path, so a non-arriving row cannot flicker.
    expect(tree).toContain('"opacity":1');
  });
});

describe("reduce motion", () => {
  /**
   * `docs/ACCESSIBILITY.md`: somebody who has asked their phone for less
   * movement has asked for a reason. The message must still arrive — it just
   * must not move.
   */
  it("leaves the opacity alone entirely", async () => {
    const reduce = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);
    const { toJSON } = render(<Arriving arriving>{child}</Arriving>);

    await waitFor(() => expect(reduce).toHaveBeenCalled());
    // NOT just "the message is there" — that is true whether the guard exists
    // or not, and the first version of this test said exactly that and passed
    // with the guard deleted. The claim is that nothing was animated: the
    // value is never set to 0, so it is still 1 after the check resolves.
    expect(JSON.stringify(toJSON())).toContain('"opacity":1');
  });

  it("still shows the message when the setting cannot be read at all", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockRejectedValue(new Error("no accessibility service"));
    render(<Arriving arriving>{child}</Arriving>);

    // A message that never becomes visible is a far worse failure than one
    // that appears without a fade.
    await waitFor(() => expect(screen.getByText("a message")).toBeTruthy());
  });
});

describe("the newest row", () => {
  it("asks about reduce motion before moving anything", async () => {
    const reduce = jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
    render(<Arriving arriving>{child}</Arriving>);

    await waitFor(() => expect(reduce).toHaveBeenCalled());
    expect(screen.getByText("a message")).toBeTruthy();
  });

  /** The content is the point; the fade is decoration over it. */
  it("renders its children either way", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
    render(<Arriving arriving>{child}</Arriving>);
    await waitFor(() => expect(screen.getByText("a message")).toBeTruthy());
  });
});
