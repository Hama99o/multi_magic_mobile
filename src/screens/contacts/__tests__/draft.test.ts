/**
 * The contact form's state (SPEC §C.6): what is sent, what blocks Save, and
 * what counts as a change worth asking about on Cancel.
 */
import { addEntry, addTag, draftFrom, emptyDraft, isDirty, problems, removeEntry, removeTag, setEntry, toPayload } from "../draft";
import type { Contact } from "@/api/contacts";

const jamil: Contact = {
  id: 7, firstname: "Jamil", lastname: "Safi", nickname: null, company: "Acme", jobTitle: null, favorite: true,
  birthDate: "1990-04-05", age: 36, photoUrl: null,
  phones: [{ label: "mobile", value: "+93 70 123 4567" }, { label: "work", value: "020" }],
  emails: [{ label: "home", value: "j@home.test" }],
  addresses: [{ label: "home", street: "12 Main St", city: "Kabul", state: "", postal: "", country: "Afghanistan" }],
  website: null, notes: "n", relations: [], documents: null, isSelf: false,
  socialLinks: [{ label: "linkedin", value: "https://linkedin.test/in/jamil" }], tags: ["school"], gender: "male", closeness: "close",
};

describe("a new contact", () => {
  it("starts with one empty phone and one empty email row to type into", () => {
    const d = emptyDraft();
    expect(d.phones).toEqual([{ label: "mobile", value: "" }]);
    expect(d.emails).toEqual([{ label: "home", value: "" }]);
  });

  it("is not dirty until something is typed", () => {
    expect(isDirty(emptyDraft(), emptyDraft())).toBe(false);
    expect(isDirty({ ...emptyDraft(), firstname: "A" }, emptyDraft())).toBe(true);
  });

  it("does not count an empty extra row as a change", () => {
    expect(isDirty(addEntry(emptyDraft(), "phones"), emptyDraft())).toBe(false);
  });
});

describe("editing", () => {
  it("fills every field from the contact, keeping every phone and email", () => {
    const d = draftFrom(jamil);
    expect(d).toMatchObject({ firstname: "Jamil", lastname: "Safi", company: "Acme", favorite: true, birthDate: "1990-04-05" });
    expect(d.phones).toHaveLength(2);
    expect(d.addresses[0].city).toBe("Kabul");
  });

  it("adds, changes and removes a phone without touching the others", () => {
    let d = draftFrom(jamil);
    d = addEntry(d, "phones");
    d = setEntry(d, "phones", 2, { value: "0612" });
    d = setEntry(d, "phones", 2, { label: "home" });
    d = removeEntry(d, "phones", 0);
    expect(d.phones).toEqual([{ label: "work", value: "020" }, { label: "home", value: "0612" }]);
  });

  it("adds a work email after a home one, a home phone after a mobile", () => {
    expect(addEntry(emptyDraft(), "emails").emails[1].label).toBe("work");
    expect(addEntry(emptyDraft(), "phones").phones[1].label).toBe("home");
  });
});

describe("problems", () => {
  it("needs a name or a company", () => {
    expect(problems(emptyDraft())).toEqual(["name"]);
    expect(problems({ ...emptyDraft(), company: "Acme" })).toEqual([]);
    expect(problems({ ...emptyDraft(), lastname: "Safi" })).toEqual([]);
  });

  it("refuses an email without an @ and a number without three digits, by row", () => {
    const d = { ...emptyDraft(), firstname: "A", emails: [{ label: "home", value: "nope" }], phones: [{ label: "mobile", value: "12" }] };
    expect(problems(d)).toEqual(["email:0", "phone:0"]);
  });

  it("ignores empty rows", () => {
    expect(problems({ ...emptyDraft(), firstname: "A" })).toEqual([]);
  });
});

describe("toPayload", () => {
  it("trims, drops empty rows and empty addresses, and sends every list whole", () => {
    const d = {
      ...draftFrom(jamil),
      firstname: "  Jamil ",
      phones: [{ label: "mobile", value: " +93 70 " }, { label: "home", value: "  " }],
      emails: [{ label: "home", value: " J@Home.test " }],
      addresses: [{ label: "home", street: " ", city: "", state: "", postal: "", country: "" }],
    };
    expect(toPayload(d)).toEqual({
      firstname: "Jamil", lastname: "Safi", nickname: "", company: "Acme", job_title: "", website: "", notes: "n",
      favorite: true, birth_date: "1990-04-05",
      phones: [{ label: "mobile", value: "+93 70" }],
      emails: [{ label: "home", value: "J@Home.test" }],
      addresses: [],
      social_links: [{ label: "linkedin", value: "https://linkedin.test/in/jamil" }],
      tags: ["school"],
      gender: "male",
      closeness: "close",
    });
  });

  it("sends an empty list when every phone was removed, which clears them on the server", () => {
    const d = { ...draftFrom(jamil), phones: [] };
    expect(toPayload(d).phones).toEqual([]);
  });
});

// Audit #24: the web drawer's social links, tags, gender and closeness.
describe("the family and social fields", () => {
  it("a new contact starts with no links, no tags, gender unknown and closeness unset", () => {
    const d = emptyDraft();
    expect([d.socialLinks, d.tags, d.gender, d.closeness]).toEqual([[], [], "unknown", "unset"]);
  });

  it("adds a social link as LinkedIn first, then the next unused label, and drops blank ones on save", () => {
    let d = addEntry(emptyDraft(), "socialLinks");
    expect(d.socialLinks).toEqual([{ label: "linkedin", value: "" }]);
    d = addEntry(d, "socialLinks");
    expect(d.socialLinks[1].label).toBe("twitter");
    d = setEntry(d, "socialLinks", 0, { value: " https://linkedin.test/in/sara " });
    expect(toPayload(d).social_links).toEqual([{ label: "linkedin", value: "https://linkedin.test/in/sara" }]);
  });

  it("adds a tag once, trimmed, as the web's addTag does, and removes it", () => {
    let d = addTag(emptyDraft(), "  family ");
    d = addTag(d, "family");
    d = addTag(d, "   ");
    d = addTag(d, "work");
    expect(d.tags).toEqual(["family", "work"]);
    expect(removeTag(d, "family").tags).toEqual(["work"]);
  });

  it("a changed gender or closeness is a change worth asking about", () => {
    const d = draftFrom(jamil);
    expect(isDirty({ ...d, closeness: "distant" }, d)).toBe(true);
    expect(isDirty({ ...d, gender: "unknown" }, d)).toBe(true);
    expect(isDirty(addTag(d, "chess"), d)).toBe(true);
  });
});
