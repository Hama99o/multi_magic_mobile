#!/usr/bin/env python3
"""Render qa/demo/content.py into what the fault proxy serves, and into the
text Hamma9900 approves.

  python3 qa/demo/build_demo.py      # writes qa/demo/{en,fr}/ and docs/store/DEMO_CONTENT.md

SHAPES ARE THE SERVER'S. Every file starts from a CAPTURED response
(src/api/__tests__/fixtures/, recorded from the live API) and only the words,
names, ids and times are replaced. So the demo cannot drift into a shape the
server never sends; `src/api/__tests__/demo.test.ts` runs the app's real
parsers over every rendered file and fails on one unreadable row.

TIMES are placeholders the proxy fills at serve time (qa/fault_proxy.py,
serve mode): `{{ago:N}}` is N minutes before now, `{{at:D@HH:MM}}` is day D
at a local time, `{{date:D}}` a local date. D is a number of days, or `sat`,
the next Saturday within the calendar's week, because the words say
"Saturday".
"""
import copy
import json
import os
import re
import sys

sys.dont_write_bytecode = True  # importing content.py must not leave __pycache__ in qa/demo
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from content import CONTENT, ME, PEOPLE  # noqa: E402

FIX = os.path.join(ROOT, "src", "api", "__tests__", "fixtures")
DOC = os.path.join(ROOT, "docs", "store", "DEMO_CONTENT.md")

ASSISTANT_ID = 9001
THREAD_IDS = {"sam": 9101, "nora": 9102, "theo": 9103}
USER_IDS = {"me": 7001, "sam": 7002, "nora": 7003, "theo": 7004}


def captured(name):
    with open(os.path.join(FIX, f"{name}.json")) as f:
        return json.load(f)["body"]


def person(key, template):
    """A user object in the captured shape, with invented values."""
    who = ME if key == "me" else PEOPLE[key]
    u = copy.deepcopy(template)
    u.update({
        "id": USER_IDS[key], "firstname": who["firstname"], "lastname": who["lastname"],
        "fullname": f"{who['firstname']} {who['lastname']}", "username": who["firstname"].lower(),
        "email": ME["email"] if key == "me" else f"{who['firstname'].lower()}@example.com",
        "about": "", "avatar": None,
    })
    return u


