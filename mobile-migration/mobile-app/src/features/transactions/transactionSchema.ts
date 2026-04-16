import type { TransactionCreate } from "@/services/api";
import { z } from "zod";

// ── Constants ───────────────────────────────────────────────────────

export const PORTFOLIOS = ["KFH", "BBYN", "USA"] as const;
export const TXN_TYPES = ["Buy", "Sell", "Dividend Only"] as const;
export type TxnTypeLabel = (typeof TXN_TYPES)[number];
export type Portfolio = (typeof PORTFOLIOS)[number];

/** Map UI label → API value */
export function txnTypeToApi(label: TxnTypeLabel): "Buy" | "Sell" | "DIVIDEND_ONLY" {
  if (label === "Dividend Only") return "DIVIDEND_ONLY";
  return label;
}

// ── Schema ──────────────────────────────────────────────────────────

const MAX_FINANCIAL_VALUE = 1_000_000_000;

export const txnSchema = z
  .object({
    portfolio: z.enum(PORTFOLIOS),
    stock_symbol: z
      .string()
      .min(1, "Symbol is required")
      .max(50)
      .transform((v) => v.toUpperCase().trim()),
    txn_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
      .refine((v) => !isNaN(new Date(v).getTime()), "Invalid date")
      .refine((v) => new Date(v) <= new Date(), "Date cannot be in the future"),
    txn_type: z.enum(TXN_TYPES),
    shares: z.coerce
      .number({ invalid_type_error: "Enter a number" })
      .nonnegative("Shares must be >= 0")
      .max(MAX_FINANCIAL_VALUE, "Shares exceed maximum")
      .optional()
      .or(z.literal("")),
    purchase_cost: z.coerce.number().nonnegative().max(MAX_FINANCIAL_VALUE, "Cost exceeds maximum").optional().or(z.literal("")),
    sell_value: z.coerce.number().nonnegative().max(MAX_FINANCIAL_VALUE, "Value exceeds maximum").optional().or(z.literal("")),
    bonus_shares: z.coerce.number().nonnegative().max(MAX_FINANCIAL_VALUE, "Shares exceed maximum").optional().or(z.literal("")),
    cash_dividend: z.coerce.number().nonnegative().max(MAX_FINANCIAL_VALUE, "Amount exceeds maximum").optional().or(z.literal("")),
    reinvested_dividend: z.coerce.number().nonnegative().max(MAX_FINANCIAL_VALUE, "Amount exceeds maximum").optional().or(z.literal("")),
    fees: z.coerce.number().nonnegative().max(MAX_FINANCIAL_VALUE, "Fees exceed maximum").optional().or(z.literal("")),
    price_override: z.coerce.number().nonnegative().max(MAX_FINANCIAL_VALUE, "Price exceeds maximum").optional().or(z.literal("")),
    planned_cum_shares: z.coerce.number().nonnegative().max(MAX_FINANCIAL_VALUE, "Shares exceed maximum").optional().or(z.literal("")),
    broker: z.string().max(100).optional(),
    reference: z.string().max(100).optional(),
    notes: z.string().max(1000, "Notes cannot exceed 1000 characters").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.txn_type === "Buy") {
      const shares = typeof data.shares === "number" ? data.shares : 0;
      if (shares <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Shares must be > 0 for Buy", path: ["shares"] });
      }
      const cost = typeof data.purchase_cost === "number" ? data.purchase_cost : undefined;
      if (cost == null || cost <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Purchase cost is required for Buy", path: ["purchase_cost"] });
      }
    }
    if (data.txn_type === "Sell") {
      const shares = typeof data.shares === "number" ? data.shares : 0;
      if (shares <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Shares must be > 0 for Sell", path: ["shares"] });
      }
      const val = typeof data.sell_value === "number" ? data.sell_value : undefined;
      if (val == null || val <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sell value is required for Sell", path: ["sell_value"] });
      }
    }
    if (data.txn_type === "Dividend Only") {
      const cd = typeof data.cash_dividend === "number" ? data.cash_dividend : 0;
      const rd = typeof data.reinvested_dividend === "number" ? data.reinvested_dividend : 0;
      const bs = typeof data.bonus_shares === "number" ? data.bonus_shares : 0;
      if (cd <= 0 && rd <= 0 && bs <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one of Cash Dividend, Reinvested Dividend, or Bonus Shares is required",
          path: ["cash_dividend"],
        });
      }
    }
  });

export type TxnFormValues = z.infer<typeof txnSchema>;

// ── Step field groups (for per-step validation) ─────────────────────

export const STEP1_FIELDS: (keyof TxnFormValues)[] = ["portfolio", "txn_type"];

export const STEP2_FIELDS: (keyof TxnFormValues)[] = [
  "stock_symbol", "txn_date", "shares", "purchase_cost", "sell_value",
  "cash_dividend", "reinvested_dividend", "bonus_shares",
  "fees", "price_override", "planned_cum_shares", "broker", "reference", "notes",
];

// ── Helpers ─────────────────────────────────────────────────────────

/** Convert zod form values → API payload (strip empty strings etc.) */
export function toPayload(values: TxnFormValues): TransactionCreate {
  const clean = (v: unknown): number | undefined => {
    if (typeof v === "number" && !isNaN(v)) return v;
    return undefined;
  };
  const isDividendOnly = values.txn_type === "Dividend Only";
  return {
    portfolio: values.portfolio,
    stock_symbol: values.stock_symbol,
    txn_date: values.txn_date,
    txn_type: txnTypeToApi(values.txn_type),
    shares: isDividendOnly ? 0 : (clean(values.shares) ?? 0),
    purchase_cost: isDividendOnly ? null : (clean(values.purchase_cost) ?? null),
    sell_value: isDividendOnly ? null : (clean(values.sell_value) ?? null),
    bonus_shares: clean(values.bonus_shares) ?? null,
    cash_dividend: clean(values.cash_dividend) ?? null,
    reinvested_dividend: clean(values.reinvested_dividend) ?? null,
    fees: isDividendOnly ? null : (clean(values.fees) ?? null),
    price_override: isDividendOnly ? null : (clean(values.price_override) ?? null),
    planned_cum_shares: isDividendOnly ? null : (clean(values.planned_cum_shares) ?? null),
    broker: isDividendOnly ? null : (values.broker || null),
    reference: isDividendOnly ? null : (values.reference || null),
    notes: values.notes || null,
  };
}
