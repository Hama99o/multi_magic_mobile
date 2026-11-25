# Brief: `pdf/text` returns right-to-left text in visual order

**For:** the multi_magic server session (Doc, `pdf/text`). **From:** ff,
2026-11-25, readiness RTL cell for Doc (`docs/RELEASE_READINESS.md`, flow 84).
**Status:** measured on a device and on the file; not fixed. The app is not
the place for the fix: the editor sends edits back by run, so the server's
text has to be the logical text.

## Fixture

`fixtures/pdf-text-bidi-fa.pdf` (10 KB), made from
`fixtures/pdf-text-bidi-fa.html` with
`soffice --headless --convert-to pdf:writer_web_pdf_Export`. The Persian is
invented (no personal data): three lines,

1. سفر به لیون
2. این یک سند آزمایشی است
3. جلسه ساعت ۹ صبح روز شنبه

Font: Noto Sans Arabic, embedded subset, with a ToUnicode map. 5 text
operations (`Tj`) for the 3 lines (line 3 is split around the digit).

Do not test with a Chrome-printed PDF: Chrome writes one operation per glyph
cluster (57 for these 3 lines; 59 for the same page in English), so every
"line" is a letter whatever its direction.

## Expected vs actual

Through the phone's Edit text tool (`app/doc/text.tsx`) on the :3030 stack
(multi_magic 8075f963), 2026-11-25:

| | Expected (logical order) | Actual (`pdf/text` run text, as shown) |
|---|---|---|
| line 1 | سفر به لیون | نویل هب رفس |
| line 2 | این یک سند آزمایشی است | تسا یشیامزآ دنس کی نیا |
| line 3, first run | جلسه ساعت | تعاس هسلج |

Every RTL run comes back with its characters reversed. That is the order the
glyphs are painted, left to right (the content stream holds glyph ids in
visual order). Shaping is lost on top of that: an isolated or final form
rendered as the first letter. The page picture (`pdf/page`) is right.

Evidence: `docs/release/evidence/2026-11-25-ff/84-doc-rtl-page.png` (page
right), `84-doc-rtl-lines-reversed.png` (the lines list, reversed).

## The comparison that says it is fixable

`pdftotext fixtures/pdf-text-bidi-fa.pdf -` prints the three lines in
logical order (poppler applies the Unicode bidi algorithm to the extracted
text). So the information is in the file; `pdf/text` just does not reorder.

## What a fix needs to keep true

- A run's text in **logical order** (per run, Unicode bidi; reversing a run
  whose characters are all strong-RTL is the minimal case, and mixed runs
  such as `[qa] سلام` need the algorithm, not a reverse).
- `pdf/edit` must write a replaced RTL run back in **visual** order, or the
  saved PDF reads backwards. Round-trip test: read, edit nothing, save, read
  again: the same text.
- Digits inside RTL text (۹ here) keep their own left-to-right order.
- The run addresses (page, container, index) do not change.

## How to check it on the phone afterwards

`qa/flows/84-doc-rtl-persian-pdf.yaml` (push the fixture as
`/sdcard/Download/qa-doc-fa.pdf`): it asserts `.*لیون.*` in the lines list
and in the edit field, and photographs both.