def build(lang):
    c = CONTENT[lang]
    out = {}
    msg_t = captured("ai_messages_latest")
    base_msg = msg_t["messages"][0]
    user_t = base_msg["user"]

    # ── the assistant's conversation (newest first, as the server pages) ──
    msgs = []
    for i, m in enumerate(c["assistant"]):
        x = copy.deepcopy(base_msg)
        x.update({
            "id": 80001 + i, "conversation_id": ASSISTANT_ID, "body": m["body"], "role": m["role"],
            "created_at": f"{{{{ago:{m['ago']}}}}}", "sent_by_me": True, "rating": None,
            "sources": [{"label": label, "key": key, "path": None} for label, key in m.get("sources", [])],
            "links": [], "reactions": [], "user": person("me", user_t), "user_id": USER_IDS["me"],
        })
        msgs.append(x)
    meta = copy.deepcopy(msg_t["meta"])
    meta["pagy"].update({"count": len(msgs), "pages": 1, "next": None, "last": 1})
    out["assistant_messages"] = {"messages": list(reversed(msgs)), "meta": meta}

    # ── the sessions list ──
    sess_t = captured("ai_sessions")["sessions"][0]
    sessions = []
    for i, (title, ago, count) in enumerate(c["sessions"]):
        s = copy.deepcopy(sess_t)
        s.update({"id": ASSISTANT_ID + i, "title": title, "message_count": count, "document_count": 0,
                  "created_at": f"{{{{ago:{ago + 5}}}}}", "updated_at": f"{{{{ago:{ago}}}}}"})
        sessions.append(s)
    out["sessions"] = {"sessions": sessions}
    out["ai_conversation"] = {"id": ASSISTANT_ID}

    # ── the calendar ──
    occ = []
    for i, e in enumerate(c["calendar"]):
        day = "sat" if e["kind"] == "birthday" else e["day"]
        all_day = e.get("all_day", False)
        occ.append({
            "id": f"{500 + i}:{{{{date:{day}}}}}", "on": f"{{{{date:{day}}}}}",
            "starts_at": None if all_day else f"{{{{at:{day}@{e['at']}}}}}",
            "ends_at": None if all_day else f"{{{{at:{day}@{e['until']}}}}}",
            "all_day": all_day,
            "event": {"id": 500 + i, "title": e["title"], "description": None, "location": None,
                      "kind": e["kind"], "all_day": all_day, "recurrence": "yearly" if e["kind"] == "birthday" else None,
                      "color": None},
        })
    out["calendar"] = {"occurrences": occ}

    # ── people: the chats list, one thread, and its detail ──
    conv_t = captured("conversations_page1")["conversations"][0]
    part_t = conv_t["participants"][0]
    convs = []
    for ch in c["chats"]:
        other = ch["with"]
        cid = THREAD_IDS[other]
        who, ago, body = ch["last"]
        last = copy.deepcopy(conv_t["last_message"])
        last.update({"id": 81000 + cid, "conversation_id": cid, "body": body, "created_at": f"{{{{ago:{ago}}}}}",
                     "sent_by_me": who == "me", "user": person(who, last["user"]), "user_id": USER_IDS[who],
                     "role": None, "read_at": None})
        cv = copy.deepcopy(conv_t)
        cv.update({
            "id": cid, "is_group": "group" in ch, "title": ch.get("group"),
            "unread_messages_count": ch["unread"], "last_message": last,
            "created_at": f"{{{{ago:{ago + 60 * 24 * 30}}}}}", "updated_at": f"{{{{ago:{ago}}}}}",
            "participants": [dict(copy.deepcopy(part_t), user=person(k, part_t["user"]), last_read_at=f"{{{{ago:{ago}}}}}")
                             for k in ("me", other)],
            "user": person(other, conv_t["user"]) if conv_t.get("user") else None,
        })
        convs.append(cv)
    out["conversations"] = {"conversations": convs, "meta": captured("notifications_page1")["meta"]}
    out["conversations_unread"] = {"unread_messages_count": 1, "unread_messages_total": 1}
    out["thread_detail"] = {"conversation": convs[0]}

    thread = []
    for i, (who, ago, body) in enumerate(c["thread"]):
        x = copy.deepcopy(conv_t["last_message"])
        x.update({"id": 82001 + i, "conversation_id": THREAD_IDS["sam"], "body": body, "created_at": f"{{{{ago:{ago}}}}}",
                  "sent_by_me": who == "me", "role": None, "user": person(who, x["user"]), "user_id": USER_IDS[who],
                  "read_at": f"{{{{ago:{max(ago - 1, 1)}}}}}" if who == "me" else None})
        thread.append(x)
    out["thread_messages"] = {"messages": list(reversed(thread)), "meta": meta | {"pagy": dict(meta["pagy"], count=len(thread))}}

    # ── notifications ──
    notes = []
    for i, n in enumerate(c["notifications"]):
        actor = n.get("actor")
        notes.append({
            "id": 600 + i, "kind": n["kind"], "title": n["title"], "body": n["body"],
            "path": "/calendar" if n["kind"] == "ai.morning_brief" else None,
            "read_at": None if i < 2 else f"{{{{ago:{n['ago'] - 1}}}}}",
            "created_at": f"{{{{ago:{n['ago']}}}}}", "subject_type": None, "subject_id": None,
            "actor": None if not actor else {"id": USER_IDS[actor], "name": f"{PEOPLE[actor]['firstname']} {PEOPLE[actor]['lastname']}", "avatar": None},
        })
    out["notifications"] = {"notifications": notes, "meta": captured("notifications_page1")["meta"]}
    out["notifications_unread"] = {"unread_count": 2}

    # ── who is signed in, and what the suggestions can draw on ──
    me = copy.deepcopy(captured("connected_user"))
    me["user"].update(person("me", me["user"]) | {"lang": lang, "ai_morning_brief": True})
    out["connected_user"] = me
    out["me_summary"] = {"counts": {"contacts": 24, "documents": 3, "events": 5, "expenses": 9, "incomes": 1,
                                    "loans": 1, "notes": 41, "pages": 2, "todos": 6},
                         "stocked": ["notes", "events", "expenses"]}
    out["documents"] = {"documents": []}
    keys = captured("ai_keys")
    out["ai_keys"] = keys | {"ai_keys": [], "borrowed": []}
    return out


# Which request gets which file. Anything not listed is REFUSED in serve
# mode (404), never forwarded: a picture must not show a single real row.
ROUTES = [
    ("GET", r"^/up$", None),
    ("GET", r"^/api/v1/users/connected_user$", "connected_user"),
    ("GET", r"^/api/v1/ai/conversation$", "ai_conversation"),
    ("GET", r"^/api/v1/ai/sessions$", "sessions"),
    ("GET", r"^/api/v1/ai/sessions/\d+/documents", "documents"),
    ("GET", rf"^/api/v1/conversations/{ASSISTANT_ID}/messages", "assistant_messages"),
    ("GET", rf"^/api/v1/conversations/{THREAD_IDS['sam']}/messages", "thread_messages"),
    ("GET", r"^/api/v1/conversations/unread_messages_count$", "conversations_unread"),
    ("GET", rf"^/api/v1/conversations/{THREAD_IDS['sam']}$", "thread_detail"),
    ("POST", rf"^/api/v1/conversations/{THREAD_IDS['sam']}/mark_read$", "thread_detail"),
    ("GET", r"^/api/v1/conversations$", "conversations"),
    ("GET", r"^/api/v1/notifications/unread_count$", "notifications_unread"),
    ("GET", r"^/api/v1/notifications$", "notifications"),
    ("GET", r"^/api/v1/calendar_app/events/upcoming$", "calendar"),
    ("GET", r"^/api/v1/me/summary$", "me_summary"),
    ("GET", r"^/api/v1/ai_keys$", "ai_keys"),
]


