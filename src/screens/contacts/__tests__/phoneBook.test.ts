/**
 * The phone's address book, behind one boundary (SPEC §C.7–8): permission
 * asked at the tap, never at launch; denied and iOS 18 "limited" each said;
 * and a binary built before expo-contacts existed renders a sentence, not a crash.
 */
import { Platform } from "react-native";
import { phoneBook, fieldsFor, birthdayFromDates } from "../phoneBook";

jest.mock("expo-contacts", () => ({
  Contact: { presentPicker: jest.fn(), getAllDetails: jest.fn(), presentCreateForm: jest.fn(), presentAccessPicker: jest.fn() },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));


const mocked = jest.requireMock("expo-contacts") as {
  Contact: Record<"presentPicker" | "getAllDetails" | "presentCreateForm" | "presentAccessPicker", jest.Mock>;
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
};
const mockContact = mocked.Contact;
const mockPermissions = mocked;

beforeEach(() => jest.clearAllMocks());

describe("access", () => {
  it("asks only when called, and says granted / limited / denied", async () => {
    mockPermissions.requestPermissionsAsync
      .mockResolvedValueOnce({ granted: true, accessPrivileges: "all", canAskAgain: true })
      .mockResolvedValueOnce({ granted: true, accessPrivileges: "limited", canAskAgain: true })
      .mockResolvedValueOnce({ granted: false, canAskAgain: false });
    expect(mockPermissions.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(await phoneBook.requestAccess()).toBe("all");
    expect(await phoneBook.requestAccess()).toBe("limited");
    expect(await phoneBook.requestAccess()).toBe("denied");
  });

  it("treats a thrown request as denied, not as a crash", async () => {
    mockPermissions.requestPermissionsAsync.mockRejectedValueOnce(new Error("boom"));
    expect(await phoneBook.requestAccess()).toBe("denied");
  });
});

describe("reading", () => {
  it("picks one contact with the system picker and reads its details", async () => {
    const getDetails = jest.fn().mockResolvedValue({ givenName: "Ali", phones: [{ label: "mobile", number: "0700" }] });
    mockContact.presentPicker.mockResolvedValueOnce({ id: "9", getDetails });
    expect(await phoneBook.pickOne()).toEqual({ id: "9", givenName: "Ali", phones: [{ label: "mobile", number: "0700" }] });
  });

  it("returns null when the picker is dismissed", async () => {
    mockContact.presentPicker.mockResolvedValueOnce(null);
    expect(await phoneBook.pickOne()).toBeNull();
  });

  it("reads every contact with the fields a vCard needs, keeping each id", async () => {
    mockContact.getAllDetails.mockResolvedValueOnce([{ id: "1", givenName: "A" }, { givenName: "no id" }]);
    const all = await phoneBook.readAll();
    expect(all).toEqual([{ id: "1", givenName: "A" }, { id: "phone-1", givenName: "no id" }]);
    expect(mockContact.getAllDetails.mock.calls[0][0]).toEqual(expect.arrayContaining(["givenName", "familyName", "phones", "emails", "addresses", "note"]));
  });
});

describe("saving to the phone", () => {
  it("opens the system's own new-contact form, filled in", async () => {
    mockContact.presentCreateForm.mockResolvedValueOnce(true);
    const saved = await phoneBook.saveToPhone({
      firstname: "Jamil", lastname: "Safi", company: "Acme", jobTitle: "Driver", notes: "n",
      phones: [{ label: "mobile", value: "0700" }], emails: [{ label: "work", value: "j@w.test" }],
    });
    expect(saved).toBe(true);
    expect(mockContact.presentCreateForm.mock.calls[0][0]).toEqual({
      givenName: "Jamil", familyName: "Safi", company: "Acme", jobTitle: "Driver", note: "n",
      phones: [{ label: "mobile", number: "0700" }], emails: [{ label: "work", address: "j@w.test" }],
    });
  });
});

describe("the fields asked for, per platform (device, 2026-11-12)", () => {
  // Android's native ContactField has no "birthday": asking for it rejected
  // the whole read ("Couldn't convert 'birthday' to ContactField"), and
  // "Choose from this phone" failed every time. Birthdays come in "dates".
  it("Android asks for dates, never birthday", () => {
    const f = fieldsFor("android");
    expect(f).toContain("dates");
    expect(f).not.toContain("birthday");
  });

  it("iOS asks for birthday", () => {
    expect(fieldsFor("ios")).toContain("birthday");
  });

  it("reads an Android birthday out of the dates", () => {
    expect(birthdayFromDates([{ label: "anniversary", date: { year: 2010, month: 6, day: 1 } }, { label: "birthday", date: { year: 1990, month: 4, day: 5 } }]))
      .toEqual({ year: 1990, month: 4, day: 5 });
    expect(birthdayFromDates([])).toBeNull();
  });

  it("reads the whole book on Android with dates, and fills birthday from them", async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    mockContact.getAllDetails.mockResolvedValueOnce([{ id: "1", givenName: "A", dates: [{ label: "birthday", date: { year: 1990, month: 4, day: 5 } }] }]);
    const [one] = await phoneBook.readAll();
    expect(mockContact.getAllDetails.mock.calls.at(-1)?.[0]).not.toContain("birthday");
    expect(one.birthday).toEqual({ year: 1990, month: 4, day: 5 });
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  });
});
