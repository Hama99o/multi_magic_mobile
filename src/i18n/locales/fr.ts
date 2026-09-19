/**
 * The French strings.
 *
 * ── WHERE EACH SENTENCE COMES FROM ────────────────────────────────────────
 * Every string that also exists on the web takes THE WEB'S FRENCH verbatim
 * (`multi_magic/app/javascript/i18n/locales/fr.ts`), so the two clients cannot
 * drift into two translations of one idea: `sessions.title` is "Discussions"
 * and not "Conversations", `sources.from` is "D'après", the read-aloud
 * controls are "Pause" / "Reprendre" / "Recommencer".
 *
 * The rest is this session's French, for screens the web does not have (a
 * phone's sign-in, the account and deletion screens, the offline line, the
 * dictation failures). Those are listed in `docs/LANGUAGES.md` for his eye —
 * he is a French speaker and the wording is his call, not mine.
 *
 * ── Two conventions kept throughout ───────────────────────────────────────
 * - The typographic apostrophe (’), which is what the web uses, rather
 *   than the ASCII one.
 * - The narrow no-break space before `?`, `!` and `:` ( ), which French
 *   typography requires and whose absence is the commonest tell that a
 *   translation was done by somebody who does not read the language.
 */
import type { Translations } from "./en";

export const fr: Translations = {
  common: {
    back: "Retour",
    refresh: "Actualiser",
    updated: "Mis à jour {{when}}",
    updating: "Mise à jour…",
    cancel: "Annuler",
    close: "Fermer",
    tryAgain: "Réessayer",
    save: "Enregistrer",
    saving: "Enregistrement…",
    saved: "Enregistré.",
    delete: "Supprimer",
    loading: "Chargement…",
    justNow: "à l\u2019instant",
    minutesAgo: "il y a {{count}} min",
    hoursAgo: "il y a {{count}} h",
    yesterday: "Hier",
    daysAgo: "il y a {{count}} jours",
  },

  failure: {
    unreachable: "Impossible de joindre MultiMagic.",
    unreadable:
      "MultiMagic a envoyé quelque chose que cette application n’a pas su lire. C’est un bug de l’application, pas de votre connexion.",
    rateLimited: "Trop de requêtes pour le moment. Patientez une minute.",
    sessionEnded: "Votre session est terminée. Reconnectez-vous.",
    checkConnection: "Impossible de joindre MultiMagic. Vérifiez votre connexion.",
  },

  session: {
    expired: "Votre session a expiré. Reconnectez-vous pour continuer.",
    revoked:
      "MultiMagic ne reconnaît plus la session de ce téléphone — elle a été fermée depuis un autre appareil, ou la vérification de l’appareil a échoué. Reconnectez-vous pour continuer.",
  },

  signIn: {
    title: "Connexion",
    subtitle: "Vos notes, votre argent, vos contacts et votre agenda — en réponses.",
    email: "E-mail",
    password: "Mot de passe",
    forgot: "Mot de passe oublié ?",
    submit: "Se connecter avec un e-mail",
    newHere: "Nouveau ici ?",
    createAccount: "Créer un compte",
    missing: "Saisissez votre e-mail et votre mot de passe.",
    wrongCredentials: "Cet e-mail et ce mot de passe ne correspondent pas.",
    tooManyAttempts: "Trop de tentatives. Réessayez dans quelques minutes.",
    failed: "Un problème est survenu lors de la connexion.",
  },

  signUp: {
    title: "Créer un compte",
    subtitle: "Un seul compte pour vos notes, votre argent, vos contacts et votre agenda.",
    firstName: "Prénom",
    lastName: "Nom",
    email: "E-mail",
    password: "Mot de passe",
    submit: "Créer le compte",
    haveAccount: "Vous avez déjà un compte ?",
    signIn: "Se connecter",
    emptyForm: "Renseignez votre nom, votre e-mail et un mot de passe.",
    missingFirstName: "Saisissez votre prénom.",
    missingLastName: "Saisissez votre nom.",
    missingEmail: "Saisissez votre e-mail.",
    missingPassword: "Choisissez un mot de passe.",
    failed: "Impossible de créer ce compte.",
  },

  forgotPassword: {
    title: "Réinitialiser votre mot de passe",
    subtitle:
      "Saisissez votre e-mail et nous vous enverrons un lien pour définir un nouveau mot de passe.",
    email: "E-mail",
    submit: "Envoyer le lien",
    backToSignIn: "Retour à la connexion",
    sentTitle: "Consultez vos e-mails",
    sentBody:
      "Si cette adresse a un compte MultiMagic, nous lui avons envoyé un lien pour réinitialiser le mot de passe. Le lien ouvre MultiMagic sur le web.",
    missing: "Saisissez l’e-mail utilisé à l’inscription.",
    failed: "Impossible d’envoyer le lien.",
  },

  chat: {
    title: "Assistant",
    chats: "Discussions",
    notifications: "Notifications",
    calendar: "Agenda",
    conversations: "Discussions",
    unreadBadge: "{{label}}, {{count}} non lus",
    disclaimer:
      "Les réponses proviennent de vos données MultiMagic et peuvent être fausses. Vérifiez ce qui compte.",
    loadFailed: "Impossible de charger cette discussion.",
    answerFailed: "Cette question n’a pas obtenu de réponse.",
    askAgain: "Redemander",
    retry: "Réessayer",
    sendFailed: "L’envoi n’a pas fonctionné.",
    sendUnreachable: "Impossible de joindre MultiMagic. Votre question est toujours là.",
    rateLimited:
      "Vous avez beaucoup demandé en peu de temps. MultiMagic accepte {{perMinute}} questions par minute et {{perHour}} par heure. Votre question est conservée — vous pourrez l’envoyer dans {{seconds}} s.",
    emptyTitle:
      "Posez une question sur tout ce que vous gardez dans MultiMagic — vos notes, votre argent, vos contacts et votre agenda.",
    thinking: "Réflexion",
    stillWorking: "Toujours en train de chercher votre réponse",
    slow: "Toujours en cours — celle-ci prend un peu de temps.",
  },

  composer: {
    placeholder: "Posez une question…",
    yourQuestion: "Votre question",
    send: "Envoyer",
    clear: "Effacer",
    attach: "Ajouter une photo ou un document",
    listening: "Écoute…",
    cancelDictation: "Annuler la dictée",
    dictateIn: "Dicter en {{language}}",
    stopDictating: "Arrêter la dictée",
    micRefused:
      "Je ne peux pas écouter sans le microphone. Vous pouvez toujours écrire, ou l’autoriser dans les Réglages.",
    offline:
      "Impossible de joindre MultiMagic pour l’instant. Votre question est conservée — envoyez-la quand la connexion sera revenue.",
  },

  dictation: {
    network: "La dictée a besoin d’une connexion pour l’instant. Vous pouvez toujours écrire.",
    audioCapture: "Le microphone est occupé ou indisponible. Vous pouvez toujours écrire.",
    languageNotSupported:
      "Votre téléphone ne sait pas encore dicter en {{language}}. Vous pouvez toujours écrire.",
  },

  answer: {
    copy: "Copier la réponse",
    copied: "Copié",
    good: "Bonne réponse",
    bad: "Mauvaise réponse",
    undo: "Annuler",
    undoing: "Annulation…",
    undone: "Annulé",
    undoLabel: "Annuler ce que cela a créé",
    undoFailed: "Impossible d’annuler.",
    from: "D’après",
    open: "Ouvrir",
    deleted: "Ce message a été supprimé.",
    readAloud: "Lire cette réponse à voix haute",
    stopReading: "Arrêter la lecture",
    pauseReading: "Pause",
    resumeReading: "Reprendre",
    restartReading: "Recommencer",
    deviceVoice: "la voix du téléphone",
    voiceBusy:
      "La voix de MultiMagic est occupée — trop de lectures en une minute. Réessayez dans un instant.",
    voiceUnavailable: "La voix de MultiMagic n’est pas disponible pour le moment.",
    noText: "Ce message n’a pas de texte à lire.",
    cannotRead: "Cette réponse ne peut pas être lue à voix haute.",
  },

  sources: {
    chip: "Source : {{label}}",
    sheetLabel: "D’où cela vient",
    record: "Enregistrement",
    body:
      "Voici l’enregistrement sur lequel la réponse s’appuie. Ouvrez-le dans MultiMagic pour le lire en entier.",
    openInWeb: "Ouvrir dans MultiMagic",
  },

  files: {
    fromYourFiles: "Depuis vos fichiers",
    openFullSize: "Ouvrir en grand",
    openFile: "Ouvrir le fichier",
    opensOutside:
      "Cela s’ouvre en dehors de MultiMagic, dans l’application de votre téléphone qui lit ce type de fichier.",
    addToConversation: "Ajouter à cette discussion",
    ofFiles: "{{count}} sur {{max}} fichiers",
    limits: "Jusqu’à {{max}} fichiers de {{mb}} Mo chacun. {{types}}.",
    photo: "Photo",
    photoHint: "Depuis votre galerie",
    camera: "Appareil photo",
    cameraHint: "En prendre une",
    document: "Document",
    documentHint: "PDF ou CSV",
    uploading: "Envoi…",
    didNotUpload: "Non envoyé",
    uploadFailed: "Ce fichier n’a pas été envoyé.",
    remove: "Retirer {{name}}",
    showMore: "Afficher {{count}} fichiers de plus",
    more: "+{{count}} de plus",
    tooMany:
      "Cette discussion contient déjà {{max}} fichiers, soit le maximum qu’elle peut garder.",
    tooBig: "{{name}} fait {{size}}. Les fichiers doivent faire moins de {{max}} Mo.",
    wrongType:
      "MultiMagic sait lire les PDF, les images et les CSV. {{name}} n’en fait pas partie.",
    needPhotoPermission: "MultiMagic a besoin de l’autorisation d’ouvrir vos photos.",
    needCameraPermission:
      "MultiMagic a besoin de l’autorisation d’utiliser l’appareil photo.",
  },

  sessions: {
    title: "Discussions",
    today: "Aujourd’hui",
    earlier: "Avant",
    newConversation: "Nouvelle discussion",
    atLimit:
      "Vous avez {{max}} discussions, soit le maximum que MultiMagic conserve. Supprimez-en une pour en commencer une autre.",
    options: "Options de {{title}}",
    messages_one: "{{count}} message",
    messages_other: "{{count}} messages",
    files_one: "{{count}} fichier",
    files_other: "{{count}} fichiers",
    clear: "Vider cette discussion",
    clearHint: "Vide cette discussion. Ses fichiers restent.",
    rename: "Renommer",
    renameTitle: "Renommer la discussion",
    name: "Nom",
    searchIn: "Chercher dans",
    allApps: "Toutes les applications",
    someApps: "{{count}} applications",
    howToAnswer: "Comment répondre",
    instructionsSet: "Définies",
    instructionsNotSet: "Non définies",
    delete: "Supprimer",
    account: "Compte",
    yourProfile: "Votre profil",
    privacyAndAccount: "Confidentialité et compte",
    signOut: "Se déconnecter",
    createFailed: "Impossible de commencer une nouvelle discussion.",
    renameFailed: "Impossible de renommer cette discussion.",
    clearFailed: "Impossible de vider cette discussion.",
    deleteFailed: "Impossible de supprimer cette discussion.",
    instructionsFailed: "Impossible d’enregistrer ces instructions.",
    scopeFailed: "Impossible de changer ce que cette discussion fouille.",
  },

  deleteConversation: {
    question: "Supprimer cette discussion ?",
    questionWithFiles_one:
      "Supprimer cette discussion et le {{count}} fichier qu’elle contient ?",
    questionWithFiles_other:
      "Supprimer cette discussion et les {{count}} fichiers qu’elle contient ?",
    safe: "Vos notes, vos contacts, vos prêts et votre argent ne sont pas touchés.",
    confirm: "Supprimer la discussion",
    keep: "La garder",
  },

  instructions: {
    title: "Comment répondre dans cette discussion",
    hint:
      "Écrit une fois, relu à chaque réponse. « Cette discussion porte sur la rénovation de mon appartement, réponds en français. »",
    label: "Instructions permanentes",
    optional: "Facultatif",
  },

  scope: {
    title: "Chercher dans",
    allHint: "Toutes les applications. Cochez-en pour limiter cette discussion.",
    someHint: "Seulement {{count}} applications sur {{total}}.",
    searchAll: "Chercher partout",
    notes: "Notes",
    pages: "Pages",
    contacts: "Contacts",
    todos: "Tâches",
    money: "Argent",
    flow: "Flow",
    calendar: "Agenda",
  },

  appearance: {
    title: "Apparence",
    system: "Système",
    light: "Clair",
    dark: "Sombre",
  },

  language: {
    title: "Langue",
    english: "English",
    french: "Français",
  },

  profile: {
    title: "Profil",
    changePhoto: "Changer la photo",
    addPhoto: "Ajouter une photo",
    updatingPhoto: "Mise à jour de la photo…",
    changeYourPhoto: "Changer votre photo",
    firstName: "Prénom",
    lastName: "Nom",
    about: "À propos",
    aboutPlaceholder: "Une ligne à votre sujet",
    email: "E-mail",
    emailLocked:
      "Changer votre e-mail vous déconnecte des mises à jour en direct jusqu’à la prochaine connexion ; cela se fait donc sur le site pour l’instant.",
    changePassword: "Changer le mot de passe",
    yourAiKey: "Votre clé de fournisseur IA",
    openWeb: "Notes, argent, contacts et le reste — ouvrir MultiMagic sur le web",
    loadFailed: "Impossible de charger votre profil.",
    saveFailed: "Impossible d’enregistrer cela.",
    chooseFromLibrary: "Choisir dans la galerie",
    takePhoto: "Prendre une photo",
    removePhoto: "Retirer la photo",
  },

  password: {
    title: "Changer le mot de passe",
    current: "Mot de passe actuel",
    new: "Nouveau mot de passe",
    repeat: "Répéter le nouveau mot de passe",
    minimum: "Au moins {{count}} caractères.",
    mismatch: "Ils ne correspondent pas.",
    wrongCurrent: "Ce mot de passe n’est pas le bon.",
    submit: "Changer le mot de passe",
    changing: "Changement…",
    done: "Votre mot de passe a été changé. Vous restez connecté sur ce téléphone.",
    failed: "Impossible de changer votre mot de passe.",
    notChanged: "Votre mot de passe n’a pas été changé.",
    show: "Afficher {{label}}",
    hide: "Masquer {{label}}",
    showPassword: "Afficher le mot de passe",
    hidePassword: "Masquer le mot de passe",
  },

  aiKeys: {
    title: "Votre clé IA",
    intro:
      "Ajoutez votre propre clé et l’assistant tourne sur votre compte, chez votre fournisseur, à vos frais. La clé est vérifiée auprès du fournisseur avant d’être enregistrée, et elle n’est plus jamais affichée ensuite.",
    empty: "Pas encore de clé à vous. L’assistant tourne sur celle de MultiMagic.",
    inUse: "Utilisée",
    verified: " · vérifiée",
    useThisOne: "Utiliser celle-ci",
    replace: "Remplacer",
    remove: "Retirer",
    removeLabel: "Retirer la clé {{provider}}",
    replaceTitle: "Remplacer votre clé {{provider}}",
    addTitle: "Ajouter une clé",
    allProvidersKeyed:
      "Vous avez déjà une clé pour chaque fournisseur utilisable par cette application.",
    paste: "Collez votre clé {{provider}}",
    checking: "Vérification auprès du fournisseur…",
    checkAndSave: "Vérifier et enregistrer",
    lentToYou: "{{provider}} — prêtée par {{name}}",
    someone: "quelqu’un",
    loadFailed: "Impossible de charger vos clés.",
    failed: "Impossible de faire cela.",
  },

  account: {
    title: "Compte",
    privacyPolicy: "Confidentialité",
    deleteAccount: "Supprimer le compte",
    deleteHint: "Ouvre une confirmation. C’est irréversible.",
    deleteCaption: "Cela supprime tout et c’est irréversible.",
    deleteCaptionUnavailable:
      "Cela supprime tout et c’est irréversible. Pas encore disponible dans l’application.",
  },

  deleteAccount: {
    title: "Supprimer votre compte",
    cannotBeUndone: "C’est irréversible.",
    whatIsDeleted: "Ce qui est supprimé",
    whatIsKept: "Ce qui est conservé",
    typePassword: "Saisissez votre mot de passe pour confirmer",
    password: "Mot de passe",
    confirm: "Supprimer mon compte",
    deleting: "Suppression…",
    keep: "Garder mon compte",
    wrongPassword: "Ce mot de passe n’est pas le bon.",
    unreachable: "Impossible de joindre MultiMagic. Rien n’a été supprimé.",
    failed: "Impossible de supprimer le compte. Rien n’a été supprimé.",
    unavailableTitle: "Pas encore disponible dans l’application",
    unavailableBody:
      "Supprimer un compte n’est pas quelque chose que cette application sait faire aujourd’hui — le serveur ne le propose pas encore. Rien sur cet écran n’a changé quoi que ce soit. C’est écrit ici pour que vous sachiez exactement ce qui partira le jour venu.",
    goes: {
      conversations: "Toutes les discussions, et les fichiers qui y ont été envoyés",
      notes: "Vos notes et vos documents",
      contacts: "Vos contacts",
      money: "Vos dépenses, vos revenus, vos prêts et vos budgets",
      events: "Vos événements d’agenda",
      devices: "Les appareils enregistrés, l’historique de connexion et les clés d’API",
    },
    kept:
      "Ce que l’assistant a coûté — quel fournisseur a tourné, et combien de jetons. Votre nom est retiré de ces lignes, et elles ne contiennent aucune partie d’une question ou d’une réponse.",
  },

  privacy: {
    title: "Confidentialité",
    draftTitle: "Brouillon — pas encore approuvé",
    draftBody:
      "Chaque phrase a été vérifiée contre le code, mais ce texte attend encore une approbation et ne doit pas être publié en l’état.",
  },

  chats: {
    title: "Discussions",
    emptyTitle: "Pas encore de discussion",
    emptyBody: "Les discussions que vous commencez sur MultiMagic apparaissent ici.",
    loadFailed: "Impossible de charger vos discussions.",
  },

  thread: {
    typing: "écrit…",
    someoneTyping: "{{name}} écrit…",
    someone: "Quelqu’un",
    online: "En ligne",
    chat: "Discussion",
    noMessages: "Pas encore de message.",
    loadFailed: "Impossible de charger cette discussion.",
    editing: "Modification d’un message — touchez pour annuler",
    message: "Message",
    editMessage: "Modifier le message",
    copy: "Copier",
    edit: "Modifier",
    delete: "Supprimer",
    react: "Réagir {{emoji}}",
    removeReaction: "Retirer {{emoji}}",
    reactHint: "Appui long pour réagir",
  },

  notifications: {
    title: "Notifications",
    refresh: "Actualiser les notifications",
    markAllRead: "Tout marquer comme lu",
    clearRead: "Effacer les notifications lues",
    empty: "Vous êtes à jour.",
    loadFailed: "Impossible de charger vos notifications.",
    composed: "Question prête dans la discussion — modifiez-la avant de demander.",
    question: "De quoi s’agit-il : {{title}} ?",
    deleteQuestion: "Supprimer cette notification ?",
    clearQuestion: "Effacer les notifications lues ?",
    clearBody: "Tout ce qui est encore non lu reste en place.",
    clear: "Effacer",
    today: "Aujourd’hui",
    earlier: "Avant",
    unread: "Non lu : {{title}}",
    hint: "Ouvre l’assistant avec une question à ce sujet",
  },

  calendar: {
    title: "À venir",
    refresh: "Actualiser l\u2019agenda",
    today: "Aujourd’hui",
    tomorrow: "Demain",
    nothingToday: "Rien aujourd’hui.",
    footer:
      "Les {{days}} prochains jours. Demandez à l’assistant pour ce qui va plus loin.",
    loadFailed: "Impossible de charger votre agenda.",
    composed: "Question prête dans la discussion — modifiez-la avant de demander.",
    question: "Parle-moi de « {{title}} » ({{when}}).",
    allDay: "Toute la journée",
    minutes: "{{count}} min",
    hours: "{{count}} h",
    event: "{{title}}, {{when}}",
    eventHint: "Ouvre l’assistant avec une question sur cet événement",
  },
};
