/**
 * Two native layout calls behind plain functions, so the keyboard logic in
 * `ScreenContainer` can be tested without a layout engine (Jest has none).
 */
export type Box = { y: number; height: number };

type Measurable = {
  measureLayout?: (
    relativeTo: unknown,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail?: () => void,
  ) => void;
};

/** `node`'s top and height inside `container`, or null when it cannot be measured. */
export function measureIn(node: unknown, container: unknown): Promise<Box | null> {
  return new Promise((resolve) => {
    const measurable = node as Measurable | null;
    if (!measurable?.measureLayout || !container) {
      resolve(null);
      return;
    }
    try {
      measurable.measureLayout(container, (_x, y, _w, height) => resolve({ y, height }), () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

export function scrollViewTo(scrollView: { scrollTo?: (o: { y: number; animated: boolean }) => void } | null, y: number) {
  scrollView?.scrollTo?.({ y, animated: true });
}
