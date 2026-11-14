# DRAFT: upstream issue for engine B (position-epoch limit)

**Status: NOT FILED.** Filing it is outward-facing and needs the owner's "oui".
- Target: https://github.com/apollohg/react-native-rich-text-editor/issues
- Numbers measured 2026-11-14 with `qa/scripts/epoch_probe.py` on an Android 14 emulator (software rendering, so a phone is likely faster).
- Everything quoted here comes from invented `[qa-edit]` notes. No real note content goes upstream.

---

## Title

`POSITION_EPOCH_LIMIT_EXCEEDED` on long documents: the limit cannot be configured, and the document is accepted and drawn empty before the error

## Environment

- `@apollohg/react-native-rich-text-editor` 2.2.3. Our local patch only touches atom rendering (`RenderBridgeInlineAndAtoms.kt`, `RenderBridge+Atoms.swift`); nothing near positions or epochs.
- React Native 0.86.3, Expo 57.
- Android 14 emulator, x86_64. iOS not tried.

## What happens

We create a document handle from local JSON, with a custom schema and default limits:

```ts
const handle = createNativeEditorDocumentHandle({
  initialization: { type: "localJson", json: doc },
  schema,                       // headings, paragraphs, lists, tables, marks
  policy: { allowBase64Images: true },
});
```

With a document of about 900 KB of HTML (≈815 000 text characters, ≈2 600 top-level blocks: headings, paragraphs with bold, bullet lists, 3×3 tables):

1. `createNativeEditorDocumentHandle` returns without an error.
2. The editor view is drawn **empty**, showing the placeholder.
3. The error listener (`bridge.addErrorListener`) then receives:
   ```
   POSITION_EPOCH_LIMIT_EXCEEDED: position epoch exceeds maxPositionEpochRetainedBytes
   ```

Measured with the same schema and content shape (one size per row):

| HTML size | Text characters | Top-level blocks | Open time | Result |
|---|---|---|---|---|
| 100 KB | 90 988 | 294 | 8 s | edits and saves |
| 200 KB | 181 948 | 587 | 22 s | accepted; a typed edit not exported within 45 s |
| 300 KB | 271 864 | 876 | 30 s | same |
| 450 KB | 408 425 | 1 316 | 52–71 s | same |
| 600 KB | 544 070 | 1 753 | 73–110 s | same |
| 800 KB | 725 063 | 2 336 | 14 s | **refused**: `POSITION_EPOCH_LIMIT_EXCEEDED` |

So the hard limit sits between 600 and 800 KB. Above roughly 100–200 KB the editor is already too slow to use.

## Also: typing in a 200 KB document freezes the UI thread (ANR)

Same setup, Android 14 emulator, a 200 KB document (181 948 text characters, 587 blocks). The first key typed after opening blocks the main thread for more than 5 s, and Android kills the app:

```
ANR in Window{… com.multimagics.mobile/…MainActivity}. Reason: Input dispatching timed out … Waited 5001ms for KeyEvent(… keyCode=SPACE(62) …)
ActivityManager: Killing …:com.multimagics.mobile/u0a209 (adj 0): user request after error
```

It happens on every attempt at 200, 300 and 400 KB. 100 KB edits fine. Our JavaScript runs on its own thread, and its conversion took about 170 ms per export at that size (measured in the same run), so we believe the time is spent in the engine's native key handling. That is an inference: we have no native profile.

Creating the document handle also grows with size (from our `[notes-open]` log, cold start, emulator): 0.5 s at 50 KB, 0.6–0.9 s at 100 KB, 0.9–1.5 s at 200 KB, 1.3–2.0 s at 300 KB, 2.3–3.5 s at 400 KB.

## Why it matters

Step 2 is the dangerous part. A user sees an empty editor for a note that is not empty. If they type there, the app's autosave would send what the view holds and overwrite the note. We now guard against it on our side: we listen for the error and switch to a read-only view. But every integrator has to discover this.

## Where the limit lives

- `maxPositionEpochRetainedBytes` (and `maxPositionEpochBoundaries`, `maxPositionEpochOwners`) appear only in the compiled core (`libeditor_core.so`, near `src/position_epoch.rs`).
- They are **not** in `EditorEditingLimits` or `EditorResourceLimits`.
- `V2_CREATE_EDITING_LIMIT_KEYS` accepts only `maxOperationsPerTransaction`, `maxUndoGroups`, `maxUndoRetainedUnits` and `maxDerivedOutputBytes`, so they cannot be passed from JS either.
- The document is well inside the resource limits we can see:
  - `maxInputBytes`: 20 MiB;
  - `maxDocumentNodes`: 100 000;
  - `maxDerivedOutputBytes`: 32 MiB.

## What we would like (any one helps)

1. **Fail at creation.** If a document cannot be edited, `createNativeEditorDocumentHandle` (or the view's first render) should throw or report it synchronously, instead of accepting the document and drawing it empty.
2. **Make the limit configurable.** Expose `maxPositionEpochRetainedBytes` (and its siblings) in `EditorEditingLimits`, with its default and hard ceiling documented next to the others.
3. **Or scale it with the document.** The retained budget could grow with the document size, so that a document the resource limits accept can also be edited.
4. Document the default value in either case, so apps can check a document before opening it.

## Repro

A standalone document of the same shape can be generated with `note_html(target_bytes)` from our probe script (invented words, deterministic). We can attach the JSON of the smallest failing size.

---

## Internal notes (not for the issue)

- The probe: `qa/scripts/epoch_probe.py <serial>`. It opens each invented note by deep link (`multimagic://notes/edit?id=N`), with no app navigation. It tries a size ladder, then halves the gap down to 25 KB. A size counts as editable only if a typed token reaches the server and logcat shows no B warning.
- After the probe, add the threshold to `MISSING_FEATURES.md` ("Editing very long notes") and `KEEP.md`.
- Until B changes, the app behaviour stays: refused → read view, nothing sent.