def write_doc():
    lines = [
        "# The words in the store pictures — FOR HAMMA9900 TO APPROVE OR CHANGE",
        "",
        "> **`multi_magic_mobile` is a PUBLIC repository.** This file and everything in",
        "> `qa/demo/` are permanent and world-readable the moment they are pushed. That is",
        "> why the builder's last pass nulls any value left from a capture, and why",
        "> `src/api/__tests__/demo.test.ts` fails on any QA string or real date: so nobody",
        "> adds a convenient real value to a fixture. Invented values only, always.",
        "",
        "> **A question for you, not a decision:** the cast (Maya Brooks, Sam Carter, Nora",
        "> Lind) sounds English, and the money is in euros. That reads naturally in the",
        "> English listing. In the French one an English-sounding cast is a small oddness;",
        "> whether it matters depends on who you think is looking. Say the word and the",
        "> French set gets French names.",
        "",
        "Rendered from `qa/demo/content.py` by `qa/demo/build_demo.py`; edit there, never here.",
        "",
        "These pictures go to the whole world and stay there. Every name, amount, place and",
        "date below is INVENTED: nothing is yours, nothing is the QA account's. The fault proxy",
        "serves exactly this (and refuses every other request), so the pictures can show",
        "nothing else. Times are relative to the moment of shooting.",
        "",
        f"Signed in as **{ME['firstname']} {ME['lastname']}** ({ME['email']}).",
        "",
    ]
    for lang, c in CONTENT.items():
        lines += [f"## {'English' if lang == 'en' else 'Français'}", "", "**The assistant conversation**", ""]
        for m in c["assistant"]:
            src = f"  _(from: {', '.join(l for l, _ in m['sources'])})_" if m.get("sources") else ""
            lines.append(f"- **{'Q' if m['role'] == 'user' else 'A'}:** {m['body']}{src}")
        lines += ["", "**Conversations in the sessions list:** " + " · ".join(t for t, _, _ in c["sessions"]), "",
                  "**Calendar, the next seven days**", ""]
        for e in c["calendar"]:
            when = "the coming Saturday, all day" if e["kind"] == "birthday" else f"day +{e['day']}, {e['at']}–{e['until']}"
            lines.append(f"- {e['title']} ({when})")
        lines += ["", "**People chats**", ""]
        for ch in c["chats"]:
            name = ch.get("group") or f"{PEOPLE[ch['with']]['firstname']} {PEOPLE[ch['with']]['lastname']}"
            lines.append(f"- {name}: “{ch['last'][2]}”")
        lines += ["", "**The thread with Sam Carter**", ""]
        for who, _, body in c["thread"]:
            lines.append(f"- {'Maya' if who == 'me' else 'Sam'}: {body}")
        lines += ["", "**Notifications**", ""]
        for n in c["notifications"]:
            lines.append(f"- {n['title']}" + (f": {n['body']}" if n["body"] else ""))
        lines.append("")
    with open(DOC, "w") as f:
        f.write("\n".join(lines))


def scrub_capture(value):
    """The LAST pass: nothing captured may survive into a picture's data. A
    real timestamp becomes relative, a scrub placeholder becomes null, and
    the QA session's id in pagy's URLs becomes the demo's."""
    if isinstance(value, dict):
        return {k: scrub_capture(v) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub_capture(v) for v in value]
    if isinstance(value, str):
        if re.match(r"^\d{4}-\d\d-\d\dT", value):
            return "{{ago:1440}}"
        if value.startswith("scrubbed ") or value == "person@example.test":
            return None
        return re.sub(r"/conversations/\d+/", f"/conversations/{ASSISTANT_ID}/", value)
    return value


def main():
    for lang in CONTENT:
        d = os.path.join(HERE, lang)
        os.makedirs(d, exist_ok=True)
        for name, body in build(lang).items():
            body = scrub_capture(body)
            with open(os.path.join(d, f"{name}.json"), "w") as f:
                json.dump(body, f, ensure_ascii=False, indent=2, sort_keys=True)
                f.write("\n")
        with open(os.path.join(d, "routes.json"), "w") as f:
            json.dump([{"method": m, "path": p, "file": fn} for m, p, fn in ROUTES], f, indent=2)
            f.write("\n")
    write_doc()
    print("rendered qa/demo/en, qa/demo/fr and docs/store/DEMO_CONTENT.md")


if __name__ == "__main__":
    main()
