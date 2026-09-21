# Store listing — DRAFT for Hamma9900

**Nothing here has been submitted, and nothing here should be pasted into a
console without being read.** Every word below goes in front of a reviewer and
in front of whoever installs the app, and both of those are his call. This is a
draft to react to.

Where an answer depends on something only he knows, **the question is left in
place rather than guessed**, and all of them are gathered in the last section
so they can be answered in one sitting.

Facts taken from the repo rather than from memory: `app.json` (`name:
MultiMagic`, `version 1.0.0`, `android.package co.byseven.multimagic`,
`ios.bundleIdentifier com.multimagics.mobile`), and the privacy text as the app
actually renders it (`src/content/privacy.generated.ts`, sha `852ca75a38c3`).

---

## 1 · Play: title and short description

**Title** (30 char limit) — `MultiMagic` (10).

**Short description** (80 char limit), English:

> Ask about your own notes, money, contacts and calendar — and get an answer.

78 characters. It says the one thing that distinguishes this from every other
assistant: the answers come from *your* data.

**Short description, French:**

> Interrogez vos notes, finances, contacts et agenda — et obtenez une réponse.

76 characters.

## 2 · Play: full description (4000 char limit)

**English:**

> MultiMagic answers questions about your own information.
>
> Your notes, documents, contacts, expenses, loans, budgets and calendar live
> in MultiMagic. Ask a question in plain words — "what did I note about the
> apartment?", "do I owe anyone money?", "when did I last speak to Ahmad?" —
> and the assistant finds the relevant passages of your own records and answers
> from them.
>
> WHAT YOU CAN DO
> • Ask anything about what you have stored, and get an answer with the
>   reasoning drawn from your own data
> • Dictate instead of typing — the recognition runs on your phone
> • Attach a photo, a camera shot, a PDF or a CSV to a conversation
> • Keep separate conversations, and narrow one to particular apps
> • Message the people you share with
> • See your day, and what is next
> • Have an answer read aloud
> • English and French, switchable in the app
>
> HOW YOUR DATA IS HANDLED
> MultiMagic runs on its own server. To answer a question, the assistant sends
> that question and the few relevant passages to an AI provider — today that is
> Google's Gemini API, or your own provider if you add your own key. Your notes
> and records are searched on our server and are never sent anywhere to be
> indexed.
>
> Dictation uses your device's own speech engine, not our server.
>
> Deleting a conversation deletes its messages and the files in it, and touches
> nothing else. Deleting your account removes everything.
>
> No advertising. No analytics sold on. No training anybody's model on your
> data.

**French** — the same structure, written rather than machine-translated, and it
should be read by somebody who speaks it before it ships:

> MultiMagic répond aux questions sur vos propres informations.
>
> Vos notes, documents, contacts, dépenses, prêts, budgets et votre agenda sont
> dans MultiMagic. Posez une question en langage courant — « qu'est-ce que
> j'avais noté sur l'appartement ? », « est-ce que je dois de l'argent à
> quelqu'un ? » — et l'assistant retrouve les passages pertinents de vos
> propres données et répond à partir d'eux.
>
> CE QUE VOUS POUVEZ FAIRE
> • Poser une question sur ce que vous avez enregistré
> • Dicter au lieu d'écrire — la reconnaissance se fait sur votre téléphone
> • Joindre une photo, une prise de vue, un PDF ou un CSV
> • Garder des discussions séparées, et en restreindre une à certaines apps
> • Écrire aux personnes avec qui vous partagez
> • Voir votre journée et ce qui vient ensuite
> • Faire lire une réponse à voix haute
> • Français et anglais, au choix dans l'app
>
> VOS DONNÉES
> MultiMagic fonctionne sur son propre serveur. Pour répondre, l'assistant
> envoie votre question et les quelques passages pertinents à un fournisseur
> d'IA — aujourd'hui l'API Gemini de Google, ou le vôtre si vous ajoutez votre
> clé. Vos notes ne sont jamais envoyées ailleurs pour être indexées.
>
> La dictée utilise le moteur vocal de votre téléphone, pas notre serveur.
>
> Supprimer une discussion supprime ses messages et ses fichiers, et rien
> d'autre. Supprimer votre compte supprime tout.
>
> Pas de publicité. Pas de revente de statistiques. Aucun entraînement de
> modèle sur vos données.

