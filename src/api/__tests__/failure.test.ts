/**
 * What a person is told when a request fails (2026-09-24 error sweep).
 */
import { failureMessage, refusalReason } from "../failure";
import { apiErrorMessage } from "../http";

const refused = (status: number, data: unknown) => ({ isAxiosError: true, response: { status, data } });
const unreachable = { isAxiosError: true, request: {}, message: "Network Error" };

describe("Pundit's own sentence", () => {
  // ApplicationController answers a policy refusal with { message: e.to_s },
  // and Pundit's to_s is developer text.
  it("is never shown as the server's reason", () => {
    expect(apiErrorMessage(refused(403, { message: "not allowed to create? this Message" }))).toBeNull();
  });

  it("a bare 403 becomes the plain sentence", () => {
    expect(failureMessage(refused(403, { message: "not allowed to create? this Message" }), "fallback")).toBe(
      "You’re not allowed to do that here.",
    );
  });

  it("but a 403 WITH a real sentence keeps it", () => {
    expect(failureMessage(refused(403, { error: "Access denied" }), "fallback")).toBe("Access denied");
  });
});

describe("refusalReason — the line next to a retry", () => {
  it("is nothing when the server was not reached", () => {
    expect(refusalReason(unreachable)).toBeNull();
  });

  it("is the server's words when it refused", () => {
    expect(refusalReason(refused(422, { errors: ["Body is too long (maximum is 10000 characters)"] }))).toBe(
      "Body is too long (maximum is 10000 characters)",
    );
  });

  it("is the plain sentence for a policy refusal", () => {
    expect(refusalReason(refused(403, { message: "not allowed to create? this Message" }))).toBe(
      "You’re not allowed to do that here.",
    );
  });
});
