# Upload — PDFs and images into a conversation

**Status: `SPECIFIED`** · `api/v1/ai/sessions/:id/documents`

## The allowed list is the MODEL's, not the extractor's

`AiDocument::ALLOWED_EXTENSIONS` = **`pdf png jpg jpeg webp gif heic heif csv`**
— nine, and that is what the endpoint enforces. `Ai::FileExtractor` is the
*permissive* end: it reads xlsx and docx too, so **offering what the extractor
can read would produce a file that uploads and is then 422'd.** The picker
offers the nine and nothing else.

Server limits, which the app enforces first so a person never meets a raw error:
**10 MB** per file (`MAX_BYTES`), **20 files per conversation**
(`MAX_PER_CONVERSATION`).

## Sources

Taken from `../chat/references/chatgpt-answer-actions-voice-mode.webp`: **`+` at
the leading edge of the composer pill**, opening a sheet. No separate upload
screen — a file is something you add to a sentence you are writing.

The sheet is the shared `ActionSheet`: **Photo · Camera · Document**, matching
the three ways a person actually has a file on a phone.

## Our decisions

- **A pending file appears as a chip above the composer** before the question is
  sent, with its name, size and an `✕`. A file the assistant has not been told
  about yet must not look sent.
- **Upload progress is on the chip**, not a modal — the question can still be
  typed while a 9 MB PDF climbs.
- **HEIC is in the allowed list**, which matters: it is the iPhone default, and
  an app that rejects the format its own users' cameras produce is the kind of
  thing found after launch.
- **The count is shown against the cap** — *"3 of 20 files"* — when a
  conversation is filling up, rather than only at the point of refusal.
- **A file belongs to the session and dies with it.** That is stated in
  `../sessions/SPEC.md`'s delete copy, and it is the reason the file count is on
  the session row.

## How we code it — written 2026-09-19 from the code, `main` at `bbdfc2b`

This section was missing (README rule 3) and is written from what exists.

| Thing | Where |
|---|---|
| the door | `composer-attach` (+) in `src/components/chat/Composer.tsx`, present only once a `conversationId` exists |
| the sheet | `src/components/chat/AttachSheet.tsx` — its own `Modal` (`attach-sheet`), rows `attach-photo` "From your library" · `attach-camera` "Take one now" · `attach-document` "PDF or CSV"; `attach-count` reads *"n of 20 files"* whenever the session holds any |
| picking | `useAttachments(conversationId, uploadedCount)` (`src/hooks/useAttachments.ts`): `DocumentPicker.getDocumentAsync({ type: ALLOWED_UPLOAD_MIME_TYPES })`, `ImagePicker.launchImageLibraryAsync` / `launchCameraAsync` (`quality: 1`) |
| the nine | `ALLOWED_UPLOAD_EXTENSIONS` and `ALLOWED_UPLOAD_MIME_TYPES` in `src/api/ai.ts` — `pdf png jpg jpeg webp gif heic heif csv`, mirrored from `AiDocument::ALLOWED_EXTENSIONS` and pinned by unit test |
| the limits, before the request | `rejectionFor(file, count)` → `LIMITS.maxFileBytes` (10 MB) and `LIMITS.maxFilesPerSession` (20), each with its own sentence; surfaced as `attach-error` in `app/chat.tsx` |
| the chip | `src/components/chat/PendingFiles.tsx` — `pending-files`, one `pending-file-<status>` per file (`uploading` · `ready` · `failed`) with name, `describeSize`, an `ActivityIndicator` while uploading and `pending-file-remove-<key>` (✕) |
| the wire | `documentsApi` (`src/api/ai.ts`): `list` → `GET /api/v1/ai/sessions/:id/documents` · `upload` → `POST …/documents` as multipart · `remove` → `DELETE …/documents/:docId` |
| after upload | `app/chat.tsx` polls `documentsApi.list` every 2.5 s while any document is `pending` (extraction and embedding run in a job and nothing is pushed over the socket), and stops when none is |
| a file in an answer | `src/components/chat/FilePreview.tsx` — `file-preview`, image inline, `file-preview-open` for the rest |
| flows | `05-upload` (the sheet, the three rows, "PDF or CSV"); the upload itself and **the PDF join** proven by hand in run 4 (`qa/FLOW_REGISTER.md`) |

### Divergence notes — 2026-09-19

- **Not the shared `ActionSheet`.** There is no shared action sheet in this
  app; `AttachSheet.tsx` is its own `Modal`, and `PhotoSheet.tsx` on the
  profile is another. Same shape, two files.
- **Progress on the chip is a spinner, not a percentage.** The decision says
  "upload progress"; the code shows `uploading` → `ready`/`failed`. A 9 MB PDF
  can still be typed over while it climbs, which was the point.
- **The count shows whenever there are files, not only "when filling up".**
  `attach-count` renders for any `fileCount > 0`. Simpler than a threshold, and
  the decision's reason — never meeting the cap as a surprise — is kept.
- **A file arrives `pending` and becomes usable later**, which the decisions
  did not anticipate: the chip says so and the screen polls, because otherwise a
  person asks about a document the assistant cannot see yet with nothing on
  screen to explain why.
