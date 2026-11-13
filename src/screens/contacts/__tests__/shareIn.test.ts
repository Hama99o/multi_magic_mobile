/**
 * What another app shares INTO MultiMagic, and where it goes (owner,
 * 2026-11-12): a contact card → Contacts, several → the bulk import, a text
 * holding a number or an email → "add as a contact", files → Pages, and
 * plain text with neither → nowhere (never dumped into Pages).
 */
import { classifyShare, detectContactBits, looksLikeVcard, mergeInto, parseCard, partitionShare, planShare, sameContact, unknownType } from "../shareIn";

const card = (body: string) => `BEGIN:VCARD\r\nVERSION:3.0\r\n${body}END:VCARD\r\n`;

describe("detectContactBits", () => {
  it.each([
    ["Call me on 07 01 23 45 67 tonight", ["07 01 23 45 67"], []],
    ["+93 70 123 4567", ["+93 70 123 4567"], []],
    ["Mon numéro : 06-12-34-56-78, mon mail jamil@work.test.", ["06-12-34-56-78"], ["jamil@work.test"]],
    ["0033 6 12 34 56 78", ["0033 6 12 34 56 78"], []],
    ["(020) 123.4567", ["(020) 123.4567"], []],
    ["write to a.b+c@x.co.uk", [], ["a.b+c@x.co.uk"]],
  ])("%s", (text, phones, emails) => {
    expect(detectContactBits(text)).toEqual({ phones, emails });
  });

  it("does not take a date, a time, a price or a short code for a number", () => {
    expect(detectContactBits("See you 2026-11-12 at 14:30, it costs 1 250 €, code 4821").phones).toEqual([]);
    expect(detectContactBits("12/11/2026").phones).toEqual([]);
  });

  it("lists a number once even if it appears twice", () => {
    expect(detectContactBits("0612345678 or 0612345678").phones).toEqual(["0612345678"]);
  });
});

describe("classifyShare", () => {
  const vcfFile = { path: "/tmp/a.vcf", mimeType: "text/x-vcard", fileName: "Jamil.vcf" };

  it("sends a vCard FILE to Contacts", () => {
    expect(classifyShare({ files: [vcfFile], text: null })).toEqual({ kind: "vcards", files: ["file:///tmp/a.vcf"] });
  });

  it("recognises a .vcf by its name when the type is generic", () => {
    expect(classifyShare({ files: [{ path: "/tmp/b.vcf", mimeType: "application/octet-stream", fileName: "b.vcf" }], text: null }).kind).toBe("vcards");
  });

  it("sends a vCard shared as TEXT to Contacts", () => {
    const text = card("FN:Ali\r\n");
    expect(classifyShare({ files: null, text })).toEqual({ kind: "vcardText", text });
  });

  it("sends a text with a number or an email to Contacts", () => {
    expect(classifyShare({ files: null, text: "Ali: 0701234567" })).toEqual({ kind: "bits", text: "Ali: 0701234567", phones: ["0701234567"], emails: [] });
  });

  it("sends photos and other files to Pages, as before", () => {
    expect(classifyShare({ files: [{ path: "/tmp/p.jpg", mimeType: "image/jpeg", fileName: "p.jpg" }], text: null }).kind).toBe("files");
  });

  it("sends a mix of a card and a photo to Pages rather than drop the photo", () => {
    expect(classifyShare({ files: [vcfFile, { path: "/tmp/p.jpg", mimeType: "image/jpeg", fileName: "p.jpg" }], text: null }).kind).toBe("files");
  });

  it("lets go of plain text with nothing to keep (Pages keeps files, not sentences)", () => {
    expect(classifyShare({ files: null, text: "see you later" }).kind).toBe("nothing");
    expect(classifyShare({ files: null, text: null }).kind).toBe("nothing");
  });
});

