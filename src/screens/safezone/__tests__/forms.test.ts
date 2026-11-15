/**
 * Add and edit, as the web's drawers do them (owner, 2026-11-15: "everything
 * doable on mobile"; PasswordDrawer / PaymentCardDrawer / IdentityDrawer in
 * multi_magic): the same fields, the same required ones, the same payload.
 * Invented values only.
 */
import { emptyForm, formFromItem, generatePassword, toPayload, validateForm, FORM_FIELDS } from "../forms";

describe("the fields are the web's", () => {
  it("password: title (required), username, email, password, link, note", () => {
    expect(FORM_FIELDS.passwords.map((f) => [f.key, Boolean(f.required)])).toEqual([
      ["title", true], ["username", false], ["email", false], ["password", false], ["link", false], ["note", false],
    ]);
  });
  it("card: name (required), type, number (19), cvv (4), expiry, billing code, note", () => {
    expect(FORM_FIELDS.payment_cards.map((f) => f.key)).toEqual(["name", "card_type", "card_number", "cvv", "expiry_date", "code", "note"]);
    expect(FORM_FIELDS.payment_cards.find((f) => f.key === "card_number")?.maxLength).toBe(19);
    expect(FORM_FIELDS.payment_cards.find((f) => f.key === "cvv")?.maxLength).toBe(4);
    expect(FORM_FIELDS.payment_cards.find((f) => f.key === "card_type")?.options).toEqual(["credit_card", "debit_card"]);
  });
  it("document: type (one of five), number (required), issued, expires, note", () => {
    expect(FORM_FIELDS.identities.map((f) => f.key)).toEqual(["type", "document_number", "issued_at", "expires_at", "note"]);
    expect(FORM_FIELDS.identities.find((f) => f.key === "type")?.options).toEqual(["passport", "national_id", "drivers_license", "residence_permit", "other"]);
  });
});

describe("validation", () => {
  it("asks for the required field of each kind", () => {
    expect(validateForm("passwords", emptyForm("passwords"))).toEqual({ title: "required" });
    expect(validateForm("payment_cards", emptyForm("payment_cards"))).toEqual({ name: "required" });
    expect(validateForm("identities", emptyForm("identities"))).toEqual({ document_number: "required" });
    expect(validateForm("passwords", { ...emptyForm("passwords"), title: "   " })).toEqual({ title: "required" });
  });
  it("an email must look like one; a date must be a real YYYY-MM-DD", () => {
    expect(validateForm("passwords", { ...emptyForm("passwords"), title: "Mail", email: "not-an-email" })).toEqual({ email: "email" });
    expect(validateForm("identities", { ...emptyForm("identities"), document_number: "X1", issued_at: "2026-02-30" })).toEqual({ issued_at: "date" });
    expect(validateForm("identities", { ...emptyForm("identities"), document_number: "X1", expires_at: "2030-01-31" })).toEqual({});
  });
});

describe("the payload", () => {
  it("is wrapped in the server's root and holds only the permitted keys, trimmed", () => {
    const values = { ...emptyForm("passwords"), title: " Mail ", username: "qa", password: "p w", extra: "x" } as Record<string, string>;
    expect(toPayload("passwords", values)).toEqual({
      password: { title: "Mail", username: "qa", email: "", password: "p w", link: "", note: "" },
    });
    expect(Object.keys(toPayload("payment_cards", emptyForm("payment_cards")))).toEqual(["payment_card"]);
    expect(toPayload("identities", { ...emptyForm("identities"), document_number: "X1" }).identity).toMatchObject({ type: "passport", document_number: "X1" });
  });
  it("a new card defaults to a credit card; a new document to a passport (the web's defaults)", () => {
    expect(emptyForm("payment_cards").card_type).toBe("credit_card");
    expect(emptyForm("identities").type).toBe("passport");
  });
  it("an item prefills the form, title included", () => {
    const item = { kind: "passwords" as const, id: 1, title: "Mail", fields: [
      { key: "username", value: "qa", secret: false }, { key: "password", value: "s3cret-x", secret: true },
    ] };
    expect(formFromItem(item)).toEqual({ ...emptyForm("passwords"), title: "Mail", username: "qa", password: "s3cret-x" });
  });
});

describe("the generator is the web's", () => {
  const AMBIGUOUS = /[0O1lI]/;
  it("20 characters, one of each class, no ambiguous glyph", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(20);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).toMatch(/[!@#$%^&*()\-_=+]/);
      expect(p).not.toMatch(AMBIGUOUS);
    }
  });
  it("draws from the random source it is given", () => {
    let n = 0;
    const p = generatePassword(() => n++);
    expect(p).toHaveLength(20);
  });
});
