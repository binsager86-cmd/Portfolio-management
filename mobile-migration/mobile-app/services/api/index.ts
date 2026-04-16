/**
 * Barrel re-export — all domain modules + shared types + default axios instance.
 *
 * Existing imports like `import { getOverview } from "@/services/api"`
 * continue to work unchanged.
 */

export { default } from "./client";
export * from "./types";

export * from "./analytics/index";
export * from "./auth";
export * from "./extraction";
export * from "./portfolio";
export * from "./reconciliation";
export * from "./transactions";

