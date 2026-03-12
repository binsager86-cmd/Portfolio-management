/**
 * Zod validation schemas for authentication forms.
 *
 * Used with react-hook-form via @hookform/resolvers/zod.
 * Centralized here so login, register, and password-change
 * share identical constraints.
 */

import { z } from "zod";

// ── Shared strong-password rule ─────────────────────────────────────

const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password cannot exceed 128 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character",
  );

// ── Login Schema ────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .max(200, "Email cannot exceed 200 characters")
    .trim(),
  password: z
    .string()
    .min(1, "Password is required")
    .pipe(strongPassword),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// ── Register Schema ─────────────────────────────────────────────────

export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, "Email is required")
      .email("Please enter a valid email address")
      .max(200, "Email cannot exceed 200 characters")
      .trim()
      .transform((val) => val.toLowerCase())
      .refine((val) => !val.includes("+"), {
        message: "Gmail alias addresses are not supported",
      }),
    displayName: z
      .string()
      .max(100, "Display name cannot exceed 100 characters")
      .trim()
      .optional()
      .or(z.literal("")),
    password: z
      .string()
      .min(1, "Password is required")
      .pipe(strongPassword),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

// ── Change Password Schema ──────────────────────────────────────────

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Current password is required"),
    newPassword: strongPassword,
    confirmNewPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords do not match",
    path: ["confirmNewPassword"],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