describe("parseCard", () => {
  it("reads the fields a new-contact form shows", () => {
    const c = parseCard(card(
      "N:Safi;Jamil;;;\r\nFN:Jamil Safi\r\nORG:Acme;Sales\r\nTITLE:Driver\r\nTEL;TYPE=CELL:+93 70 123 4567\r\n" +
      "TEL;TYPE=WORK:020 123\r\nEMAIL;TYPE=HOME:j@home.test\r\nEMAIL;TYPE=WORK:j@work.test\r\nBDAY:1990-04-05\r\n" +
      "NOTE:Met in Kabul\\, at the market\r\nADR;TYPE=HOME:;;12 Main St;Kabul;;1001;Afghanistan\r\n",
    ));
    expect(c).toMatchObject({
      firstname: "Jamil", lastname: "Safi", company: "Acme", jobTitle: "Driver", birthDate: "1990-04-05", notes: "Met in Kabul, at the market",
      phones: [{ label: "mobile", value: "+93 70 123 4567" }, { label: "work", value: "020 123" }],
      emails: [{ label: "home", value: "j@home.test" }, { label: "work", value: "j@work.test" }],
    });
    expect(c.addresses[0]).toMatchObject({ street: "12 Main St", city: "Kabul", country: "Afghanistan" });
  });

  it("decodes an Android 2.1 card: quoted-printable UTF-8, soft breaks, bare types", () => {
    const c = parseCard("BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=89lodie;Ren=\r\n=C3=A9e;;;\r\nTEL;CELL;PREF:0612345678\r\nEND:VCARD\r\n");
    expect([c.firstname, c.lastname, c.phones]).toEqual(["Renée", "Élodie", [{ label: "mobile", value: "0612345678" }]]);
  });

  it("splits FN when there is no N, unfolds folded lines, keeps an inline photo", () => {
    const c = parseCard(card("FN:Sara Khan\r\nNOTE:long note\r\n  folded\r\nPHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQ\r\n"));
    expect([c.firstname, c.lastname, c.notes]).toEqual(["Sara", "Khan", "long note folded"]);
    expect(c.photo).toEqual({ base64: "/9j/4AAQ", mimeType: "image/jpeg" });
  });

  it("decodes a quoted-printable Arabic-script name (three-byte UTF-8)", () => {
    const c = parseCard("BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:;=D8=B9=D9=84=DB=8C;;;\r\nEND:VCARD\r\n");
    expect(c.firstname).toBe("علی");
  });

  it("drops a year-less birthday rather than invent a year", () => {
    expect(parseCard(card("FN:A\r\nBDAY:--0405\r\n")).birthDate).toBeNull();
  });
});

describe("sameContact", () => {
  const book = [
    { id: 3, firstname: "Jamil", lastname: "Safi", nickname: null, company: null, phones: [{ label: "mobile", value: "+93 70 123 4567" }], emails: [] },
    { id: 4, firstname: "Sara", lastname: "", nickname: null, company: null, phones: [], emails: [{ label: "home", value: "Sara@X.test" }] },
  ];

  it("finds the person by a number in any format (last nine digits, the server's rule)", () => {
    expect(sameContact({ phones: [{ label: "mobile", value: "070-123-4567" }], emails: [] }, book)?.id).toBe(3);
  });

  it("finds the person by an email, ignoring case", () => {
    expect(sameContact({ phones: [], emails: [{ label: "home", value: "sara@x.test" }] }, book)?.id).toBe(4);
  });

  it("finds no one for new details", () => {
    expect(sameContact({ phones: [{ label: "mobile", value: "0699999999" }], emails: [] }, book)).toBeNull();
  });
});

describe("mergeInto", () => {
  it("adds only the numbers and emails the contact does not have yet", () => {
    const merged = mergeInto(
      { phones: [{ label: "mobile", value: "+93 70 123 4567" }], emails: [{ label: "home", value: "a@x.test" }] },
      { phones: [{ label: "mobile", value: "0701234567" }, { label: "work", value: "020 555 1234" }], emails: [{ label: "work", value: "A@X.test" }, { label: "work", value: "b@x.test" }] },
    );
    expect(merged).toEqual({
      phones: [{ label: "mobile", value: "+93 70 123 4567" }, { label: "work", value: "020 555 1234" }],
      emails: [{ label: "home", value: "a@x.test" }, { label: "work", value: "b@x.test" }],
    });
  });
});

