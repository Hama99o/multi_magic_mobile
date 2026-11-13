# Contacts — the third full app (2026-11-12)

**Status: `DONE`** — 2026-11-12. `ours/` holds 360, 411 and 800 dp
(light/dark, en/fr), `25-contacts` passes on a device, and
`docs/QA_REPORT_2026-11-12.md` says what was NOT measured (iOS share-in and
limited access, a real WhatsApp chat). Server `contacts-api` awaits a deploy.

The owner, 2026-11-12 (relayed by the supervisor session): *Contacts as the
third full app, after Pages and Calendar. List with search, an A–Z index and
favourites; every phone and email with call, WhatsApp, SMS and email; create,
edit, delete and restore; several phones and emails, company, job, notes,
photo; family and upcoming birthdays; import from the phone and from a .vcf,
single and bulk, and export the same way. He must never find a bug himself.*

That reverses the design rule "this app has no contact screen, it composes a
question" (`CLAUDE.md`, Design) for contacts, on the owner's explicit request
(`docs/MISSING_FEATURES.md` row 2). The detail keeps an **Ask the assistant**
button, as the Calendar did, so nothing the old rule gave is lost.

## A · What the web and the API have, and where it lands on the phone

Read from `multi_magic/app/javascript/pages/contacts/` and
`Api::V1::ContactApp::ContactsController` (+ concerns, relations), 2026-11-12.

| Web | API | Phone |
|---|---|---|
| Card grid, search, favourites first | `GET contacts?search=&page=&per_page=` (≤100 a page) | `app/contacts/index.tsx`: every page loaded, sorted A–Z on the phone (`sortKey`, accent-blind), favourites as their own first section, A–Z index on the edge |
| Drawer: every field, documents, family | `GET contacts/:id` (full view) | `app/contacts/[id].tsx` |
| Drawer edit | `POST contacts`, `PUT contacts/:id` (`phones/emails/addresses: [{label,value…}]`) | `app/contacts/edit.tsx` (modal) |
| Photo | `POST :id/upload_photo` (multipart `photo`), `DELETE :id/remove_photo` | the edit form's avatar: take / choose / remove (`expo-image-picker`) |
| Delete → trash, Trash tab, restore, delete forever | `DELETE :id`, `GET trashes`, `PUT :id/restore`, `DELETE :id/destroy_permanently` | Delete with Undo; `app/contacts/trash.tsx` |
| Family section + add member | `GET/POST/PATCH/DELETE :id/relations` | detail "Family & relationships"; add = pick a contact + a role |
| Birthdays modal | `GET upcoming_birthdays?within=` | a "Birthdays soon" strip at the top of the list, and a full list |
| Duplicates modal | `GET duplicates` | `app/contacts/duplicates.tsx` (groups; tap opens the contact) |
| Import vCard | `POST import_vcard` (`file` or `vcf`), **every card since multi_magic 485e2db1** | `app/contacts/import.tsx`: from the phone (one / chosen / all) or a .vcf |
| Export | `GET :id/export_vcard`, `GET export_multiple_contacts?ids[]=` or `?all=true` | share one from the detail; select mode on the list → share; Export all |

**Server gaps found and closed on the `contacts-api` branch (NOT merged into
master: a master push deploys production):**
- `a0222268`: the list and the MCP returned only the FIRST email/phone (the
  owner's bug of 2026-11-12: one contact's second email was invisible). The
  list now carries `phones`/`emails`; the MCP record has `emails`/`phones`;
  search finds a second email or number.
- `485e2db1`: `import_vcard` read ONE card; it now reads every card
  (Android 2.1 quoted-printable, iOS item labels, folded lines, photos),
  skips people already there, and answers a summary.

## B · Sources (Rule Zero) — 20 screens, images in `references/` (gitignored)

