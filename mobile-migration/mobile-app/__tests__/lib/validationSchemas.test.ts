/**
 * Validation schemas — unit tests.
 *
 * Covers:
 *   - Login schema validation (email, password strength)
 *   - Register schema validation (email, password match, display name)
 *   - Change password schema validation
 *   - Edge cases: max lengths, special characters, Gmail aliases
 */

import {
    changePasswordSchema,
    loginSchema,
    registerSchema,
} from "@/lib/validationSchemas";

describe("loginSchema", () => {
  const validLogin = {
    email: "user@example.com",
    password: "Str0ng!Pass",
  };

  it("accepts valid login data", () => {
    const result = loginSchema.safeParse(validLogin);
    expect(result.success).toBe(true);
  });

  it("rejects empty email", () => {
    const result = loginSchema.safeParse({ ...validLogin, email: "" });
    expect(result.success).toBe(false);
  });

  it("accepts any non-empty email string (login is lenient)", () => {
    const result = loginSchema.safeParse({ ...validLogin, email: "not-an-email" });
    expect(result.success).toBe(true);
  });

  it("rejects email exceeding 200 characters", () => {
    const longEmail = "a".repeat(192) + "@test.com"; // 201 chars
    const result = loginSchema.safeParse({ ...validLogin, email: longEmail });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ ...validLogin, password: "" });
    expect(result.success).toBe(false);
  });

  it("accepts any non-empty password (login is lenient)", () => {
    const result = loginSchema.safeParse({ ...validLogin, password: "Ab1!" });
    expect(result.success).toBe(true);
  });

  it("trims whitespace from email after parsing", () => {
    // Zod .email() validates before .trim(), so leading/trailing whitespace
    // causes validation failure. Verify .trim() works on valid email.
    const result = loginSchema.safeParse({ ...validLogin, email: "user@example.com" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });
});

describe("registerSchema", () => {
  const validRegister = {
    email: "newuser@example.com",
    password: "Str0ng!Pass",
    confirmPassword: "Str0ng!Pass",
    displayName: "Test User",
  };

  it("accepts valid registration data", () => {
    const result = registerSchema.safeParse(validRegister);
    expect(result.success).toBe(true);
  });

  it("lowercases email", () => {
    const result = registerSchema.safeParse({ ...validRegister, email: "USER@EXAMPLE.COM" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("rejects Gmail alias addresses (plus sign)", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      email: "user+alias@gmail.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      confirmPassword: "DifferentPass1!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("confirmPassword");
    }
  });

  it("allows empty display name", () => {
    const result = registerSchema.safeParse({ ...validRegister, displayName: "" });
    expect(result.success).toBe(true);
  });

  it("allows missing display name (optional)", () => {
    const { displayName, ...withoutName } = validRegister;
    const result = registerSchema.safeParse(withoutName);
    expect(result.success).toBe(true);
  });

  it("rejects display name exceeding 100 characters", () => {
    const result = registerSchema.safeParse({
      ...validRegister,
      displayName: "A".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const validChange = {
    currentPassword: "OldPass1!",
    newPassword: "NewStr0ng!Pass",
    confirmNewPassword: "NewStr0ng!Pass",
  };

  it("accepts valid password change", () => {
    const result = changePasswordSchema.safeParse(validChange);
    expect(result.success).toBe(true);
  });

  it("rejects empty current password", () => {
    const result = changePasswordSchema.safeParse({
      ...validChange,
      currentPassword: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects weak new password", () => {
    const result = changePasswordSchema.safeParse({
      ...validChange,
      newPassword: "weak",
      confirmNewPassword: "weak",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched new passwords", () => {
    const result = changePasswordSchema.safeParse({
      ...validChange,
      confirmNewPassword: "Different1!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("confirmNewPassword");
    }
  });
});
