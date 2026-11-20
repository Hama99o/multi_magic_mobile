/**
 * The swipe on a list row (Hello for the owner, 2026-11-20, after a device
 * pass saw a "half" swipe delete a second expense): a partial swipe REVEALS
 * the action's button, only a long swipe (60% of the row or more) acts at
 * once, and anything short of the reveal springs back.
 */
import { REVEAL, releaseOutcome } from "../swipeRow";

const W = 400;

it("a short swipe springs back; nothing happens", () => {
  expect(releaseOutcome(-40, W, { right: false })).toEqual({ act: null, rest: 0 });
});

it("a partial swipe opens on the button and does NOT act (the device pass's 20% swipe)", () => {
  expect(releaseOutcome(-0.2 * W, W, { right: false })).toEqual({ act: null, rest: -REVEAL });
  expect(releaseOutcome(-0.5 * W, W, { right: false })).toEqual({ act: null, rest: -REVEAL });
});

it("only a long swipe, 60% of the row or more, acts at once", () => {
  expect(releaseOutcome(-0.6 * W, W, { right: false })).toEqual({ act: "left", rest: 0 });
  expect(releaseOutcome(-0.59 * W, W, { right: false })).toEqual({ act: null, rest: -REVEAL });
});

it("to the right only where the row has a right action (a task's Done)", () => {
  expect(releaseOutcome(0.7 * W, W, { right: false })).toEqual({ act: null, rest: 0 });
  expect(releaseOutcome(0.7 * W, W, { right: true })).toEqual({ act: "right", rest: 0 });
  expect(releaseOutcome(0.3 * W, W, { right: true })).toEqual({ act: null, rest: REVEAL });
});

it("an open row swiped back closes", () => {
  expect(releaseOutcome(-REVEAL + 50, W, { right: false, from: -REVEAL })).toEqual({ act: null, rest: 0 });
});
