/**
 * The phone's own contacts become vCard 3.0 text for `import_vcard`
 * (SPEC §C.7). The server's reader (`ContactApp::VcardReader`, multi_magic
 * 485e2db1) is the other end, so each case here names what it reads.
 */
import { chunk, toVcard, toVcards, type PhoneContact } from "../vcard";

const ali: PhoneContact = {
  id: "1",
  givenName: "Ali",
  familyName: "Khan",
  nickname: "Ali jan",
  company: "Acme",
  jobTitle: "Driver",
  note: "Met at the market, Kabul\nSecond line; ok",
  birthday: { year: 1990, month: 4, day: 5 },
  phones: [{ label: "mobile", number: "+93 70 123 4567" }, { label: "work", number: "020 123 456" }],
  emails: [{ label: "home", address: "ali@home.test" }],
  addresses: [{ label: "home", street: "12 Main St", city: "Kabul", region: "", postcode: "1001", country: "Afghanistan" }],
  urlAddresses: [{ url: "https://ali.test" }],
};

describe("toVcard", () => {
  const card = toVcard(ali);

  it("is one well-formed 3.0 card with CRLF lines", () => {
    expect(card.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(card.endsWith("END:VCARD\r\n")).toBe(true);
    expect(card.split("\r\n").filter((l) => l && !l.includes(":"))).toEqual([]);
  });

  it("writes the name as N (family;given) and FN", () => {
    expect(card).toContain("\r\nN:Khan;Ali;;;\r\n");
    expect(card).toContain("\r\nFN:Ali Khan\r\n");
  });

  it("writes every phone and email with the TYPE the server maps back to our labels", () => {
    expect(card).toContain("\r\nTEL;TYPE=CELL:+93 70 123 4567\r\n");
    expect(card).toContain("\r\nTEL;TYPE=WORK:020 123 456\r\n");
    expect(card).toContain("\r\nEMAIL;TYPE=HOME:ali@home.test\r\n");
  });

  it("escapes commas, semicolons and newlines in text (RFC 6350 §3.4)", () => {
    expect(card).toContain("\r\nNOTE:Met at the market\\, Kabul\\nSecond line\\; ok\r\n");
  });

  it("writes the details the server reads", () => {
    expect(card).toContain("\r\nORG:Acme\r\n");
    expect(card).toContain("\r\nTITLE:Driver\r\n");
    expect(card).toContain("\r\nNICKNAME:Ali jan\r\n");
    expect(card).toContain("\r\nBDAY:1990-04-05\r\n");
    expect(card).toContain("\r\nURL:https://ali.test\r\n");
    expect(card).toContain("\r\nADR;TYPE=HOME:;;12 Main St;Kabul;;1001;Afghanistan\r\n");
  });

  it("keeps a custom label through the iOS item grouping the server reads", () => {
    const custom = toVcard({ ...ali, phones: [{ label: "Grandma's", number: "0700" }], emails: [] });
    expect(custom).toContain("\r\nitem1.TEL:0700\r\nitem1.X-ABLabel:Grandma's\r\n");
  });

  it("leaves out a birthday without a year rather than invent one", () => {
    expect(toVcard({ ...ali, birthday: { month: 4, day: 5 } })).not.toContain("BDAY");
  });

  it("keeps Arabic and accented names as UTF-8 text", () => {
    const c = toVcard({ id: "2", givenName: "علی", familyName: "Ahmadi", phones: [{ number: "0700" }] });
    expect(c).toContain("\r\nN:Ahmadi;علی;;;\r\n");
  });

  it("names a card with no name after its company, so FN is never empty", () => {
    expect(toVcard({ id: "3", company: "Pharmacie", phones: [{ number: "01" }] })).toContain("\r\nFN:Pharmacie\r\n");
  });

  it("skips blank phones and emails", () => {
    const c = toVcard({ id: "4", givenName: "X", phones: [{ number: "  " }], emails: [{ address: "" }] });
    expect(c).not.toMatch(/TEL|EMAIL/);
  });
});

describe("toVcards", () => {
  it("drops contacts with nothing to recognise them by", () => {
    expect(toVcards([{ id: "1" }, { id: "2", givenName: "Ana" }])).toHaveLength(1);
  });
});

describe("chunk", () => {
  it("cuts 301 cards into 50s, the last one short", () => {
    const parts = chunk(Array.from({ length: 301 }, (_, i) => i), 50);
    expect(parts.map((p) => p.length)).toEqual([50, 50, 50, 50, 50, 50, 1]);
  });

  it("returns nothing for nothing", () => {
    expect(chunk([], 50)).toEqual([]);
  });
});