describe("a file shared with no useful type (seen on the device, 2026-11-12)", () => {
  it("is 'unknown' when the type is generic AND the name has no known extension", () => {
    expect(unknownType({ path: "content://x/1000000058", mimeType: "application/octet-stream", fileName: "1000000058" })).toBe(true);
    expect(unknownType({ path: "content://x/1", mimeType: null, fileName: null })).toBe(true);
    expect(unknownType({ path: "/tmp/a.jpg", mimeType: "application/octet-stream", fileName: "a.jpg" })).toBe(false);
    expect(unknownType({ path: "/tmp/a", mimeType: "image/jpeg", fileName: "a" })).toBe(false);
  });

  it("is a vCard when its first bytes say so", () => {
    expect(looksLikeVcard("\uFEFF  BEGIN:VCARD\r\nFN:A")).toBe(true);
    expect(looksLikeVcard("begin:vcard")).toBe(true);
    expect(looksLikeVcard("%PDF-1.7")).toBe(false);
  });
});

// ── a share of several files: contacts to Contacts, the rest to Pages ──────
// (the owner, 2026-11-13: a .vcf shared to MultiMagic must open Contacts,
// not Pages; contacts SPEC §F.3)

describe("partitionShare: which files are cards, which may be, which are not", () => {
  const f = (path: string, mimeType: string | null, fileName: string | null = null) => ({ path, mimeType, fileName });

  it("a vCard by type or by extension, in any case, is a card", () => {
    const p = partitionShare([
      f("/a", "text/vcard", "a"), f("/b", "text/x-vcard", "b"), f("/c.vcf", "application/octet-stream", "c.vcf"),
      f("/d", null, "D.VCF"), f("/e", "text/directory", "e"), f("/z.csv", "text/csv", "z.csv"),
    ]);
    // text/directory is vCard's older MIME type (RFC 2425).
    expect(p.cards.map((x) => x.path)).toEqual(["/a", "/b", "/c.vcf", "/d", "/e"]);
    expect(p.others.map((x) => x.path)).toEqual(["/z.csv"]);
  });

  it("a generic type with no extension, or plain text, MAY be one: its bytes decide", () => {
    const p = partitionShare([f("/x", "application/octet-stream", "1000000058"), f("/t.txt", "text/plain", "t.txt"), f("/p.jpg", "image/jpeg", "p.jpg")]);
    expect(p.sniff.map((x) => x.path)).toEqual(["/x", "/t.txt"]);
    expect(p.others.map((x) => x.path)).toEqual(["/p.jpg"]);
  });
});

describe("planShare: after the sniff", () => {
  const f = (path: string, mimeType: string, fileName: string) => ({ path, mimeType, fileName });
  const vcf = f("/Ali.vcf", "text/x-vcard", "Ali.vcf");
  const photo = f("/p.jpg", "image/jpeg", "p.jpg");
  const txt = f("/t.txt", "text/plain", "t.txt");

  it("only cards: Contacts, nothing for Pages", () => {
    expect(planShare([vcf], new Set())).toEqual({ cards: ["file:///Ali.vcf"], pages: [] });
  });

  it("mixed: the cards to Contacts, the photo kept for Pages", () => {
    expect(planShare([vcf, photo], new Set())).toEqual({ cards: ["file:///Ali.vcf"], pages: [photo] });
  });

  it("a plain-text file whose bytes are a vCard joins the cards; one that is not goes to Pages", () => {
    expect(planShare([txt, photo], new Set(["/t.txt"]))).toEqual({ cards: ["file:///t.txt"], pages: [photo] });
    expect(planShare([txt, photo], new Set())).toEqual({ cards: [], pages: [txt, photo] });
  });

  it("no card at all: everything to Pages, as before", () => {
    expect(planShare([photo], new Set())).toEqual({ cards: [], pages: [photo] });
  });
});