| App | Screen | What we TAKE | What we REJECT |
|---|---|---|---|
| WhatsApp | [Contact info](https://mobbin.com/screens/a3e9d4e5-2fb5-4bb7-8f65-c34e0e8786ff) | big round avatar, name, the number under it, then **three equal action tiles** in a row | Video/Search (no such thing here) |
| WhatsApp | [Contact info, bottom](https://mobbin.com/screens/6d61bbf7-3044-4d48-a4f4-cc61ef3f95b0) | secondary actions as a **plain list of tinted text rows** (Share contact, Add to Favourites) and the destructive one alone in red at the end | block / report |
| Telegram | [Contact](https://mobbin.com/screens/19fa286e-c101-4f24-8aa1-2b3c737fc3bb) | label **above** value in each card row ("mobile" / +1 650…); the value in the accent = tappable | the gifts strip |
| Beside | [Contact](https://mobbin.com/screens/f6ab0ee0-a578-4897-b604-3366ec4fb254) | initials avatar when there is no photo; **round** quick-action buttons with the word under them | "Add company / Add address" rows on the detail (they belong in Edit) |
| Quo | [Contact](https://mobbin.com/screens/5bbde933-f170-44fc-93c6-290406469f58) | company under the name; icon per row (phone, mail, briefcase) | Details/Notes tabs (one scroll is enough on a phone) |
| Apple Messages | [Contact](https://mobbin.com/screens/58aa81c0-14d0-448a-be21-d9820344435b) | disabled-looking circle when an action has no target (no email → Email greyed, not hidden) | — |
| TextNow | [Contact](https://mobbin.com/screens/4e721c87-a0e3-43cf-b840-3476ab308259) | Edit at the top right, back at the left | two-button bar only |
| Apple Mail | [Contact card](https://mobbin.com/screens/21893e6f-7181-4de4-9453-cb13a1ee1b97) | "Share Contact" as a full-width row | the gradient ground |
| Outlook | [All contacts](https://mobbin.com/screens/02e7c925-3718-4c2d-8542-9c3bab846129) | letter section headers, search on top, the **A–Z index on the trailing edge**, round **+** bottom right, ★ next to a favourite | the tag chip under the name |
| Telegram | [Contacts](https://mobbin.com/screens/b1f60825-edc1-40e4-92ed-0c2d8a79fe60) | coloured initials avatars; index in the accent | "last seen" subtitle (ours: company or first number) |
| WhatsApp | [Pick members](https://mobbin.com/screens/7484a21f-a674-4421-b796-8d3f4acd81f5) | **select mode**: a round check at the row's end and "n selected" in the header — used for export and phone import | — |
| Lyft | [Phone contacts](https://mobbin.com/screens/6e95399a-0023-43b1-a837-80a79fa2c832) | the phone's own address book listed with name + number, searchable, before anything is sent | chevrons (ours are checks) |
| Snapchat | [Friends](https://mobbin.com/screens/1371f8be-5d19-4d0b-87ef-75f2c1bfc8b7) | rows as rounded cards on the grouped ground in dark mode too | emoji badges |
| Jobber | [New client](https://mobbin.com/screens/d7a84448-a508-4ae4-b77d-86a5819321a1) | each phone row = number + **label picker**; "**Add another phone number**" link under the list | "receives texts" toggle |
| Mesh | [New person](https://mobbin.com/screens/9a099900-4561-480b-89d0-6dea0e35afcf) | avatar with a small edit badge at the top of the form; first/last grouped in one card | ✓-only header (we say Save) |
| Garmin | [Create contact, dark](https://mobbin.com/screens/7a31addd-ed22-44c6-a493-9fb4a5927604) | **Cancel · title · Save** and ⊕ "Add phone" / "Add email" rows; how the form looks on a dark ground | — |
| Outlook | [New contact](https://mobbin.com/screens/04cd5c75-230c-4115-8aca-c35abb6d9079) | company, address, website, birthday, notes as further labelled rows | categories |
| Tinder | [Adding contacts](https://mobbin.com/screens/d7c5f6cf-4c49-46b4-8cb2-2bb584ff49b4) | one sentence + a **determinate bar** while contacts upload | the full-screen takeover with nothing else |
| Brink | [Import](https://mobbin.com/screens/3c5dd482-99f8-4a6f-b8fb-68e03a885e2b) | "Found 13 so far" — a **count** under the bar, not only a percentage | — |
| Phantom | [Import done](https://mobbin.com/screens/e0b4f795-8c2e-4f11-8746-78a867723c59) | a result screen with a check, one line of what happened, and one primary button | — |

## C · Decisions

1. **One list, A–Z, favourites first.** Every page of `GET contacts` is read
   (100 a page) and sorted on the phone by first name then last name,
   accent- and case-blind (`sortKey`), because the server orders by
   favourite + last update, which is no order a person scans. Sections: ★
   Favourites, then A…Z, then `#` (a name starting with a digit or symbol, or
   in a script with no A–Z letter — Arabic, Persian — kept in its own `#`
   group rather than mis-filed). The index on the trailing edge jumps to a
   section; it shows only letters that exist.
2. **Search is the server's** (`?search=`, which since `a0222268` matches any
   email and any number by its digits), debounced 250 ms; the list filters
   the loaded rows by name instantly while the request runs, so typing never
   shows an empty screen.
3. **The detail is a contact card, not a form.** Avatar (photo or initials
   on a colour from the id), name, job · company, then four round actions:
   **Call · WhatsApp · Message · Email**. An action with no target is shown
   disabled, not hidden (Apple Messages). With several numbers, Call /
   WhatsApp / Message ask which one first (a sheet listing label + number).
   Then cards: phones (each row: tap = call, a WhatsApp button, long-press =
   copy), emails (tap = mail, long-press = copy), addresses (tap = maps),
   birthday (date, age, "in 12 days"), family, website, notes. Then rows:
   Share contact (.vcf), Save to phone contacts, Favourite, Ask the
   assistant, Delete (red, last).
4. **WhatsApp opens a chat, never guesses silently.** `whatsappNumber()`
   turns a stored number into international digits: `+…` and `00…` are
   already international; a national `0…` (07xx in Afghanistan, 06xx in
   France) takes the country of the contact's address when that names a
   known country, else the **default country** set in Contacts (pre-filled
   from the phone's region, changeable, remembered). With no country at all
   the app asks for one rather than open a chat with the wrong person. The
   app opens `whatsapp://send?phone=<digits>`; if no app answers, it says
   *WhatsApp isn't on this phone* and offers **Open in the browser**
   (`https://wa.me/<digits>`).
5. **Every outside action can fail, and says so.** `tel:`, `sms:`, `mailto:`
   and maps go through one `openOutside()`; a tablet with no phone app gets
   "This device can't make calls" and a **Copy number**, never a silent
   nothing.
6. **The form is the Calendar's pattern.** Modal, Cancel · title · Save,
   discard prompt on leave, Save guarded against a double tap by a ref,
   errors under the header. Phones and emails are lists: value + a label chip
   (mobile / home / work / other), ⊕ to add, ✕ to remove. Birthday uses the
   Calendar's date picker (`src/screens/calendar/pickers/`), with "no year"
   impossible on the server (a date column) — said, not hidden.
7. **Import: the server decides what is a duplicate.** Phone and file both
   become vCard text and go to `import_vcard` in **chunks of 50**, so the
   bar is real progress (cards sent / total) and one slow request never
   holds 300 contacts. The summary adds the chunks: added · already there ·
   failed, with the names of the failed and skipped ones on demand.
   - *One from the phone*: the system contact picker
     (`Contacts.presentContactPickerAsync`): no permission needed on iOS.
   - *Several or all*: the phone's address book in a select list (search,
     Select all), after asking for permission **at that tap, never at
     launch**. Denied → a sentence + **Open Settings**. iOS 18 *limited
     access* → we import what was shared and say so, with a way to share more.
   - *A .vcf file*: `expo-document-picker`.
8. **Export: the server writes the vCard.** One contact → `export_vcard`;
   several or all → `export_multiple_contacts` (`?all=true`). The text is
   written to the cache dir and handed to the share sheet (`expo-sharing`);
   the file is deleted after. **Save to phone contacts** uses
   `Contacts.presentFormAsync` (the system's own "new contact" form,
   pre-filled), so the user confirms in the system UI.
9. **Delete → trash with Undo** (the Calendar's `UNDO_MS`, 30 s with a
   screen reader); the Trash screen restores or deletes forever (asks, with
   the name in the question).
10. **Offline**: reads come from the cache with the usual banner; writes are
    not queued (the Calendar's rule: a write that lands later at the wrong
    moment is worse than a clear "not saved"). The banner says so on contact
    screens.

11. **Tablet split (2026-11-13, `docs/MISSING_FEATURES.md` row 3).** At
    **800 dp and wider** (`SPLIT_AT`, `src/screens/contacts/split.ts`) the
    list is the left pane and the card the right, master-detail. The owner
    saw one phone-width column on an 800 dp tablet, small and lost in the
    middle.
    - **Sources** (Rule Zero, Mobbin 2026-11-13, images in `references/`
      `split-*.jpg`): [Meetup messages](https://mobbin.com/screens/22e2b656-c848-4446-af19-8b578d0394d6)
      and [Quo](https://mobbin.com/screens/ceac50d8-3d61-4420-8a0a-5b7a0b88d88d)
      (a phone-width list on the left, the selected row on a tinted
      surface, the record on the right);
      [Base44](https://mobbin.com/screens/4b82e9b8-2f62-4b9f-a873-495745fef526)
      and [Givingli](https://mobbin.com/screens/85a98c32-aef7-4c8a-926c-37afb2349ac3)
      (an empty right pane with an icon, a title and one line saying what
      to pick). **iPad Contacts, Gmail and Outlook tablet layouts are not on
      Mobbin** (searched: it has iPhone and web screens only); said here so
      nobody thinks they were skipped.
    - **The list pane keeps a phone's width**: 38 % of the screen, clamped
      to 360–420 dp (`listPaneWidth`). The rows, the 44 dp avatars, the A–Z
      index and the type size are exactly the phone's; nothing is scaled.
      The card takes the rest, capped at `maxMeasure` (640) and centred.
    - **The open contact** is tinted (`surface`) with a 3 dp accent edge,
      and `accessibilityState.selected` for a screen reader.
    - **The card in the pane has no back button**, and deleting it empties
      the pane (the list shows Undo, as on a phone) instead of going back.
    - **Nothing open yet**: "Select a contact. Their card opens here, beside
      the list." (`contacts.split.*`).
    - **Rotation keeps the open contact**: it lives in `ContactsScreen`,
      above both layouts. Crossing under 800 dp shows the list alone, and
      coming back shows the same card.
    - **Not changed**: + New contact, Edit, Import and Trash still open
      their own screens on top; a new contact therefore opens full screen
      after Save. That's acceptable for now, and noted for the device pass.
    - Code: `app/contacts/index.tsx` (`ContactsScreen` → `ContactsList`
      `pane`/`openId`/`onOpen`), `src/screens/contacts/ContactCard.tsx`
      (the card, `embedded`/`onGone`; `app/contacts/contact.tsx` is its
      phone route), `split.ts`. Tests: `contactsSplit.test.tsx` at 360, 411,
      800, 1280. Device check: with the SafeZone device pass (an 800 dp
      shot and a 1280 dp landscape shot into `ours/`).

## D · Not taken (and why)

- The web's **family tree drawing** (`FamilyTreeView`, 783 lines): a phone
  shows the list of ties on the detail; the tree is a desk thing.
- **Documents** (ID card, passport) on a contact: shown read-only as a count
  on the detail; upload stays on the web for now (owner can ask).
- **Merging duplicates**: the web lists them and does not merge; so does the
  phone.

## E · How we code it

- `src/api/contacts.ts` — `contactsApi` {list(all pages), show, create,
  update, remove, restore, destroyForever, trash, uploadPhoto, removePhoto,
  relations…, birthdays, duplicates, importVcf(chunk), exportOne,
  exportMany}; types `Contact`, `LabelledValue`, `Address`, `Relation`.
- `src/screens/contacts/` — `sections.ts` (sortKey, sectionsOf), `phone.ts`
  (digits, whatsappNumber, COUNTRIES), `outside.ts` (openOutside,
  openWhatsApp), `vcard.ts` (phone contact → vCard text), `draft.ts`,
  `ContactForm.tsx`, `Avatar.tsx`, `AzIndex.tsx`, `QuickActions.tsx`,
  `NumberChooser.tsx`.
- `app/contacts/{index,contact,edit,trash,import,duplicates}.tsx`; a Home tile.
  The card is `src/screens/contacts/ContactCard.tsx` (route + split pane).
- Stores: `contactsCountry.store.ts` (default country), the Calendar's undo
  pattern.
- Native: `expo-contacts` (READ/WRITE_CONTACTS; `NSContactsUsageDescription`
  en/fr). Needs a native build — asked for, not done at the desk.

## F · Share INTO MultiMagic (owner, 2026-11-12)

The phone's own Contacts app → a contact → Share → **MultiMagic**; or any
text (an SMS, a WhatsApp message, a note) holding a number or an email. One
share door (`expo-share-intent`, already there for Pages), with a router in
front of it — `classifyShare` in `src/screens/contacts/shareIn.ts`, used by
`src/screens/pages/ShareIntentBridge.tsx`:

| What arrives | Where it goes |
|---|---|
| one vCard (a `.vcf` file, or vCard text) | `/contacts/edit?shared=1`: the form filled in (names, every phone and email, company, job, birthday, address, notes, the photo when the card has one). If a number (last nine digits, the server's rule) or an email is already someone's: a banner "Jamil Safi already has this number or email." with **Add to Jamil Safi** (the new numbers/emails merged into theirs, none twice) and **Open Jamil Safi** |
| several vCards | `/contacts/import?shared=1`: straight into the bulk import — bar, summary (added / already there / failed) |
| text with a phone number or an email | `/contacts/shared`: what was found, the text it was found in, then **Add as a new contact** or **Add to someone already here** (search, tap, merged) |
| photos, videos, documents | Save to Pages, unchanged |
| a vCard together with a photo | Pages (the photo is not dropped) |
| plain text with neither | let go — Pages keeps files, not sentences |

A cold start from the extension lands on `/share` (`app/+native-intent.tsx`),
which the bridge REPLACES with the destination; with nothing to route it
goes home after four seconds.

Detection (`detectContactBits`): a run of digits with the separators people
type (spaces, dots, dashes, brackets, a leading `+` or `00`), 7 to 15
digits; NOT a date (`2026-11-12`, `12/11/2026`), a time, or an amount
written in groups of three (`1 250 000`). Emails by the usual shape.

Native: Android already accepts every type (`androidIntentFilters: */*`);
iOS gains `NSExtensionActivationSupportsText`. A `.vcf` from iOS Contacts is
shared as a file; whether the extension's file rule takes it is **NOT
MEASURED** (no iOS device on this box).

### F.3 · A contact shared to MultiMagic opens Contacts, never Pages (owner, 2026-11-13)

*"iOS/Android share of a contact (.vcf) to MultiMagic must open Contacts
import, not Pages."*

**Which file is a card** (`partitionShare`, `src/screens/contacts/shareIn.ts`):
- by its type: `text/vcard`, `text/x-vcard`, `text/directory` (vCard's
  older MIME type, RFC 2425);
- or by its extension: `.vcf` in any case, whatever the type;
- or by its bytes, for a file that only MAY be one: a generic type with no
  extension (seen on a device, 2026-11-12), or `text/plain`. The first bytes
  must start `BEGIN:VCARD` (`looksLikeVcard`). Nothing else is read.

**Where it goes** (`planShare`, `ShareIntentBridge.tsx`):
- only cards: one card → the new-contact form, filled in; several → the
  bulk import with its preview and duplicate skip (both as before);
- **mixed (cards + photos or documents): Contacts first.** The cards open as
  above; the other files wait as the pending Pages import, and the Contacts
  screen shows **"N other files from that share are not contacts. Save to
  Pages"** (`SharedRestToPages`, on the form and on the import's summary).
  Tapping it opens Save to Pages with them, where the person picks a place.
  **A banner, not a toast:** a toast is gone before the person has
  decided, and the files would vanish without a word;
- **a file that could not be read is said, never saved** (device pass,
  2026-11-13): no path, an empty file by the sender's own word, or a cache
  copy that is missing or empty (`unreadableFile`, `shareIn.ts`). An alert,
  "Couldn't read this file · Try sharing it again." (`shareDoor.*`); the
  rest of the share goes on; a share with nothing readable goes nowhere,
  and from the cold-start landing goes Home. Found on the dev build: with
  the app stopped, a lone `.vcf` reached Save to Pages as "1 file · 0 B"
  and MediaProvider refused the read. That the read grant is lost in the
  dev launcher's hop is INFERRED; the release-build check is the
  measurement. `expo-share-intent` already copies each shared file into the
  cache natively, on arrival, so there is no earlier moment for JS;
- no card at all: Pages, at once, without reading anything (as before);
- signed out: the share waits and acts after sign-in (as before, tested
  for a mixed share too).

**Native:**
- iOS: the extension's activation rule is now a predicate naming
  `public.vcard` explicitly (with images, movies, plain text, file URLs,
  `public.content` and archives, up to 100). The old dictionary rule left it
  unclear whether a contact shared from iOS Contacts (vCard DATA, not
  necessarily a file URL) matched "file". Bare web links stay out on
  purpose: `public.url` and `public.data` are not in the rule.
- iOS display name **"MultiMagic"** (was "MultiMagic Pages"). The bundle id
  is computed from the app's, not the name, so it stays
  `com.multimagics.mobile.share-extension`; `shareExtensionConfig.test.ts`
  checks it with the plugin's own function. The Xcode target name changes
  (`MultiMagicPages` → `MultiMagic`); prebuild regenerates it.
- Android: `*/*` already accepts `text/vcard` and `text/x-vcard`. The plugin
  only accepts `text/*`, `image/*`, `video/*` or `*/*`, so an explicit vCard
  filter cannot be expressed and would add nothing.

**Measured:** Jest only (classifier, bridge, banner, config).
**Device pass** (with SafeZone/split, `devpass.sh`): share a `.vcf` from the
Android Contacts app, alone and with a photo. **iPhone: NOT MEASURED**, on
the owner's checklist: share one contact and several contacts from iOS
Contacts, and check that the share sheet shows "MultiMagic".

## Query keys (React Query audit, 2026-11-13)

Every key comes from `contactsKeys` in `src/api/keys.ts`, never a literal
(`docs/DATA_LAYER.md`; the guard is lint rule `api-in-effect`).

| Factory member | Key |
|---|---|
| `contactsKeys.all` | `["contacts"]` |
| `contactsKeys.list()` | `["contacts", "list"]` |
| `contactsKeys.searches()` | `["contacts", "search"]` |
| `contactsKeys.search()` | `["contacts", "search", term]` |
| `contactsKeys.detail()` | `["contacts", "contact", contactId]` |
| `contactsKeys.trash()` | `["contacts", "trash"]` |
| `contactsKeys.allBirthdays()` | `["contacts", "birthdays"]` |
| `contactsKeys.birthdays()` | `["contacts", "birthdays", days]` |
| `contactsKeys.duplicates()` | `["contacts", "duplicates"]` |

Writes: useContactMutations.ts. favourite, delete, restore, delete for ever, removing a family tie are optimistic; adding a tie, the form's save, the merges and the vCard export are not (reasons in the file).

