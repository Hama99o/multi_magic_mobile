# pdf.js 3.11.174, shipped in the app

`pdfjs.ts` holds `pdf.min.js` and `pdf.worker.min.js` from
`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/` as two string
constants, so `PdfView.tsx` can inline them and a PDF opens with no network
(it used to load both from cdnjs on first open). Generated, never edited.

3.11.174 is the last line with a classic (non-module) `pdf.min.js` exposing
`pdfjsLib`. The worker is inlined too: it sets `globalThis.pdfjsWorker`, which
pdf.js uses to run the worker on the page's own thread, so no Worker URL is
needed inside a WebView loaded from a string.

Two transformations, both meaning-preserving:

1. `</script` is written `<\/script`, so an inlined copy cannot end its own
   `<script>` early.
2. Every non-ASCII character (43, all inside JS string literals: ligature
   maps, BOM checks, font tables, two UI strings) is written as a `\uXXXX`
   escape. Hermes stores a string with ANY non-ASCII character as UTF-16, so
   those 43 characters doubled the cost of all 1.4 MB: measured 2026-11-21,
   the Android bundle grew 2.82 MB before this escape. The SRI below is of
   the ORIGINAL files.

| File | Bytes | SRI (matches cdnjs's published value, checked 2026-11-21) |
|---|---|---|
| pdf.min.js | 320004 | sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ== |
| pdf.worker.min.js | 1087212 | sha512-BbrZ76UNZq5BhH7LL7pn9A4TKQpQeNCHOo65/akfelcIBbcVvYWOFQKPXIrykE3qZxYjmDX573oa4Ywsc7rpTw== |

To regenerate: download both files, check them against
`https://api.cdnjs.com/libraries/pdf.js/3.11.174?fields=sri`, then embed each
with `JSON.stringify`, applying the one transformation above.
