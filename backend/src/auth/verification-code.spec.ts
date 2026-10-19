import {
  CODE_MAX_ATTEMPTS,
  generateCode,
  hashCode,
  verifyCode,
} from "./verification-code";

describe("verification codes (DEC-137)", () => {
  it("generates six digits, leading zeros included", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("stores only a hash, and verifies the right code only", async () => {
    const stored = await hashCode("042017");

    expect(stored).not.toContain("042017");
    expect(await verifyCode(stored, "042017")).toBe(true);
    expect(await verifyCode(stored, "042018")).toBe(false);
  });

  it("allows five failed attempts (product doc section 9.4)", () => {
    expect(CODE_MAX_ATTEMPTS).toBe(5);
  });
});
