import { hashPassword, isPasswordAllowed, verifyPassword } from "./password";

describe("password policy (DEC-136)", () => {
  it.each(["Abcdef1!", "a1-long-enough", "Pass word 2!"])(
    "accepts %s",
    (password) => {
      expect(isPasswordAllowed(password)).toBe(true);
    },
  );

  it.each([
    ["Abc1!", "shorter than 8 characters"],
    ["abcdefgh!", "no digit"],
    ["abcdefg12", "no special character"],
    ["abcdefg 12", "only a space as a separator"],
    ["a".repeat(129) + "1!", "longer than 128 characters"],
  ])("refuses %s (%s)", (password) => {
    expect(isPasswordAllowed(password)).toBe(false);
  });

  it("hashes with argon2id and verifies the right password only", async () => {
    const stored = await hashPassword("Abcdef1!");

    expect(stored.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(stored, "Abcdef1!")).toBe(true);
    expect(await verifyPassword(stored, "Abcdef1?")).toBe(false);
  });

  it("refuses a malformed stored hash without throwing", async () => {
    expect(await verifyPassword("not-a-hash", "Abcdef1!")).toBe(false);
  });
});
