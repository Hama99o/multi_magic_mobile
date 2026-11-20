/**
 * The person's layer over a shared view (SPEC C1), as React state kept on the
 * device: read when the view changes, written on every change. Never sent to
 * the server's views.
 */
import { useCallback, useEffect, useState } from "react";
import type { View } from "@/api/tables";
import { readLayer, writeLayer, type PersonalLayer } from "./personalView";

export function usePersonalLayer(userId: number | undefined, view: View | undefined) {
  const [layer, setLayer] = useState<PersonalLayer>({});
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const viewId = view?.id;

  useEffect(() => {
    if (userId === undefined || viewId === undefined) return;
    let live = true;
    void readLayer(userId, viewId).then((stored) => {
      if (!live) return;
      setLayer(stored);
      setLoadedFor(viewId);
    });
    return () => {
      live = false;
    };
  }, [userId, viewId]);

  const change = useCallback(
    (patch: PersonalLayer) => {
      setLayer((current) => {
        const next = { ...current, ...patch };
        if (userId !== undefined && viewId !== undefined) void writeLayer(userId, viewId, next);
        return next;
      });
    },
    [userId, viewId],
  );

  /** "Back to the shared view": the layer goes, on this phone too. */
  const reset = useCallback(() => {
    setLayer({});
    if (userId !== undefined && viewId !== undefined) void writeLayer(userId, viewId, {});
  }, [userId, viewId]);

  // Until the stored layer is read, the shared view (no flash of the wrong rows: the
  // query waits on `ready`).
  // Nobody signed in yet (the first frame after a cold start): the shared
  // view, with the person's changes kept for this visit only.
  if (userId === undefined) return { layer, ready: viewId !== undefined, change, reset };
  return { layer: loadedFor === viewId ? layer : {}, ready: viewId !== undefined && loadedFor === viewId, change, reset };
}
