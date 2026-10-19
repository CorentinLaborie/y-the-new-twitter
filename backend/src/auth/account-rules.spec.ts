import { isOldEnough, isReservedHandle, normalisePhone } from "./account-rules";

describe("account rules", () => {
  it("refuses reserved handles whatever the letter case", () => {
    expect(isReservedHandle("Admin")).toBe(true);
    expect(isReservedHandle("y")).toBe(true);
    expect(isReservedHandle("corentin")).toBe(false);
  });

  it("normalises French phone numbers to 0XXXXXXXXX", () => {
    expect(normalisePhone("+33 6 01 02 03 04")).toBe("0601020304");
    expect(normalisePhone("06.01.02.03.04")).toBe("0601020304");
    expect(normalisePhone("0601020304")).toBe("0601020304");
  });

  it("refuses a phone number that is not French", () => {
    expect(normalisePhone("+44 20 7946 0958")).toBeNull();
    expect(normalisePhone("12345")).toBeNull();
  });

  it("accepts a birth date exactly 18 years before today, and refuses one day less", () => {
    const today = new Date(Date.UTC(2026, 9, 19));

    expect(isOldEnough(new Date(Date.UTC(2008, 9, 19)), today)).toBe(true);
    expect(isOldEnough(new Date(Date.UTC(2008, 9, 20)), today)).toBe(false);
  });
});
