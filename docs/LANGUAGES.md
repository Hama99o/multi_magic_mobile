# Languages — English and French, and which French is mine

Hamma9900: *"same lang as we have in web, both mode."*

The app ships **English and French**, the same two the web has
(`multi_magic/app/javascript/i18n/index.ts`, `supportedLngs: ['en', 'fr']`),
switched from the **sessions sheet beside the theme** and saved on the **same
`users.lang` column the web's switcher writes** — so a switch on the laptop
reaches the phone and back.

## The one thing that needs his eye

**310 French strings below were written by this session and have not been
read by a French speaker.** Everything else is the web's own French, taken
verbatim so the two clients cannot drift into two translations of one idea
("Discussions", not "Conversations"; "D'après", not "Depuis").

This is a list rather than a review step because a review step nobody
scheduled is a promise, and a list he can read on a phone in five minutes is
not. **Anything here he changes, changes in one file** — `src/i18n/locales/fr.ts`.

Three were shortened before he saw them, because the length test caught them
sitting in a row that is 360 dp wide: `files.cameraHint` ("En prendre une
maintenant" → "En prendre une"), `scope.searchAll` ("Chercher dans toutes les
applications" → "Chercher partout") and `account.privacyPolicy` ("Politique de
confidentialité" → "Confidentialité", which is what the row says on every
French app and what the screen it opens is titled).

## What is checked, and what is not

| Checked | How |
|---|---|
| Every key the app calls resolves, in both languages | `src/i18n/__tests__/keys.test.ts` greps every `t("…")` in `app/` and `src/` and asks i18next for each. A missing key renders as the key itself, which nothing else catches |
| The two locales have the same keys, no empty values, the same interpolations | `src/i18n/__tests__/locales.test.ts` |
| No French value is still the English one | same file — the failure that a type check cannot see, because a copied English string type-checks |
| Every screen renders every handle **and reads French** at 360 dp | `src/screens/__tests__/screens.render.test.tsx`. Each row carries a distinctive French sentence, because a handle is on a container and the English text inside it survives a language switch untouched — proven by planting exactly that |
| The choice survives a restart, reaches the server, and is not overridden by it | `src/stores/__tests__/language.store.test.ts` |
| No `accessibilityLabel` or `accessibilityHint` is a bare English string | `no-restricted-syntax` in `.eslintrc.js`. Added after two of them shipped |
| Every key **defined** is called by something | `keys.test.ts`, the other direction. An orphan key is the receipt for a string that went into a component as a literal instead — `docs/TESTING.md` §8 |
| The grep knows every name `t` is imported under | same file. It knew `t(` and not `translate(`, so keys reached through the alias were never resolved at all |

**Two strings were English until 2026-09-19, and no gate above could have seen
them.** `EventRow`'s hint and `PersonMessageRow`'s *"Long press to react"* were
written as literals in JSX, so a French user's screen reader read them in
English — the one part of the interface that never got translated, in the place
nobody looks, for the users least able to route around it. `keys.test.ts`
resolves every key the app *asks for*; it cannot see a sentence that never asks.
The render tests read `testID`s and visible text, not the accessibility tree.
The gate is now an eslint rule, and it failed on both of them before it passed.

Chasing it turned up that `calendar.event` had been written in both locales,
asserted, and listed here — and called by nothing, while `EventRow`
interpolated its own English template beside it. Three more dead keys came out
with it (`common.loading`, `language.english`, `language.french`), and they are
gone rather than kept, because a key kept for later is a key nobody can tell
from a key that was forgotten.

**Not checked: whether a French string FITS.** Jest has no layout, so nothing
here measures pixels. The 1.9× length budget in `locales.test.ts` is a proxy
for a translation that has wandered into an explanation, and it is named as
one in the file. The real check is a device at 360 dp in French, and it has
not been done.

## The French this session wrote

