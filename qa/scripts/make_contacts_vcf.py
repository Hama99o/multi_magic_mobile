#!/usr/bin/env python3
"""A synthetic address book for the Contacts device pass — NO real person.

Writes N vCards (default 300) the way phones export them, to stress the
import end to end:

- a third as Android vCard 2.1 with quoted-printable UTF-8 names (accents,
  Arabic script), the rest as iOS-style 3.0 with folded NOTE lines;
- numbers in every shape the owner's book holds: 07xx (Afghanistan), +93,
  0093, 06xx (France), spaced, dashed, bracketed;
- every 15th card a DUPLICATE of an earlier one (same number, other format),
  so the summary must say "already there" for exactly those;
- one card with two emails, one with no name (named after its number).

All names are drawn from fixed lists of invented people; numbers are in
ranges reserved for fiction where one exists (FR 06 39 98 xx xx) or
otherwise random. Usage: make_contacts_vcf.py [N] [OUT]
"""
import quopri
import random
import sys

N = int(sys.argv[1]) if len(sys.argv) > 1 else 300
OUT = sys.argv[2] if len(sys.argv) > 2 else "qa-contacts-300.vcf"
rng = random.Random(20261112)

FIRST = ["Ali", "Sara", "Élodie", "Renée", "Zoë", "Omar", "Laila", "Bilal", "Nour", "Hugo", "Inès", "Yusuf",
         "علی", "مریم", "احمد", "زهرا", "Ömer", "Søren", "Chloé", "Karim"]
LAST = ["Testa", "Exemple", "Fictif", "Demo", "Sample", "Placeholder", "رحیمی", "کریمی", "Lefèvre", "Ørsted"]


def number(i: int) -> str:
    shape = i % 6
    tail = f"{rng.randrange(0, 10**7):07d}"
    if shape == 0:
        return f"07{tail[:1]} {tail[1:4]} {tail[4:]}"         # 07x xxx xxxx (AF)
    if shape == 1:
        return f"+93 7{tail[:1]} {tail[1:4]} {tail[4:]}"
    if shape == 2:
        return f"00937{tail}"
    if shape == 3:
        return f"06 39 98 {tail[:2]} {tail[2:4]}"             # FR fiction range
    if shape == 4:
        return f"06-39-98-{tail[:2]}-{tail[2:4]}"
    return f"(+33) 6 39 98 {tail[:2]} {tail[2:4]}"


def qp(text: str) -> str:
    return quopri.encodestring(text.encode("utf-8")).decode("ascii").replace("=\n", "")


cards = []
made = []
for i in range(N):
    if i and i % 15 == 0:
        first, last, tel = made[i // 3]
        digits = "".join(ch for ch in tel if ch.isdigit())
        tel = f"+{digits}" if not tel.startswith("0") else tel.replace(" ", "")  # same number, other shape
    else:
        first, last, tel = rng.choice(FIRST), rng.choice(LAST), number(i)
    made.append((first, last, tel))
    if i == 7:
        cards.append(f"BEGIN:VCARD\r\nVERSION:3.0\r\nTEL;TYPE=CELL:{tel}\r\nEND:VCARD\r\n")
        continue
    if i % 3 == 0:
        cards.append(
            "BEGIN:VCARD\r\nVERSION:2.1\r\n"
            f"N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:{qp(last)};{qp(first)};;;\r\n"
            f"TEL;CELL;PREF:{tel}\r\nEND:VCARD\r\n"
        )
    else:
        extra = "EMAIL;TYPE=HOME:qa.one@example.test\r\nEMAIL;TYPE=WORK:qa.two@example.test\r\n" if i == 11 else ""
        cards.append(
            "BEGIN:VCARD\r\nVERSION:3.0\r\n"
            f"N:{last};{first};;;\r\nFN:{first} {last}\r\nTEL;TYPE=CELL:{tel}\r\n{extra}"
            "NOTE:Synthetic QA contact\\, generated for the import test. This line is long enough that \r\n"
            " the phone folds it.\r\nEND:VCARD\r\n"
        )

with open(OUT, "w", encoding="utf-8") as f:
    f.write("".join(cards))
dups = sum(1 for i in range(1, N) if i % 15 == 0)
print(f"wrote {N} cards to {OUT} ({dups} deliberate duplicates of earlier cards)")
