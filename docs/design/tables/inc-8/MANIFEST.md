# Tables increment 8: Forms

**Goal (owner, via Hello, 2026-11-20):** build, share and read a table's forms on the phone, as the web's form builder does.

## MUST → evidence

| # | Criterion | Check | Status |
|---|---|---|---|
| 1 | A table's forms, newest first; New form makes one and opens it; for the table's editors only ("Forms" in the menu) | `formsScreens.test.tsx` "lists the table's forms newest first" | ☑ tests |
| 2 | Questions: add from a column the form doesn't ask yet; label, help, placeholder, hidden, required, up/down, remove; a required column's switch is locked on | `formBuilder.test.ts`; `formsScreens.test.tsx` "a question is added from an unused column" | ☑ tests |
| 3 | Page: title, intro, submit label, success text, cover colour or image (multipart PUT), language (Dari named دری for fa) | `tableForms.test.ts` "reads the owner view", "a change goes in the server's names"; `formBuilder.test.ts` "languages" | ☑ tests; cover upload ☐ device |
| 4 | Share: open/closed, accepting answers, closes at, max answers, multiple answers, access mode; the public link (`/f/:slug`) copied or opened | `tableForms.test.ts` "the page people fill" | ☑ tests; ☐ device |
| 5 | Invitations: addresses pasted any way, each read once, invalid ones named; a confirm that names every address and sends only on yes; resend and remove | `formBuilder.test.ts` "invite addresses"; `formsScreens.test.tsx` "invitations name every address and send only on yes" | ☑ tests; never invites a real address on a device |
| 6 | Answers: count, newest first, more on demand; an answer opens its row | `formsScreens.test.tsx` "an answer opens its row" | ☑ tests |
| 7 | Delete a form after a confirm | `form.tsx` `tables-form-delete` | ☐ no test of its own; device pass |

## Hidden criteria
- en/fr ☑ (keys and locales tests, 1.9× budget); 360 dp ☐ device; 800 dp ☐; dark ☐.
- Double tap: ☐ not checked. Each change saves at once (`useFormEdit.ts`, as the web's builder does), so two quick taps send two saves; New form and Invite are the ones to try on the device.
- Roles: the menu entry is for editors ☑ code.
- Empty/loading/error: `tables-forms-empty`, `-loading`, `-failed`, `tables-form-failed` ☑ code.

## Gates
Red first: on the old tree the 3 new suites could not load their modules (3 failed). Green: 230/230 in the forms, tables, i18n and API suites. Changed-file lint is clean; typecheck passed after the typed routes were regenerated. Every heavy job ran through `/data/box-tools/guarded.sh`.

## Not done here
- The public form's filling page stays on the web (`/f/:slug`): the phone opens it.
