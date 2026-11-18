/**
 * A drag that re-renders the list mid-gesture still moves the task (Todo QA
 * T7, 2026-11-16). The first DragList made a new PanResponder on every
 * render; the drag's own state change swapped one in that had never seen the
 * grant, so letting go moved nothing. This drives the grip's responder with
 * the touch history PanResponder reads, across that re-render.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { Todo } from "@/api/todos";
import { DragList } from "../DragList";

const t = (id: number): Todo => ({ id, todoGroupId: 4, title: `T${id}`, notes: null, completed: false, position: id, dueDate: null, priority: "none", overdue: false, remindAt: null, remindSupported: false, createdAt: "" });

function touch(dy: number, ts: number, prevDy = dy) {
  const bank = { touchActive: true, startPageX: 10, startPageY: 100, startTimeStamp: 0, currentPageX: 10, currentPageY: 100 + dy, currentTimeStamp: ts, previousPageX: 10, previousPageY: 100 + prevDy, previousTimeStamp: ts - 1 };
  return {
    nativeEvent: { touches: [{ pageX: 10, pageY: 100 + dy }], changedTouches: [{ pageX: 10, pageY: 100 + dy }], pageX: 10, pageY: 100 + dy, timestamp: ts },
    touchHistory: { numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: ts, touchBank: [bank] },
  };
}

it("moves the first task below the second when dragged past half its height", () => {
  const onReorder = jest.fn();
  render(<DragList todos={[t(1), t(2), t(3)]} onReorder={onReorder} onDragging={() => undefined} />);
  // Every row 56 high (the measured heights).
  for (const id of [1, 2, 3]) fireEvent(screen.getByTestId(`todo-row-drag-${id}`), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 56 } } });
  const grip = () => screen.getByTestId("todo-grip-1");
  act(() => grip().props.onResponderGrant(touch(0, 1)));
  // Steps of 20, each under half a row (28): only the whole drag (60)
  // crosses, so a responder that forgot the earlier steps moves nothing.
  act(() => grip().props.onResponderMove(touch(20, 2, 0)));
  act(() => grip().props.onResponderMove(touch(40, 3, 20)));
  act(() => grip().props.onResponderMove(touch(60, 4, 40)));
  act(() => grip().props.onResponderRelease(touch(60, 5)));
  expect(onReorder).toHaveBeenCalledWith([2, 1, 3]);
});
