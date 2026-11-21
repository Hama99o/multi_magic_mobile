/**
 * A text input that submits what was typed exactly ONCE.
 *
 * Measured on the device (qa_phone3, 2026-11-20): Android delivered one Enter
 * as two `onSubmitEditing` calls in the same tick, before React re-rendered,
 * so a handler reading state saw the same text twice and the server got the
 * same card twice. The text is therefore kept in a ref as well, and `take()`
 * empties it synchronously: the second call finds nothing.
 *
 *   const text = useSubmitText();
 *   <TextInput value={text.value} onChangeText={text.onChangeText}
 *              onSubmitEditing={() => { const v = text.take(); if (v) add(v); }} />
 */
import { useCallback, useRef, useState } from "react";

export function useSubmitText(initial = "") {
  const [value, setValue] = useState(initial);
  const typed = useRef(initial);
  const onChangeText = useCallback((v: string) => {
    typed.current = v;
    setValue(v);
  }, []);
  /** The trimmed text, emptied at once; null when there is nothing (or it was already taken). */
  const take = useCallback((): string | null => {
    const v = typed.current.trim();
    if (!v) return null;
    typed.current = "";
    setValue("");
    return v;
  }, []);
  return { value, onChangeText, take };
}