## 3 · What's new (500 char limit)

1.0.0 is the first release, so there is no "what's new" in the usual sense.

> First release. Ask about your own notes, money, contacts and calendar and get
> an answer drawn from them. Dictation, file attachments, separate
> conversations, and English or French.

**French:**

> Première version. Interrogez vos notes, finances, contacts et agenda et
> obtenez une réponse tirée de vos données. Dictée, pièces jointes, discussions
> séparées, français ou anglais.

## 4 · Screenshot order, and why

I shot nine screens at 1080×1920 (`docs/store/play-phone/`). A listing should
not use all nine. **The order is a decision and here is the argument for it:**

1. **`chat`** — the product. An actual question and an actual answer drawn from
   real records. If somebody sees one picture, it must be this one.
2. **`sessions`** — that conversations are separate and nameable, which is what
   makes it a tool rather than a toy.
3. **`people-chat`** — that other people are in here too.
4. **`calendar`** — a second kind of data, so "your own information" reads as
   breadth rather than as one feature.
5. **`account`** — deletion and privacy visible, which is unusual to show and
   is the honest thing to show.

**Left out and why:** `sign-in` (nobody installs an app to see a login),
`upload` (a sheet, not a screen), `notifications` and `profile` (both empty or
near-empty on the QA account, and a thin screenshot argues against you).

**A caveat that belongs in the decision.** Those shots are of the **QA
account**, which holds three conversations, no notifications and no events
today. The calendar and notification screens show empty states. **A listing
screenshot of an empty screen is worse than no screenshot**, so either the two
weak ones stay out, or they are re-shot against an account with plausible
content in it — and that is his real account, which the rig must not touch. His
call, and it is question 9 below.

## 5 · Feature graphic (Play, required)

**1024 × 500 px, PNG or JPEG, no alpha.** No screenshot satisfies it and none
can — it is a banner, not a capture. It is the one listing asset that has to be
designed.

What it should carry, from `docs/design/IDENTITY.md`: the icon's own dark
ground (`#102125` → `#2d5363` diagonal), the teal accent `#48aaa2`, the
wordmark, and one line of text. **Do not put a phone frame in it** — Play
crops it differently across surfaces and a frame is the first thing to be cut.

Suggested line, English: *"Ask about your own notes, money and calendar."*
French: *« Interrogez vos notes, vos finances, votre agenda. »*

**Not produced here.** Generating a brand banner is a design decision, not a
QA one, and `assets/icon.svg` is the only source asset in the repo.

## 6 · Category and content rating

**Category:** `Productivity`. `Tools` is the other candidate and is wrong —
Tools is utilities, and this is a thing you use to think about your own
records.

**Tags:** assistant, notes, personal finance, calendar, productivity.

**Content rating questionnaire** — Play uses IARC. Answers that follow from the
code, each checkable:

| Question | Answer | Why |
|---|---|---|
| Violence, sexual content, profanity, drugs | **No** to all | the app has no content of its own; it renders the user's own records |
| Gambling | **No** | |
| Users can interact / share content | **Yes** | people-chat exists; sharing is between accounts the user already shares with |
| Shares user location | **No** | no location permission is declared anywhere in `app.json` |
| Allows unrestricted internet access | **No** | the app talks to one API and opens links only through `Linking.openURL` |
| Digital purchases | **No** | no IAP is configured |
| User-generated content visible to others | **Yes, restricted** | only to people the user already shares with; **see question 5** |

**The interaction answers push the rating up**, which is correct and not worth
arguing around: an app where people message each other is rated as one.

## 7 · Data safety (Play) — every answer tied to the privacy text

The rule: these must match what `PRIVACY.draft.md` **says**, not what is
convenient. Each row cites the section it comes from.

| Data type | Collected | Shared | Purpose | Source |
|---|---|---|---|---|
| Name, email | **Yes** | No | account, sign-in, email notifications | *Who holds your data*, *Email* |
| Messages / user content (notes, contacts, money, documents, calendar, conversations) | **Yes** | **Yes — to the AI provider** | answering the user's question | *The assistant sends your question to an AI provider* |
| Files and documents | **Yes** | **Yes — same path** | the assistant reads them to answer | *Files you upload* |
| Photos | **Yes** (only ones the user attaches) | same path | attachment to a conversation | *Files you upload* |
| Audio / voice | **No** | **No** | dictation is on-device | *Dictation uses your phone, not our server* |
| Device identifier | **Yes** | No | keeping the user signed in; spotting a token on a device it was not issued to | *Recognising your device* |
| Approximate/precise location | **No** | No | — | no location permission exists |
| Analytics / crash logs | **See question 6** | | | not stated in the privacy text |

