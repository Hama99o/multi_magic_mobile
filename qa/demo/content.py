"""THE WORDS IN THE STORE PICTURES — the single source, awaiting Hamma9900's approval.

Everything a listing screenshot will show, in English and French. These
pictures go to the whole world and stay there, so every word here is
INVENTED: the people (Maya Brooks, Sam Carter, Nora Lind, the book club),
the amounts, the places, the dentist. Nothing is his, nothing is the QA
account's, and nothing should resemble anyone's real life.

`build_demo.py` renders this into the JSON the fault proxy serves
(qa/demo/<lang>/) and into docs/store/DEMO_CONTENT.md, the text he approves.
Edit HERE, then rebuild; never edit the rendered files.

Times are relative to the moment a picture is taken: `ago` in minutes,
`day` as days from today with a local time, so "today" is always today.
"""

ME = {"firstname": "Maya", "lastname": "Brooks", "email": "maya@example.com"}
PEOPLE = {
    "sam": {"firstname": "Sam", "lastname": "Carter"},
    "nora": {"firstname": "Nora", "lastname": "Lind"},
    "theo": {"firstname": "Theo", "lastname": "Marsh"},
}

CONTENT = {
    "en": {
        # The assistant conversation on screen, oldest first. The answer
        # cites what it was drawn from: that is the app's whole claim.
        "assistant": [
            {"role": "user", "ago": 6, "body": "When is Nora's birthday, and did I note a gift idea?"},
            {"role": "assistant", "ago": 6,
             "body": "Nora's birthday is on **Saturday**. In your note *Gift ideas* you wrote that she wants a **film camera**: the Olympus you saw at the flea market was **€85**.",
             "sources": [("Gift ideas", "note"), ("Nora's birthday", "calendar_event")]},
            {"role": "user", "ago": 2, "body": "How much have I spent on groceries this month?"},
            {"role": "assistant", "ago": 2,
             "body": "**€212.40** across 9 expenses this month, about €30 less than last month. The biggest was **€48.90** at the Saturday market.",
             "sources": [("Groceries · this month", "expense")]},
        ],
        "sessions": [
            ("Nora's birthday and groceries", 2, 4),
            ("What's booked for Lisbon?", 60 * 26, 6),
            ("Who lent me the tent?", 60 * 50, 2),
            ("Summarise my week", 60 * 24 * 4, 8),
        ],
        "calendar": [
            {"title": "Dentist, Dr. Okafor", "day": 0, "at": "09:30", "until": "10:00", "kind": "appointment"},
            {"title": "Call Sam about the flat", "day": 0, "at": "18:00", "until": "18:30", "kind": "meeting"},
            {"title": "Yoga", "day": 1, "at": "07:30", "until": "08:30", "kind": "event"},
            {"title": "Pick up the film camera", "day": 2, "at": "12:30", "until": "13:00", "kind": "task"},
            {"title": "Nora's birthday", "day": 4, "all_day": True, "kind": "birthday"},
        ],
        "chats": [
            {"with": "sam", "unread": 1, "last": ("sam", 3, "See you at 6, I'll bring the keys.")},
            {"with": "nora", "unread": 0, "last": ("nora", 95, "Can't wait for Saturday! 🎉")},
            {"group": "Book club", "with": "theo", "unread": 0, "last": ("theo", 60 * 20, "Next pick: The Remains of the Day")},
        ],
        # The thread with Sam, oldest first.
        "thread": [
            ("sam", 42, "Did you hear back about the flat on Elm Street?"),
            ("me", 40, "Yes! Viewing is today at 6."),
            ("sam", 39, "Want me to come? I can check the boiler."),
            ("me", 12, "That would be great, thank you"),
            ("sam", 3, "See you at 6, I'll bring the keys."),
        ],
        "notifications": [
            {"kind": "ai.morning_brief", "ago": 180, "title": "Your morning",
             "body": "Dentist at 9:30, a call with Sam at 18:00. Nora's birthday is on Saturday."},
            {"kind": "message", "ago": 3, "title": "Sam Carter sent you a message", "body": "See you at 6, I'll bring the keys.", "actor": "sam"},
            {"kind": "reaction", "ago": 95, "title": "Nora Lind reacted 🎉 to your message", "body": None, "actor": "nora"},
        ],
    },
    "fr": {
        "assistant": [
            {"role": "user", "ago": 6, "body": "C'est quand l'anniversaire de Nora, et j'avais noté une idée de cadeau ?"},
            {"role": "assistant", "ago": 6,
             "body": "L'anniversaire de Nora est **samedi**. Dans votre note *Idées cadeaux*, vous avez écrit qu'elle voudrait un **appareil photo argentique** : l'Olympus vu à la brocante était à **85 €**.",
             "sources": [("Idées cadeaux", "note"), ("Anniversaire de Nora", "calendar_event")]},
            {"role": "user", "ago": 2, "body": "Combien j'ai dépensé en courses ce mois-ci ?"},
            {"role": "assistant", "ago": 2,
             "body": "**212,40 €** sur 9 dépenses ce mois-ci, environ 30 € de moins que le mois dernier. La plus grosse : **48,90 €** au marché du samedi.",
             "sources": [("Courses · ce mois-ci", "expense")]},
        ],
        "sessions": [
            ("Anniversaire de Nora et courses", 2, 4),
            ("Qu'est-ce qui est réservé pour Lisbonne ?", 60 * 26, 6),
            ("Qui m'a prêté la tente ?", 60 * 50, 2),
            ("Résume ma semaine", 60 * 24 * 4, 8),
        ],
        "calendar": [
            {"title": "Dentiste, Dr Okafor", "day": 0, "at": "09:30", "until": "10:00", "kind": "appointment"},
            {"title": "Appeler Sam pour l'appartement", "day": 0, "at": "18:00", "until": "18:30", "kind": "meeting"},
            {"title": "Yoga", "day": 1, "at": "07:30", "until": "08:30", "kind": "event"},
            {"title": "Récupérer l'appareil photo", "day": 2, "at": "12:30", "until": "13:00", "kind": "task"},
            {"title": "Anniversaire de Nora", "day": 4, "all_day": True, "kind": "birthday"},
        ],
        "chats": [
            {"with": "sam", "unread": 1, "last": ("sam", 3, "À 18 h, j'apporte les clés.")},
            {"with": "nora", "unread": 0, "last": ("nora", 95, "Vivement samedi ! 🎉")},
            {"group": "Club de lecture", "with": "theo", "unread": 0, "last": ("theo", 60 * 20, "Prochain livre : Les Vestiges du jour")},
        ],
        "thread": [
            ("sam", 42, "Tu as eu des nouvelles pour l'appartement rue des Ormes ?"),
            ("me", 40, "Oui ! La visite est aujourd'hui à 18 h."),
            ("sam", 39, "Tu veux que je vienne ? Je peux jeter un œil à la chaudière."),
            ("me", 12, "Ce serait super, merci"),
            ("sam", 3, "À 18 h, j'apporte les clés."),
        ],
        "notifications": [
            {"kind": "ai.morning_brief", "ago": 180, "title": "Votre matinée",
             "body": "Dentiste à 9 h 30, appel avec Sam à 18 h. L'anniversaire de Nora est samedi."},
            {"kind": "message", "ago": 3, "title": "Sam Carter vous a envoyé un message", "body": "À 18 h, j'apporte les clés.", "actor": "sam"},
            {"kind": "reaction", "ago": 95, "title": "Nora Lind a réagi 🎉 à votre message", "body": None, "actor": "nora"},
        ],
    },
}
