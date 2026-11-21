# Parity audit: Contacts, Calendar, Chats, Assistant, Profile, Home/Workspace, cross-cutting

2026-11-20. This is a read-only audit from the code. Mobile is `mm-parity-audit` at `4dd5e8f` (release 1.3.0, origin/main). Web and server are `multi_magic` at `e9adf512`.
I checked each row in the code. Nothing was run on a device, so pixel-level and gesture-level claims are **NOT MEASURED**.
Paths are relative to each repo. Web paths start at `app/javascript/`.

Legend: HAS = mobile does it (file:line) · PARTIAL · MISSING · N/A = a web-only affordance with no mobile meaning.

## Headline

The six apps in this scope are close to endpoint parity. Almost every server call the web makes for Contacts, Calendar, Chats, the Assistant and Profile has a mobile caller now. The open gaps are a few screens (My Family tab, another person's profile, memory review), the cross-cutting platform features (global search, remote push, universal links, in-app password reset) and the Workspace split screen.

---

## 1. Contacts

**Summary:** 27 web actions. 23 HAS, 2 PARTIAL, 2 MISSING. Mobile also does things the web cannot: call, SMS, WhatsApp with a country picker, phone-book import, an A–Z index.

| Web action (file:line) | Mobile |
|---|---|
| List + search (`pages/contacts/Index.tsx:147`) | HAS `app/contacts/index.tsx:116-125` (server search plus a local filter) |
| Tabs active / family / trash (`Index.tsx:137-139`) | active HAS; trash HAS `app/contacts/trash.tsx`; **family tab MISSING** (see below) |
| Restore / delete forever (`Index.tsx:68,72,188-191`) | HAS `app/contacts/trash.tsx`, `src/api/contacts.ts:426,430` |
| Import vCard (`Index.tsx:114`) | HAS `app/contacts/import.tsx`, `src/api/contacts.ts:537`. Phone-book import is mobile-only (`src/screens/contacts/phoneBook.ts`) |
| Upcoming birthdays modal (`Index.tsx:118`, `BirthdaysModal.tsx`) | HAS as a strip on the list, `app/contacts/index.tsx:102,245,362` |
| Find duplicates (`Index.tsx:122`, `DuplicatesModal.tsx`) | HAS `app/contacts/duplicates.tsx`, `src/api/contacts.ts:518` |
| Create / edit: names, nickname, company, job, phones, emails, addresses, birth date, website, notes (`ContactDrawer.tsx:304-570`) | HAS `src/screens/contacts/ContactForm.tsx` |
| Gender, closeness, social links, tags (`ContactDrawer.tsx:425,432,489,500`); old audit #24 | **FIXED** `ContactForm.tsx:20,316-321` |
| Favourite (`ContactDrawer.tsx:444`) | HAS `app/contacts/index.tsx:187-188` |
| Photo upload / remove (`ContactDrawer.tsx:390-394`) | HAS `src/api/contacts.ts:436,444` |
| Documents: upload, rename, delete, preview (`ContactDrawer.tsx:345,521`, `ContactDocumentPreview.tsx`); old audit #8 | **FIXED** `src/screens/contacts/ContactDocuments.tsx`, `app/contacts/document.tsx`, `src/api/contacts.ts:454-467` |
| Export one vCard (`ContactDrawer.tsx:234`) | HAS (share sheet) `src/screens/contacts/useContactActions.tsx:104-112` |
| Export all / selected (`contacts.api.ts:173`) | HAS `app/contacts/index.tsx:138-201` |
| Delete to trash (`ContactDrawer.tsx:365`) | HAS |
| Family section: add a relative (role, qualifier step/half/adoptive), change role, remove (`FamilySection.tsx:172,195`, `AddFamilyMemberModal.tsx`) | HAS `src/screens/contacts/ContactCard.tsx` (add sheet ~`:530-560`), `src/api/contacts.ts:475,487,501`, `family.ts` (gendered roles, so old #25 is FIXED) |
| "This is me" (`contacts.api.ts:78`) | HAS `ContactCard.tsx:225-231` |
| Family tree (`FamilyTreeView.tsx`, SVG pan/zoom) | PARTIAL by design: rows by generation, `app/contacts/family.tsx` |
| Deceased / former shown on a tie (`FamilySection.tsx:146-147`) | HAS (parsed, `src/api/contacts.ts:60,185,269`) |
| **My Family tab** (`FamilyTab.tsx`, `GET contact_app/contacts/family_members`, `contacts.api.ts:64`) | **MISSING**: no caller of `family_members` |
| Search in the "who is it?" relative picker | **STILL OPEN** (old audit P2): `ContactCard.tsx:543-552` is a plain ActionSheet over the whole book, with no filter |
| Search covers every page | PARTIAL: `src/api/contacts.ts:399` asks for server page 1 only, merged with a local filter of the loaded book |
| Tablet split ≥ 800 dp (MISSING_FEATURES #3) | **FIXED** `src/screens/contacts/split.ts:13`, used in `app/contacts/index.tsx` |
| Shared into Contacts (vCard from another app) | mobile-only, HAS `src/screens/pages/ShareIntentBridge.tsx` |
| "Message" on a contact | N/A: the web has no such action and no server link from contact to account (MISSING_FEATURES row "—") |

**Missing, with endpoints:**
- My Family tab: `GET /api/v1/contact_app/contacts/family_members`, plus the "mark yourself first" empty state (`FamilyTab.tsx` header). **1–1.5 d**
- A filter in the relative picker: client only. **0.5 d**
- Full-book search: page through the `search` results, or reuse `allPages`. **0.25 d**

**Estimate: ~2 dev-days.**

---

## 2. Calendar

**Summary:** 15 web actions. 15 HAS. **No gaps found.** The web never calls `trashes`, `destroyPermanently` or `dismissReminder` (grep across `app/javascript`), so mobile owes nothing there.

| Web action | Mobile |
|---|---|
| Month view, prev/next, today (`pages/calendar/Index.tsx:127-178`) | HAS `app/calendar/index.tsx:107,123-127`, `src/screens/calendar/MonthGrid.tsx` |
| Agenda view (`Index.tsx:138`, `AgendaList.tsx`) | HAS `app/calendar/index.tsx:114-163` (default view) |
| New event (`Index.tsx:191`) | HAS `app/calendar/edit.tsx`, `src/screens/calendar/EventForm.tsx` |
| Kind (event/appointment/birthday/anniversary), all-day, location, description, recurrence + until, colour, reminders (`EventDrawer.tsx:14-16,42-93`) | HAS `EventForm.tsx:7-30`, `src/api/calendar.ts` KINDS/RECURRENCES/REMINDER_PRESETS, `colors.ts` |
| Show / update / delete (`calendar.api.ts:49-66`) | HAS `src/api/calendar.ts:271-283`, `app/calendar/event.tsx:83` |
| Undo a delete (restore) | HAS `src/api/calendar.ts:287`, the undo bar `app/calendar/index.tsx:174-198,350` |
| Guests: list / invite by email + role / change role / remove (`EventShareSection.tsx`) | HAS `src/screens/calendar/GuestsSection.tsx`, `src/api/calendar.ts:292-306` |
| Accept / decline (`EventShareSection.tsx:66`) | HAS `app/calendar/event.tsx:89-90`, `src/api/calendar.ts:310` |
| Leave an event | HAS `app/calendar/event.tsx:91` |
| Upcoming card on Home (`components/calendar/UpcomingCard.tsx`) | HAS `app/home.tsx:41-44` |
| Open in maps | mobile-only `app/calendar/event.tsx:58` |

Old P2 items (no back on an edit load error, FAB under the Undo bar): not re-checked on a device. `app/calendar/index.tsx:350-358` positions the Undo bar at `insets.bottom + space.lg`. The overlap is **NOT MEASURED**.

**Estimate: 0 d** (device QA only).

---

## 3. Chats (conversations between people)

**Summary:** 17 web actions. 17 HAS. **No gaps found.** Old audit #4 (start a conversation), #29 (search) and #30 (members) are all **FIXED**.

| Web action (file) | Mobile |
|---|---|
| List + search conversations (`pages/conversations/Index.tsx`, `conversations.api.ts:37`) | HAS `app/chats.tsx:19-64`, `src/api/conversations.ts:209` |
| New 1:1 / named group via people search (`NewConversationDialog.tsx`, `users/global_users`) | HAS `src/screens/people/NewConversationSheet.tsx`, `PeoplePicker.tsx`, `src/api/conversations.ts:261,267,332` |
| Members: add, promote admin, remove (`MembersPanel.tsx`, `conversations.api.ts:69`) | HAS `src/screens/people/MembersSheet.tsx`, `src/api/conversations.ts:282-292` |
| Delete / leave a conversation (`conversations.api.ts:81`) | HAS `src/api/conversations.ts:298`, `app/chat/[id].tsx:666-686` |
| Mark read, unread count (`conversations.api.ts:90,97`) | HAS `src/api/conversations.ts:241,247`, plus the badge in `useShellBadges` |
| Load latest / older (`MessageList.tsx:62-140`) | HAS `src/api/conversations.ts:351` + the cursor |
| Search inside a thread (`ThreadSearch.tsx`) | HAS `src/screens/people/ThreadSearch.tsx`, `app/chat/[id].tsx:31-35` |
| Send / edit / delete / copy a message (`MessageList.tsx:260-358`) | HAS `src/api/conversations.ts:366,378,392`; copy is in `ReactionSheet.tsx` |
| React with an emoji (toggle) | HAS `src/api/conversations.ts:411`; failure is shown since `app/chat/[id].tsx:479` (old P2 FIXED) |
| Typing indicator, read receipts (ConversationChannel / MessageChannel) | HAS `src/lib/cable.ts`, `app/chat/[id].tsx:23-40,89` |
| Dictation in the composer | HAS `src/screens/people/PersonComposer.tsx` (mic) |
| Floating mini-chat dock (`ChatLauncher.tsx`, `MiniChat.tsx`) | N/A (desktop affordance) |

Still open (minor, old P2): there is no "ask the assistant" button inside a person thread. **0.25 d**

**Estimate: ~0.25 d.**

---

## 4. AI assistant

**Summary:** 19 web actions. 18 HAS, 1 MISSING. Old #33 (Clear leaves the cache) is **FIXED** (`src/components/sessions/SessionsSheet.tsx:36` calls `clearTranscript`). Old #35 (no `context`) is **FIXED** (`app/chat.tsx:466-467` sends `pageContextFor(...)`).

| Web action | Mobile |
|---|---|
| Ask (`POST ai/show`, `ai.api.ts:18`) | HAS `src/api/ai.ts:367-376` |
| Transcript (`conversations/:id/messages`) | HAS `src/api/ai.ts:455,477` |
| Sessions: list / new / rename / activate / clear / delete (`ai.api.ts:54-88`, `AiSessionBar.tsx`) | HAS `src/api/ai.ts:493-563`, `SessionsSheet.tsx` |
| Per-session instructions and scope (PATCH sessions) | HAS `SessionsSheet.tsx:39` (`instructions`, `scope`), `src/api/ai.ts:539` |
| Documents: list / upload / delete / preview (`AiDocumentChips.tsx`, `AiDocumentPreview.tsx`) | HAS `src/api/ai.ts:570-598`, `app/chat.tsx:54,141-160` |
| Feedback up/down + reason (`ai/feedbacks`) | HAS `src/api/ai.ts:420,433` |
| Undo what the assistant wrote (`ai/undos`) | HAS `src/api/ai.ts:399` |
| Read aloud (`ai/messages/:id/speech`) | HAS `src/api/speech.ts:141`, `src/stores/readAloud.store.ts` |
| Dictation (`AiComposer.tsx:45-162`) | HAS `src/components/chat/Composer.tsx:32,116-129` |
| Source links into records | HAS via `src/lib/inAppRoute.ts` |
| Drag-drop files, floating window (`AiAssistantWindow.tsx`, `AiChat.tsx:445`) | N/A |
| **Memory review card** (`MemoryReviewCard.tsx`; `GET ai/memory_review`, `PATCH ai/memory_review/:id`, `DELETE ai/memory_review/:id`) | **MISSING**, still open (old #34): no caller in mobile `src/` or `app/` |

**Estimate: ~1 d** (the card in the assistant, keep / update / forget).

---

## 5. Profile / account / auth

**Summary:** 30 web actions. 24 HAS, 6 MISSING. Old #38 (2FA, devices, login history, username, birth date, cover, AI usage, key lending, MCP, follows) is **FIXED**. Old #39 (terms checkbox) is **FIXED** (`app/sign-up.tsx:130-140`, `src/api/auth.ts:272-282`). Old #11 (email locked) is **FIXED** (`app/change-email.tsx`, `users/me/email_change` + `/confirm`).

| Web action | Mobile |
|---|---|
| Edit name, username, birth date (`EditProfileDrawer.tsx:275`) | HAS `app/profile.tsx:101-130,275` |
| **Bio** (`EditProfileDrawer.tsx:290-295`) | **MISSING**: no `bio` in `app/profile.tsx` |
| Avatar + cover upload / remove (`EditProfileDrawer.tsx:157-232`, `users/:id/destroy_avatar`) | HAS `app/profile.tsx:153,198-229`, `src/screens/account/PhotoSheet.tsx` |
| Following / followers lists, follow / unfollow (`profile.api.ts:21-33`) | HAS `app/follows.tsx:78-79`, `src/api/follows.ts:38-46` |
| Search inside following / followers (`?search=`) | **MISSING** (`src/api/follows.ts:38` sends only `page`) |
| **Another person's profile** `/profile/:id`: online, joined on, follow, message, block (`pages/profile/Show.tsx:285-412`) | **MISSING**: there is no person-profile screen. A follows row cannot open one |
| **Block / unblock** (`POST blocks/block`, `blocks/unblock`, `profile.api.ts:36-39`) | **MISSING** |
| Change password | HAS `app/change-password.tsx` (`users/:id/change_password`) |
| Change email | HAS `app/change-email.tsx` |
| 2FA enable / disable / verify at login | HAS `app/security.tsx`, `app/two-factor.tsx`, `src/api/security.ts` |
| Trusted devices, login history (delete one / all), active sessions (revoke) (`devices.api.ts`) | HAS `app/security.tsx`, `src/api/*` |
| API keys: list / create / revoke (`api_keys.api.ts`) | HAS `app/api-keys.tsx` |
| MCP connections list / disconnect + Connect Claude (`McpConnections.tsx`, `ConnectClaude.tsx`) | HAS `app/connect-claude.tsx`, `mcp/connections` |
| AI keys: add / replace / activate / delete / lend / limit / unlend (`ai_keys.api.ts:56-92`) | HAS `app/ai-keys.tsx`, `src/api/aiKeys.ts` |
| AI usage panel (`ai_usage`) | HAS |
| **Morning brief toggle** (`MorningBriefToggle.tsx`, `PATCH users/:id {aiMorningBrief}`) | **MISSING**: no `morning` string in mobile `src`/`app` |
| SafeZone PIN settings (`SafezonePinSettings.tsx`) | in the SafeZone scope; `app/profile.tsx:396` links to it |
| Delete account | HAS `app/delete-account.tsx` |
| Language | HAS (en/fr, `src/stores/language.store.ts`) |
| Sign up / sign in / forgot password | HAS `app/sign-up.tsx`, `sign-in.tsx`, `forgot-password.tsx` |
| **Reset password in-app** (`pages/auth/ResetPassword.tsx`, reached from the email link) | **MISSING**, still open (old #12): there is no reset screen, and the link opens the web |
| OAuth consent `/oauth/authorize` | N/A (a consent page for MCP clients, served by the web) |
| Privacy page | HAS `app/privacy.tsx` (with the DRAFT banner; release gate) |

**Missing, with endpoints:**
- Bio: `PATCH /api/v1/users/:id`. **0.25 d**
- A person's profile screen with follow / message / block: `GET /api/v1/users/:id`, `POST /api/v1/blocks/block|unblock`, `POST /api/v1/conversations`. **1.5 d**
- Follows search: `GET /api/v1/users/:id/following?search=`. **0.25 d**
- Morning brief toggle: `PATCH /api/v1/users/:id`. **0.25 d**
- In-app reset: `PUT /api/v1/users/reset_password` with the token (as the web's `ResetPassword.tsx` does). It also needs the email link to open the app, which means universal links (cross-cutting). **1 d** on top of those.

**Estimate: ~3.25 d** (plus the universal-link work below).

---

## 6. Home + Workspace

**Summary:** Home tiles HAS for every app that exists on mobile. Workspace is MISSING.

| Web | Mobile |
|---|---|
| App grid from `lib/apps.ts` (SafeZone, Notes, Todos, Pages, Finance, Flow, Conversations, Doc, Contacts, Calendar, Tables, Workspace, AI) | HAS for SafeZone, Notes, Todos, Pages, Finance, Chats, Contacts, Calendar, Assistant, Notifications, Conversations (`src/apps/registry.ts:46-57`). **Flow, Doc, Tables and Workspace have no tile**, because those apps do not exist on mobile (other auditors' scope) |
| UpcomingCard (`Home.tsx:257`) | HAS `app/home.tsx:41-44` |
| Hero, "What's new" promo cards, sign-up CTA (`Home.tsx:200-330`) | N/A on purpose (`app/home.tsx:7-14`) |
| Unread badges (old P2) | **FIXED** `src/hooks/useShellBadges.ts`, `app/home.tsx` (`capBadge`) |
| App switcher | HAS `src/components/shell/AppSwitcher.tsx` |
| **Workspace split screen** (`pages/workspace/Index.tsx`, `components/workspace/WorkspaceScreen.tsx`, `PaneRouter.tsx`, `PaneAppPicker.tsx`): several apps side by side | **MISSING**. It only makes sense on a tablet, and `app.json:6` locks `orientation: portrait` |

**Estimate:** Workspace for tablets is **4–6 d** (two panes, a pane app picker, landscape unlocked, every screen made pane-safe). On phones it is not applicable. This is the owner's scope call.

---

## 7. Cross-cutting

| Area | Web has | Mobile has | Gap / estimate |
|---|---|---|---|
| **Global search** | `components/search/SearchDialog.tsx` + `registry.ts` (static page entries) + `GET /api/v1/search?q=&per_source=&only=` (`search_controller.rb:10-16`; sources `services/search/sources.rb`: note, space, file, todoGroup, task, event, contact, expense, income, loan, password, paymentCard, identity, flow project/card, conversation, message, signature, ai document). Hits carry a web `to` path. Recent searches (`useRecentSearches.ts`) | **MISSING**: no caller of `/api/v1/search`. Search exists per app only | A search screen from the header: debounced query, results grouped by `group`, open with the existing `routeForWebPath` (`src/lib/inAppRoute.ts:79-136`), and "ask the assistant" for kinds with no screen (flow, doc, signature). **2–3 d** |
| **Notifications (in-app)** | Bell (`NotificationBell.tsx`): list, open → `navigate(path)` (`:147`), chat kind → conversation (`:142`), mark one read (`:261`), mark all read, clear read, delete. Kinds sent by the server: `chat.message`, `calendar.share`, `calendar.invite_response`, `calendar.reminder`, `page_app.share`, `ai.morning_brief`, `table_app.{share,comment,mention,form_invite,form_submission}` | HAS `app/notifications.tsx`: open routes by path (`:125-140`, old P0 #3 **FIXED**), mark read per row (`NotificationRow.tsx:143`, old #36 FIXED), mark all, clear read, delete (long press), loading state (`:355`), live updates through `NotificationChannel` (`:115`) while the screen is open. The shell badge polls plus AppState (`useShellBadges.ts:34-39`) | `table_app.*` has no mobile screen, so it falls back to a composed assistant question (`:136-139`). That is by design until Tables exists on mobile. **0 d** |
| **Remote push** | None, on either side. The server has no device-token model or endpoint (no `push_token`/`device_token` in `app`, `config` or `db/schema.rb`); `Notifications::Deliver` writes a row and broadcasts on the socket only | Local notifications only (note reminders, `src/screens/notes/reminderNotifications.ts:29`). `plugins/withoutPushEntitlement` strips `aps-environment` on purpose | **MISSING both sides** (old #42 still open). Server: a `device_tokens` table + `POST/DELETE /api/v1/device_tokens` + an Expo push send inside `Notifications::Deliver` (+ server-side note reminders, MISSING_FEATURES line 32). Mobile: register the token, route a tap via `routeForWebPath`, enable Push on the App ID, delete the plugin and its test. **4–6 d** (a native build; spends EAS quota) |
| **Realtime** | Channels: Conversation, Message, Notification, PageApp::Transfer (`useTransferChannel.ts`). `NoteApp::NoteChannel` exists server-side and nothing in the web subscribes to it | HAS Conversation + Message (`src/lib/cable.ts`, `app/chats.tsx:112`), Notification on the notifications screen only. No Transfer channel (Pages scope) | Minor: subscribe to `NotificationChannel` app-wide so the badge is live rather than polled. **0.5 d** |
| **Offline / caching** | None (React Query in memory) | React Query in memory, no persister. Reachability store + `OfflineBanner.tsx` (`app/_layout.tsx`) | Parity holds. Going past the web (a persisted cache for read-only offline) would be **2–3 d** and a product decision |
| **Share into MultiMagic** | N/A | HAS `expo-share-intent` (`app.json:83-95`, iOS extension + Android `*/*`). vCard / contact text → Contacts; files, images, video → Pages (`src/screens/pages/ShareIntentBridge.tsx:9-14,172-196`). Cold start lands on `app/share.tsx` via `app/+native-intent.tsx` | **Plain text and URLs are dropped** ("Pages keeps files, not sentences", `ShareIntentBridge.tsx:14`). Candidates: a shared text or link → a new Note, or "ask the assistant". **0.5–1 d** |
| **Deep links / universal links** | Web URLs | Custom scheme `multimagic://` only (`app.json:8`). No `associatedDomains`, no `autoVerify` https intent filters, so web links in emails (reset password, share invites, calendar invites) open the browser | **MISSING**. AASA + `assetlinks.json` served by Rails, the app.json entries, and mapping incoming paths through `routeForWebPath`. **1.5–2 d** (native build). Needed by the in-app reset |
| **Widgets** | N/A | None | MISSING (e.g. upcoming events, a quick-ask widget). Native code on both platforms. **3–5 d** |
| **Quick actions** (home-screen long press) | N/A | None | MISSING ("Ask", "New note", "Scan to Pages"). `expo-quick-actions`. **0.5–1 d** |
| **Biometric lock** | N/A (SafeZone PIN) | None; `expo-local-authentication` is not a dependency | MISSING_FEATURES #4 still OPEN: an owner decision, because it reverses the "PIN is never stored" rule. **1–2 d** |
| **Storage quota** | `GET /api/v1/storage` (`page_app/api/storage.api.ts:39`), shown in Pages | Only handles the 422 `storage_quota_exceeded` on upload (`src/stores/uploads.store.ts:33-34`). No usage meter | MISSING meter: call `GET /api/v1/storage` in Pages or Account. **0.5 d** |
| **i18n** | en + fr app-wide (`i18n/index.ts:42`); the public table forms also have ar / fa / ps (`i18n/locales/tableForms.public.*`) | en + fr (`src/i18n/locales/en.ts`, `fr.ts`), synced through `users.lang` | Parity for the app. ar/fa/ps only matter if public forms ever render in the app (they do not). **0 d** |
| **Tablet layouts** | Responsive web | `supportsTablet: true`, but `orientation: portrait` (`app.json:6,11`). Split views: Contacts HAS (`split.ts`); Home/AppHeader/AppSwitcher read width. Others not checked here | Landscape is locked. Workspace (above) and per-app splits are the owner's call. Not counted |
| **MCP / Connect Claude** | `ConnectClaude.tsx`, `McpConnections.tsx`, OAuth consent page | HAS `app/connect-claude.tsx`, `app/api-keys.tsx` | none |
| **Public pages `/f/:slug`** (table forms) | `TablePublicForm` outside the shell (`routes/AppRoutes.tsx`) | none | N/A: a public form is for people without the app. It can stay on the web. If universal links land, exclude `/f/*` from them |
| **Legal** | `/privacy` (public), `GET api/v1/legal/privacy` | HAS `app/privacy.tsx` with the DRAFT banner; terms checkbox at sign-up | The DRAFT banner is a release gate (owner approval). **0 d** |
| **About page** `/about` | yes | none | N/A (marketing) |

---

## Totals

| App | HAS | PARTIAL | MISSING | Dev-days |
|---|---|---|---|---|
| Contacts | 23 | 2 | 2 | ~2 |
| Calendar | 15 | 0 | 0 | 0 |
| Chats | 17 | 0 | 0 (1 minor) | ~0.25 |
| Assistant | 18 | 0 | 1 | ~1 |
| Profile / auth | 24 | 0 | 6 | ~3.25 |
| Home / Workspace | all tiles that can exist | — | Workspace | 4–6 (tablet, optional) |
| Cross-cutting | — | — | search, push, universal links, quick actions, widgets, storage meter, share text, biometric | ~13–22 |

**What I would build first:** global search (2–3 d), then universal links with the in-app reset (2.5–3 d), then remote push (4–6 d, both sides, a native build), then the small screens: memory review, My Family tab, person profile with block, bio, morning brief (~4.5 d).
