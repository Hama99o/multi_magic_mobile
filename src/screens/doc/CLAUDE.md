# src/screens/doc — Doc Tools on the phone

What a device taught on 2026-11-20 that no Jest test could (docs/design/doc/SPEC.md §F).

- **A URL from the server goes through `absoluteUrl`.** The server names its
  own host; on a dev stack that is `localhost`, which from a phone is the
  phone. A signature drew blank until `parseSignature` used it.
- **Never trust the phone to decode a picture the server reads.** A 10-bit
  HEIC (common on iPhones) draws nothing on Android. Every `<ExpoImage>` of a
  user's file has an `onError` that falls back: the server's JPEG copy for the
  document being worked on, an icon for a thumbnail.
- **Lock scrolling only while a finger is down**, never for as long as
  something is selected: the controls under the page must stay reachable at
  360 dp (`onActive`, `onDrawing`).
- **Measure a grid's width (`onLayout`); do not compute it from the window.**
  The screen's own padding made the Pages grid one column at 360 dp.
- **A bar acting on a selection is pinned outside the ScrollView.**
- **Every tool call ends on our own clock** (`post()` in `src/api/doc.ts`): a
  connection the server dropped kept the phone busy past axios's timeout.
- **Check results in the file**, not on the screen: pull it with
  `adb exec-out run-as com.multimagics.mobile cat cache/doc/...` and read it
  (`pdfinfo`, `pdftotext`, pixels).
