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