**Answers to the standard declarations:**

- **Is data encrypted in transit?** — **See question 4.** The repo's
  `.env.example` shows `http://` for local development only; the production URL
  is not in this repo, so this cannot be answered from here. It must be
  **Yes/HTTPS** before submission, and it is a rejection if it is not.
- **Can users request data deletion?** — **Yes.** `DELETE /api/v1/users/me`
  exists and the account screen reaches it. *Deleting a conversation, and
  deleting your account.*
- **Is there a way to delete an account from outside the app?** — **See
  question 7.** Play requires a **publicly reachable web URL** for account
  deletion, not only an in-app path.
- **Is data collected required or optional?** — the account data is required;
  attachments and dictation are optional.
- **Committed to Play's Families policy?** — **No**, the app is not directed at
  children. *Confirm: question 8.*

**The one that must not be smoothed over:** user content **is** shared with a
third party, because the question and the retrieved passages go to Google's
Gemini API. The privacy text says so plainly and the data-safety form must say
so too. An app that answers questions using an external model and declares no
sharing is the kind of mismatch that gets found.

**The billing ledger** — the rows kept after account deletion — are named in
the privacy text and carry no name and no content. They are not a data-safety
category on their own, but if the form asks whether anything survives deletion,
the answer is yes and that is what it is.

## 8 · Apple — what exists and what does not

**No iOS build has ever succeeded**, so nothing here is verified against a
binary. Written now so it is not written under time pressure later.

- **Subtitle** (30): `Your notes, answered.` (21)
- **Promotional text** (170): *Ask about your own notes, money, contacts and
  calendar, and get an answer drawn from them. Dictation runs on your phone.*
- **Keywords** (100, comma-separated, no spaces): 
  `notes,assistant,personal,finance,calendar,contacts,productivity,search,documents`
- **App Privacy** — the same answers as §7. Apple's "Data Used to Track You"
  is **None**; the device identifier is compared only against the user's own
  sessions and is not used across apps. *Recognising your device*, *What we do
  not do*.
- **Screenshots** — 6.9″ and 6.5″ iPhone plus 13″ iPad are required and
  **none can be produced on this box**.
- `ITSAppUsesNonExemptEncryption` is already declared in `app.json`;
  `STORE_READINESS.md` §6 says do not flip it.

## 9 · The privacy policy URL

Play and Apple both require a **publicly reachable** privacy policy URL, and a
reviewer will open it.

**The text currently says DRAFT**, and the app renders a banner saying so. That
banner is a release gate by `docs/design/account/SPEC.md` row 13. **A reviewer
opening a policy headed "Draft — not yet approved" is a rejection risk on its
own**, independently of what the policy says.

The backend serves it at `GET /api/v1/legal/privacy` and the web renders it, so
the URL exists once the backend is deployed. **Question 3.**

---

## What only he can answer

Gathered so they can be done in one sitting. Nothing above was guessed in their
place.

1. **Developer name and address.** Play publishes a physical address for the
   developer account. Which entity and which address?
2. **Support email and marketing URL** for both listings.
3. **Privacy policy URL** — the public one, once the backend is deployed. And:
   **does the DRAFT banner come off before submission?** It is a gate.
4. **Is the production API HTTPS?** Needed for the data-safety transit answer,
   and a rejection if not.
5. **Who can see a user's shared content?** I have described it as "people the
   user already shares with" from the people-chat code. If that is wrong the
   content-rating answer changes.
6. **Any analytics or crash reporting in production?** The privacy text
   mentions none and I found none in the app, but a server-side tool would
   still have to be declared.
7. **The web account-deletion URL.** Play wants one outside the app.
8. **Confirm the app is not directed at children** (Families policy).
9. **Screenshots: empty screens or real ones?** The QA account's calendar and
   notifications are empty. Re-shooting with plausible content means his real
   account, which the rig must not touch.
10. **Does the French listing ship at launch**, or English first?
11. **Who reads the French copy before it ships?** It is written here rather
    than machine-translated, and it still wants a native reader.