| Key | English | French |
|---|---|---|
| `account.deleteAccount` | Delete account | Supprimer le compte |
| `account.deleteCaption` | This removes everything and cannot be undone. | Cela supprime tout et c’est irréversible. |
| `account.deleteCaptionUnavailable` | This removes everything and cannot be undone. Not available in the app yet. | Cela supprime tout et c’est irréversible. Pas encore disponible dans l’application. |
| `account.deleteHint` | Opens a confirmation. This cannot be undone. | Ouvre une confirmation. C’est irréversible. |
| `account.privacyPolicy` | Privacy policy | Confidentialité |
| `account.title` | Account | Compte |
| `aiKeys.addTitle` | Add a key | Ajouter une clé |
| `aiKeys.allProvidersKeyed` | You already have a key for every provider this app can use. | Vous avez déjà une clé pour chaque fournisseur utilisable par cette application. |
| `aiKeys.checkAndSave` | Check and save | Vérifier et enregistrer |
| `aiKeys.checking` | Checking with the provider… | Vérification auprès du fournisseur… |
| `aiKeys.empty` | No key of your own yet. The assistant runs on MultiMagic's. | Pas encore de clé à vous. L’assistant tourne sur celle de MultiMagic. |
| `aiKeys.failed` | Could not do that. | Impossible de faire cela. |
| `aiKeys.inUse` | In use | Utilisée |
| `aiKeys.intro` | Add a key of your own and the assistant runs on your account, with your provider, at your cost. The key is checked with the provider before it is saved, and it is never shown again afterwards. | Ajoutez votre propre clé et l’assistant tourne sur votre compte, chez votre fournisseur, à vos frais. La clé est vérifiée auprès du fournisseur avant d’être enregistrée, et elle n’est plus jamais affichée ensuite. |
| `aiKeys.lentToYou` | {{provider}} — lent to you by {{name}} | {{provider}} — prêtée par {{name}} |
| `aiKeys.loadFailed` | Could not load your keys. | Impossible de charger vos clés. |
| `aiKeys.paste` | Paste your {{provider}} key | Collez votre clé {{provider}} |
| `aiKeys.remove` | Remove | Retirer |
| `aiKeys.removeLabel` | Remove the {{provider}} key | Retirer la clé {{provider}} |
| `aiKeys.replace` | Replace | Remplacer |
| `aiKeys.replaceTitle` | Replace your {{provider}} key | Remplacer votre clé {{provider}} |
| `aiKeys.someone` | someone | quelqu’un |
| `aiKeys.title` | Your AI key | Votre clé IA |
| `aiKeys.useThisOne` | Use this one | Utiliser celle-ci |
| `aiKeys.verified` |  · verified |  · vérifiée |
| `answer.bad` | Bad answer | Mauvaise réponse |
| `answer.cannotRead` | This answer can't be read aloud. | Cette réponse ne peut pas être lue à voix haute. |
| `answer.copied` | Copied | Copié |
| `answer.copy` | Copy answer | Copier la réponse |
| `answer.deleted` | This message was deleted. | Ce message a été supprimé. |
| `answer.good` | Good answer | Bonne réponse |
| `answer.noText` | This message has no text to read. | Ce message n’a pas de texte à lire. |
| `answer.open` | Open | Ouvrir |
| `answer.undo` | Undo | Annuler |
| `answer.undoFailed` | I could not take that back. | Impossible d’annuler. |
| `answer.undoLabel` | Undo what this created | Annuler ce que cela a créé |
| `answer.undoing` | Taking back… | Annulation… |
| `answer.undone` | Taken back | Annulé |
| `answer.voiceBusy` | MultiMagic's voice is busy — too many read-alouds in a minute. Try again in a moment. | La voix de MultiMagic est occupée — trop de lectures en une minute. Réessayez dans un instant. |
| `answer.voiceUnavailable` | MultiMagic's voice isn't available right now. | La voix de MultiMagic n’est pas disponible pour le moment. |
| `appearance.dark` | Dark | Sombre |
| `appearance.light` | Light | Clair |
| `appearance.system` | System | Système |
| `appearance.title` | Appearance | Apparence |
| `calendar.allDay` | All day | Toute la journée |
| `calendar.composed` | Question ready in the chat — edit it before you ask. | Question prête dans la discussion — modifiez-la avant de demander. |
| `calendar.event` | {{title}}, {{when}} | {{title}}, {{when}} |
| `calendar.eventHint` | Opens the assistant with a question about this event | Ouvre l’assistant avec une question sur cet événement |
| `calendar.footer` | The next {{days}} days. Ask the assistant about anything further out. | Les {{days}} prochains jours. Demandez à l’assistant pour ce qui va plus loin. |
| `calendar.hours` | {{count}} h | {{count}} h |
| `calendar.loadFailed` | Could not load your calendar. | Impossible de charger votre agenda. |
| `calendar.minutes` | {{count}} min | {{count}} min |
| `calendar.nothingToday` | Nothing today. | Rien aujourd’hui. |
| `calendar.question` | — | Parle-moi de « {{title}} » ({{when}}). |
| `calendar.refresh` | Refresh the calendar | Actualiser l\u2019agenda |
| `calendar.title` | What's next | À venir |
| `calendar.today` | Today | Aujourd’hui |
| `calendar.tomorrow` | Tomorrow | Demain |
| `chat.answerFailed` | That question did not get an answer. | Cette question n’a pas obtenu de réponse. |
| `chat.askAgain` | Ask again | Redemander |
| `chat.calendar` | Calendar | Agenda |
| `chat.disclaimer` | Answers come from your MultiMagic data and can be wrong. Check anything that matters. | Les réponses proviennent de vos données MultiMagic et peuvent être fausses. Vérifiez ce qui compte. |
| `chat.emptyTitle` | Ask about anything you have kept in MultiMagic — your notes, money, contacts and calendar. | Posez une question sur tout ce que vous gardez dans MultiMagic — vos notes, votre argent, vos contacts et votre agenda. |
| `chat.loadFailed` | Could not load this conversation. | Impossible de charger cette discussion. |
| `chat.notifications` | Notifications | Notifications |
| `chat.rateLimited` | You have asked a lot in a short time. MultiMagic takes {{perMinute}} questions a minute and {{perHour}} an hour. Your question is kept — you can send it in {{seconds}} s. | Vous avez beaucoup demandé en peu de temps. MultiMagic accepte {{perMinute}} questions par minute et {{perHour}} par heure. Votre question est conservée — vous pourrez l’envoyer dans {{seconds}} s. |
| `chat.retry` | Retry | Réessayer |
| `chat.sendFailed` | That did not send. | L’envoi n’a pas fonctionné. |
| `chat.sendUnreachable` | Could not reach MultiMagic. Your question is still here. | Impossible de joindre MultiMagic. Votre question est toujours là. |
| `chat.slow` | Still working — this one is taking a while. | Toujours en cours — celle-ci prend un peu de temps. |
| `chat.stillWorking` | Still working on your answer | Toujours en train de chercher votre réponse |
| `chat.thinking` | Thinking | Réflexion |
| `chat.title` | Assistant | Assistant |
| `chat.unreadBadge` | {{label}}, {{count}} unread | {{label}}, {{count}} non lus |
| `chats.emptyBody` | Chats you start on MultiMagic appear here. | Les discussions que vous commencez sur MultiMagic apparaissent ici. |
| `chats.emptyTitle` | No conversations yet | Pas encore de discussion |
| `chats.loadFailed` | Could not load your chats. | Impossible de charger vos discussions. |
| `common.back` | Back | Retour |
| `common.close` | Close | Fermer |
| `common.daysAgo` | {{count}} days ago | il y a {{count}} jours |
| `common.delete` | Delete | Supprimer |
| `common.hoursAgo` | {{count}} h ago | il y a {{count}} h |
| `common.justNow` | just now | à l\u2019instant |
| `common.minutesAgo` | {{count}} min ago | il y a {{count}} min |
| `common.refresh` | Refresh | Actualiser |
| `common.saved` | Saved. | Enregistré. |
| `common.saving` | Saving… | Enregistrement… |
| `common.tryAgain` | Try again | Réessayer |
| `common.updated` | Updated {{when}} | Mis à jour {{when}} |
| `common.updating` | Updating… | Mise à jour… |
| `common.yesterday` | Yesterday | Hier |
| `composer.attach` | Add a photo or a document | Ajouter une photo ou un document |
| `composer.cancelDictation` | Cancel dictation | Annuler la dictée |
| `composer.clear` | Clear | Effacer |
| `composer.dictateIn` | Dictate in {{language}} | Dicter en {{language}} |
| `composer.listening` | Listening… | Écoute… |
| `composer.micRefused` | I can't listen without the microphone. You can still type, or allow it in Settings. | Je ne peux pas écouter sans le microphone. Vous pouvez toujours écrire, ou l’autoriser dans les Réglages. |
| `composer.offline` | Can't reach MultiMagic right now. Your question is kept — send it when the connection is back. | Impossible de joindre MultiMagic pour l’instant. Votre question est conservée — envoyez-la quand la connexion sera revenue. |
| `composer.placeholder` | Ask anything… | Posez une question… |
| `composer.send` | Send | Envoyer |
| `composer.stopDictating` | Stop dictating | Arrêter la dictée |
| `composer.yourQuestion` | Your question | Votre question |
| `deleteAccount.cannotBeUndone` | This cannot be undone. | C’est irréversible. |
| `deleteAccount.confirm` | Delete my account | Supprimer mon compte |
| `deleteAccount.contacts` | Your contacts | Vos contacts |
| `deleteAccount.conversations` | Every conversation, and the files uploaded into them | Toutes les discussions, et les fichiers qui y ont été envoyés |
| `deleteAccount.deleting` | Deleting… | Suppression… |
| `deleteAccount.devices` | Saved devices, sign-in history and API keys | Les appareils enregistrés, l’historique de connexion et les clés d’API |
| `deleteAccount.events` | Your calendar events | Vos événements d’agenda |
| `deleteAccount.failed` | Could not delete the account. Nothing was deleted. | Impossible de supprimer le compte. Rien n’a été supprimé. |
| `deleteAccount.keep` | Keep my account | Garder mon compte |
| `deleteAccount.kept` | What the assistant cost — which provider ran, and how many tokens. Your name is removed from those rows, and they hold no part of any question or answer. | Ce que l’assistant a coûté — quel fournisseur a tourné, et combien de jetons. Votre nom est retiré de ces lignes, et elles ne contiennent aucune partie d’une question ou d’une réponse. |
| `deleteAccount.money` | Your expenses, incomes, loans and budgets | Vos dépenses, vos revenus, vos prêts et vos budgets |
| `deleteAccount.notes` | Your notes and documents | Vos notes et vos documents |
| `deleteAccount.password` | Password | Mot de passe |
| `deleteAccount.title` | Delete your account | Supprimer votre compte |
| `deleteAccount.typePassword` | Type your password to confirm | Saisissez votre mot de passe pour confirmer |
| `deleteAccount.unavailableBody` | Deleting an account is not something this app can do today — the server does not offer it yet. Nothing on this screen has changed anything. It is written down here so you know exactly what will go when it does. | Supprimer un compte n’est pas quelque chose que cette application sait faire aujourd’hui — le serveur ne le propose pas encore. Rien sur cet écran n’a changé quoi que ce soit. C’est écrit ici pour que vous sachiez exactement ce qui partira le jour venu. |
| `deleteAccount.unavailableTitle` | Not available in the app yet | Pas encore disponible dans l’application |
| `deleteAccount.unreachable` | Could not reach MultiMagic. Nothing was deleted. | Impossible de joindre MultiMagic. Rien n’a été supprimé. |
| `deleteAccount.whatIsDeleted` | What is deleted | Ce qui est supprimé |
| `deleteAccount.whatIsKept` | What is kept | Ce qui est conservé |
| `deleteAccount.wrongPassword` | That password is not right. | Ce mot de passe n’est pas le bon. |
| `deleteConversation.confirm` | Delete conversation | Supprimer la discussion |
| `deleteConversation.keep` | Keep it | La garder |
| `deleteConversation.question` | Delete this conversation? | Supprimer cette discussion ? |
| `deleteConversation.questionWithFiles_one` | Delete this conversation and the {{count}} file in it? | Supprimer cette discussion et le {{count}} fichier qu’elle contient ? |
| `deleteConversation.questionWithFiles_other` | Delete this conversation and the {{count}} files in it? | Supprimer cette discussion et les {{count}} fichiers qu’elle contient ? |
| `deleteConversation.safe` | Your notes, contacts, loans and money are not touched. | Vos notes, vos contacts, vos prêts et votre argent ne sont pas touchés. |
| `dictation.audioCapture` | The microphone is busy or unavailable. You can still type. | Le microphone est occupé ou indisponible. Vous pouvez toujours écrire. |
| `dictation.languageNotSupported` | Your phone cannot dictate in {{language}} yet. You can still type. | Votre téléphone ne sait pas encore dicter en {{language}}. Vous pouvez toujours écrire. |
| `dictation.network` | Dictation needs a connection right now. You can still type. | La dictée a besoin d’une connexion pour l’instant. Vous pouvez toujours écrire. |
| `failure.checkConnection` | Could not reach MultiMagic. Check your connection. | Impossible de joindre MultiMagic. Vérifiez votre connexion. |
| `failure.rateLimited` | Too many requests just now. Give it a minute. | Trop de requêtes pour le moment. Patientez une minute. |
| `failure.sessionEnded` | Your session ended. Sign in again. | Votre session est terminée. Reconnectez-vous. |
| `failure.unreachable` | Could not reach MultiMagic. | Impossible de joindre MultiMagic. |
| `failure.unreadable` | MultiMagic sent something this app could not read. That is a bug in the app, not your connection. | MultiMagic a envoyé quelque chose que cette application n’a pas su lire. C’est un bug de l’application, pas de votre connexion. |
| `files.addToConversation` | Add to this conversation | Ajouter à cette discussion |
| `files.camera` | Camera | Appareil photo |
| `files.cameraHint` | Take one now | En prendre une |
| `files.didNotUpload` | Did not upload | Non envoyé |
| `files.document` | Document | Document |
| `files.documentHint` | PDF or CSV | PDF ou CSV |
| `files.fromYourFiles` | From your files | Depuis vos fichiers |
| `files.limits` | Up to {{max}} files of {{mb}} MB each. {{types}}. | Jusqu’à {{max}} fichiers de {{mb}} Mo chacun. {{types}}. |
| `files.more` | +{{count}} more | +{{count}} de plus |
| `files.needCameraPermission` | MultiMagic needs permission to use the camera. | MultiMagic a besoin de l’autorisation d’utiliser l’appareil photo. |
| `files.needPhotoPermission` | MultiMagic needs permission to open your photos. | MultiMagic a besoin de l’autorisation d’ouvrir vos photos. |
| `files.ofFiles` | {{count}} of {{max}} files | {{count}} sur {{max}} fichiers |
| `files.openFile` | Open file | Ouvrir le fichier |
| `files.openFullSize` | Open full size | Ouvrir en grand |
| `files.opensOutside` | This opens outside MultiMagic, in whatever on your phone reads this kind of file. | Cela s’ouvre en dehors de MultiMagic, dans l’application de votre téléphone qui lit ce type de fichier. |
| `files.photo` | Photo | Photo |
| `files.photoHint` | From your library | Depuis votre galerie |
| `files.remove` | Remove {{name}} | Retirer {{name}} |
| `files.showMore` | Show {{count}} more files | Afficher {{count}} fichiers de plus |
| `files.tooBig` | {{name}} is {{size}}. Files have to be under {{max}} MB. | {{name}} fait {{size}}. Les fichiers doivent faire moins de {{max}} Mo. |
| `files.tooMany` | This conversation already has {{max}} files, which is the most it can hold. | Cette discussion contient déjà {{max}} fichiers, soit le maximum qu’elle peut garder. |
| `files.uploadFailed` | That file did not upload. | Ce fichier n’a pas été envoyé. |
| `files.uploading` | Uploading… | Envoi… |
| `files.wrongType` | MultiMagic can read PDFs, images and CSVs. {{name}} is not one of those. | MultiMagic sait lire les PDF, les images et les CSV. {{name}} n’en fait pas partie. |
| `forgotPassword.backToSignIn` | Back to sign in | Retour à la connexion |
| `forgotPassword.email` | Email | E-mail |
| `forgotPassword.failed` | Could not send the link. | Impossible d’envoyer le lien. |
| `forgotPassword.missing` | Enter the email you signed up with. | Saisissez l’e-mail utilisé à l’inscription. |
| `forgotPassword.sentBody` | If that address has a MultiMagic account, we have sent it a link to reset the password. The link opens MultiMagic on the web. | Si cette adresse a un compte MultiMagic, nous lui avons envoyé un lien pour réinitialiser le mot de passe. Le lien ouvre MultiMagic sur le web. |
| `forgotPassword.sentTitle` | Check your email | Consultez vos e-mails |
| `forgotPassword.submit` | Send reset link | Envoyer le lien |
| `forgotPassword.subtitle` | Enter your email and we will send a link to set a new password. | Saisissez votre e-mail et nous vous enverrons un lien pour définir un nouveau mot de passe. |
| `forgotPassword.title` | Reset your password | Réinitialiser votre mot de passe |
| `instructions.hint` | Written once, read every time. “This chat is about my flat renovation, answer in French.” | Écrit une fois, relu à chaque réponse. « Cette discussion porte sur la rénovation de mon appartement, réponds en français. » |
| `instructions.label` | Standing instructions | Instructions permanentes |
| `instructions.title` | How to answer in this chat | Comment répondre dans cette discussion |
| `language.title` | Language | Langue |
| `notifications.clear` | Clear | Effacer |
| `notifications.clearBody` | Anything still unread stays where it is. | Tout ce qui est encore non lu reste en place. |
| `notifications.clearQuestion` | Clear read notifications? | Effacer les notifications lues ? |
| `notifications.clearRead` | Clear read notifications | Effacer les notifications lues |
| `notifications.composed` | Question ready in the chat — edit it before you ask. | Question prête dans la discussion — modifiez-la avant de demander. |
| `notifications.deleteQuestion` | Delete this notification? | Supprimer cette notification ? |
| `notifications.earlier` | Earlier | Avant |
| `notifications.empty` | You're all caught up. | Vous êtes à jour. |
| `notifications.hint` | Opens the assistant with a question about this | Ouvre l’assistant avec une question à ce sujet |
| `notifications.loadFailed` | Could not load your notifications. | Impossible de charger vos notifications. |
| `notifications.markAllRead` | Mark all as read | Tout marquer comme lu |
| `notifications.question` | What is this about: {{title}}? | De quoi s’agit-il : {{title}} ? |
| `notifications.refresh` | Refresh notifications | Actualiser les notifications |
| `notifications.today` | Today | Aujourd’hui |
| `notifications.unread` | Unread: {{title}} | Non lu : {{title}} |
| `password.changing` | Changing… | Changement… |
| `password.current` | Current password | Mot de passe actuel |
| `password.done` | Your password was changed. You are still signed in on this phone. | Votre mot de passe a été changé. Vous restez connecté sur ce téléphone. |
| `password.failed` | Could not change your password. | Impossible de changer votre mot de passe. |
| `password.hide` | Hide {{label}} | Masquer {{label}} |
| `password.hidePassword` | Hide password | Masquer le mot de passe |
| `password.minimum` | At least {{count}} characters. | Au moins {{count}} caractères. |
| `password.mismatch` | These do not match. | Ils ne correspondent pas. |
| `password.new` | New password | Nouveau mot de passe |
| `password.notChanged` | Your password was not changed. | Votre mot de passe n’a pas été changé. |
| `password.repeat` | Repeat new password | Répéter le nouveau mot de passe |
| `password.show` | Show {{label}} | Afficher {{label}} |
| `password.showPassword` | Show password | Afficher le mot de passe |
| `password.submit` | Change password | Changer le mot de passe |
| `password.title` | Change password | Changer le mot de passe |
| `password.wrongCurrent` | That password is not right. | Ce mot de passe n’est pas le bon. |
| `privacy.draftBody` | Every sentence here was checked against the code, but this text is still waiting on approval and must not ship in this state. | Chaque phrase a été vérifiée contre le code, mais ce texte attend encore une approbation et ne doit pas être publié en l’état. |
| `privacy.draftTitle` | Draft — not yet approved | Brouillon — pas encore approuvé |
| `privacy.title` | Privacy | Confidentialité |
| `profile.about` | About | À propos |
| `profile.aboutPlaceholder` | A line about you | Une ligne à votre sujet |
| `profile.addPhoto` | Add a photo | Ajouter une photo |
| `profile.changePassword` | Change password | Changer le mot de passe |
| `profile.changePhoto` | Change photo | Changer la photo |
| `profile.changeYourPhoto` | Change your photo | Changer votre photo |
| `profile.chooseFromLibrary` | Choose from library | Choisir dans la galerie |
| `profile.email` | Email | E-mail |
| `profile.emailLocked` | Changing your email signs you out of live updates until you sign in again, so it is done on the website for now. | Changer votre e-mail vous déconnecte des mises à jour en direct jusqu’à la prochaine connexion ; cela se fait donc sur le site pour l’instant. |
| `profile.firstName` | First name | Prénom |
| `profile.lastName` | Last name | Nom |
| `profile.loadFailed` | Could not load your profile. | Impossible de charger votre profil. |
| `profile.openWeb` | Notes, money, contacts and the rest — open MultiMagic on the web | Notes, argent, contacts et le reste — ouvrir MultiMagic sur le web |
| `profile.removePhoto` | Remove photo | Retirer la photo |
| `profile.saveFailed` | Could not save that. | Impossible d’enregistrer cela. |
| `profile.takePhoto` | Take a photo | Prendre une photo |
| `profile.title` | Profile | Profil |
| `profile.updatingPhoto` | Updating photo… | Mise à jour de la photo… |
| `profile.yourAiKey` | Your AI provider key | Votre clé de fournisseur IA |
| `scope.allHint` | All apps. Choose some to narrow this chat. | Toutes les applications. Cochez-en pour limiter cette discussion. |
| `scope.searchAll` | Search all apps | Chercher partout |
| `scope.someHint` | Only {{count}} of {{total}} apps. | Seulement {{count}} applications sur {{total}}. |
| `scope.title` | Search in | Chercher dans |
| `session.expired` | Your session expired. Sign in again to carry on. | Votre session a expiré. Reconnectez-vous pour continuer. |
| `session.revoked` | MultiMagic no longer recognises this phone's session — it was ended from another device, or the device check did not match. Sign in again to carry on. | MultiMagic ne reconnaît plus la session de ce téléphone — elle a été fermée depuis un autre appareil, ou la vérification de l’appareil a échoué. Reconnectez-vous pour continuer. |
| `sessions.account` | Account | Compte |
| `sessions.allApps` | All apps | Toutes les applications |
| `sessions.atLimit` | You have {{max}} conversations, which is the most MultiMagic keeps. Delete one to start another. | Vous avez {{max}} discussions, soit le maximum que MultiMagic conserve. Supprimez-en une pour en commencer une autre. |
| `sessions.clear` | Clear messages | Vider cette discussion |
| `sessions.clearFailed` | Could not clear that conversation. | Impossible de vider cette discussion. |
| `sessions.clearHint` | Empties this chat. Its files stay. | Vide cette discussion. Ses fichiers restent. |
| `sessions.createFailed` | Could not start a new conversation. | Impossible de commencer une nouvelle discussion. |
| `sessions.delete` | Delete | Supprimer |
| `sessions.deleteFailed` | Could not delete that conversation. | Impossible de supprimer cette discussion. |
| `sessions.earlier` | Earlier | Avant |
| `sessions.files_one` | {{count}} file | {{count}} fichier |
| `sessions.files_other` | {{count}} files | {{count}} fichiers |
| `sessions.howToAnswer` | How to answer | Comment répondre |
| `sessions.instructionsFailed` | Could not save those instructions. | Impossible d’enregistrer ces instructions. |
| `sessions.instructionsNotSet` | Not set | Non définies |
| `sessions.instructionsSet` | Set | Définies |
| `sessions.messages_one` | {{count}} message | {{count}} message |
| `sessions.messages_other` | {{count}} messages | {{count}} messages |
| `sessions.name` | Name | Nom |
| `sessions.newConversation` | New conversation | Nouvelle discussion |
| `sessions.options` | Options for {{title}} | Options de {{title}} |
| `sessions.privacyAndAccount` | Privacy and account | Confidentialité et compte |
| `sessions.renameFailed` | Could not rename that conversation. | Impossible de renommer cette discussion. |
| `sessions.renameTitle` | Rename conversation | Renommer la discussion |
| `sessions.scopeFailed` | Could not change what this chat searches. | Impossible de changer ce que cette discussion fouille. |
| `sessions.searchIn` | Search in | Chercher dans |
| `sessions.signOut` | Sign out | Se déconnecter |
| `sessions.someApps` | {{count}} apps | {{count}} applications |
| `sessions.today` | Today | Aujourd’hui |
| `sessions.yourProfile` | Your profile | Votre profil |
| `signIn.createAccount` | Create an account | Créer un compte |
| `signIn.email` | Email | E-mail |
| `signIn.failed` | Something went wrong signing in. | Un problème est survenu lors de la connexion. |
| `signIn.forgot` | Forgot your password? | Mot de passe oublié ? |
| `signIn.missing` | Enter your email and password. | Saisissez votre e-mail et votre mot de passe. |
| `signIn.newHere` | New here? | Nouveau ici ? |
| `signIn.password` | Password | Mot de passe |
| `signIn.submit` | Sign in with email | Se connecter avec un e-mail |
| `signIn.subtitle` | Your notes, money, contacts and calendar — answered. | Vos notes, votre argent, vos contacts et votre agenda — en réponses. |
| `signIn.title` | Sign in | Connexion |
| `signIn.tooManyAttempts` | Too many attempts. Try again in a few minutes. | Trop de tentatives. Réessayez dans quelques minutes. |
| `signIn.wrongCredentials` | That email and password do not match. | Cet e-mail et ce mot de passe ne correspondent pas. |
| `signUp.email` | Email | E-mail |
| `signUp.emptyForm` | Fill in your name, email and a password. | Renseignez votre nom, votre e-mail et un mot de passe. |
| `signUp.failed` | Could not create that account. | Impossible de créer ce compte. |
| `signUp.firstName` | First name | Prénom |
| `signUp.haveAccount` | Already have an account? | Vous avez déjà un compte ? |
| `signUp.lastName` | Last name | Nom |
| `signUp.missingEmail` | Enter your email. | Saisissez votre e-mail. |
| `signUp.missingFirstName` | Enter your first name. | Saisissez votre prénom. |
| `signUp.missingLastName` | Enter your last name. | Saisissez votre nom. |
| `signUp.missingPassword` | Choose a password. | Choisissez un mot de passe. |
| `signUp.password` | Password | Mot de passe |
| `signUp.signIn` | Sign in | Se connecter |
| `signUp.submit` | Create account | Créer le compte |
| `signUp.subtitle` | One account for your notes, money, contacts and calendar. | Un seul compte pour vos notes, votre argent, vos contacts et votre agenda. |
| `signUp.title` | Create an account | Créer un compte |
| `sources.body` | This is the record the answer drew on. Open it in MultiMagic to read it in full. | Voici l’enregistrement sur lequel la réponse s’appuie. Ouvrez-le dans MultiMagic pour le lire en entier. |
| `sources.chip` | Source: {{label}} | Source : {{label}} |
| `sources.openInWeb` | Open in MultiMagic | Ouvrir dans MultiMagic |
| `sources.record` | Record | Enregistrement |
| `sources.sheetLabel` | Where this came from | D’où cela vient |
| `thread.chat` | Chat | Discussion |
| `thread.copy` | Copy | Copier |
| `thread.delete` | Delete | Supprimer |
| `thread.edit` | Edit | Modifier |
| `thread.editMessage` | Edit message | Modifier le message |
| `thread.editing` | Editing a message — tap to cancel | Modification d’un message — touchez pour annuler |
| `thread.loadFailed` | Could not load this conversation. | Impossible de charger cette discussion. |
| `thread.message` | Message | Message |
| `thread.noMessages` | No messages yet. | Pas encore de message. |
| `thread.online` | Online | En ligne |
| `thread.react` | React {{emoji}} | Réagir {{emoji}} |
| `thread.reactHint` | Long press to react | Appui long pour réagir |
| `thread.removeReaction` | Remove {{emoji}} | Retirer {{emoji}} |
| `thread.someone` | Someone | Quelqu’un |
| `thread.someoneTyping` | {{name}} is typing… | {{name}} écrit… |
| `thread.typing` | typing… | écrit… |
