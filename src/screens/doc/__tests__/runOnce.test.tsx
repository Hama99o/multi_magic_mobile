/**
 * Readiness "2×tap" for every Doc tool that runs through `useDocTask`
 * (Merge, Convert, Pages, Sign, Text). Their buttons are disabled while
 * `busy`, but `busy` is React state: two taps in one frame both call `run`.
 * `run` used to abort the first request ON THE PHONE and start a second; the
 * server kept computing the first, so a double tap cost two heavy jobs and
 * could leave the second waiting on the global Doc slot ("busy").
 */
import { act, renderHook } from "@testing-library/react-native";
import { useDocTask } from "../ui";

it("a second run while one is in flight is ignored, not restarted", async () => {
  const { result } = renderHook(() => useDocTask());
  let release: (v: string) => void = () => {};
  const work = jest.fn(() => new Promise<string>((r) => (release = r)));
  let first: Promise<string | null> = Promise.resolve(null);
  let second: Promise<string | null> = Promise.resolve(null);
  await act(async () => {
    first = result.current.run(work);
    second = result.current.run(work);
  });
  expect(work).toHaveBeenCalledTimes(1);
  await act(async () => release("done"));
  await expect(first).resolves.toBe("done");
  await expect(second).resolves.toBeNull();
});

it("after it ends, the next run goes", async () => {
  const { result } = renderHook(() => useDocTask());
  const work = jest.fn(async () => "ok");
  await act(async () => {
    await result.current.run(work);
  });
  await act(async () => {
    await result.current.run(work);
  });
  expect(work).toHaveBeenCalledTimes(2);
});

it("Cancel frees it at once", async () => {
  const { result } = renderHook(() => useDocTask());
  const work = jest.fn(() => new Promise<string>(() => {}));
  await act(async () => {
    void result.current.run(work);
  });
  act(() => result.current.cancel());
  await act(async () => {
    void result.current.run(work);
  });
  expect(work).toHaveBeenCalledTimes(2);
});
