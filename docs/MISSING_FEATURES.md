# Missing features (owner's list)

Things the owner noticed are missing while using MultiMagic. They are not bugs: the app works, but a feature isn't there yet.
Build them when MultiMagic work resumes. Newest at the bottom. Mark an item done with the commit that adds it.

| # | Date | Where | Missing | Notes for the build | Status |
|---|---|---|---|---|---|
| 1 | 2026-11-09 | Pages → Home, multi-select (Android, emulator qa_phone) | **Download several files at once.** With 2+ items selected, the top bar has only star / move / delete. | Add a Download action to the multi-select bar. Real files only (photo, PDF, mp3…); pages and folders are skipped, with a short note saying how many were skipped. Save each file one after another, with progress. Check iOS too. | **Built** on branch 1.1.1 (`downloadMany.ts`, the selection bar's Download): the system asks once for a folder, files go there one by one. Files/Downloads, not the Photos gallery (that needs a new native module; asked of the owner). Jest red first; device QA pending; iOS in `IPHONE_CHECKLIST.md` §7. |
