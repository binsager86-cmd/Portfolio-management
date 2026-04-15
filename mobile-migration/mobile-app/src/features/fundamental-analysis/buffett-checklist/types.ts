/**
 * Buffett Checklist — Types and interfaces.
 *
 * Designed to be extensible for future checklist variants
 * (Graham, Lynch, Munger) using the same framework.
 */

// ── Scale system ──────────────────────────────────────────────────

export type ScaleMode = "binary" | "three_point" | "five_point";

export interface ScaleOption {
  label: string;
  value: number; // Normalized 0.0–1.0
}

export interface ScaleConfig {
  key: ScaleMode;
  label: string;
  options: ScaleOption[];
}

// ── Sector classification ─────────────────────────────────────────

export type BuffettSector =
  | "non_financial"
  | "bank"
  | "insurance"
  | "utility"
  | "reit"
  | "other_financial";

export interface SectorOption {
  key: BuffettSector;
  label: string;
}

// ── Qualitative checklist ─────────────────────────────────────────

export type QualitativeSection =
  | "understandability"
  | "moat"
  | "management";

export interface QualitativeItem {
  id: string;
  section: QualitativeSection;
  question: string;
  maxPoints: number;
  tooltip?: string;
}

export interface QualitativeSectionConfig {
  key: QualitativeSection;
  label: string;
  maxPoints: number;
  icon: string;
  color: string;
  tooltip: string;
  items: QualitativeItem[];
}

// ── Quantitative auto-scored metrics ──────────────────────────────

export type QuantitativeSection =
  | "earnings_quality"
  | "returns_on_capital"
  | "balance_sheet"
  | "valuation";

export interface QuantitativeMetric {
  id: string;
  section: QuantitativeSection;
  label: string;
  maxPoints: number;
  tooltip?: string;
  sectorAware?: boolean;
}

export interface QuantitativeSectionConfig {
  key: QuantitativeSection;
  label: string;
  maxPoints: number;
  icon: string;
  color: string;
  tooltip: string;
  metrics: QuantitativeMetric[];
}

// ── Scoring results ───────────────────────────────────────────────

export type Verdict =
  | "Very High Buffett Fit"
  | "Strong Buffett Fit"
  | "Partial Buffett Fit"
  | "Low Buffett Fit"
  | "Very Unlikely Buffett-Style Pick";

export type Confidence = "High" | "Medium" | "Low";

export interface HardCap {
  id: string;
  label: string;
  capValue: number;
  reason: string;
}

export interface ItemBreakdown {
  id: string;
  label: string;
  type: "qualitative" | "quantitative";
  section: string;
  pointsEarned: number;
  maxPoints: number;
  /** For qualitative: normalized answer 0–1; for quantitative: raw metric value */
  rawValue: number | null;
  /** Source data description for auto metrics */
  sourceDescription?: string;
  /** Whether data was missing */
  isMissing?: boolean;
  missingReason?: string;
}

export interface SectionBreakdown {
  key: string;
  label: string;
  pointsEarned: number;
  maxPoints: number;
  percent: number;
}

export interface BuffettChecklistResult {
  finalScore: number;
  rawScore: number;
  verdict: Verdict;
  confidence: Confidence;
  dataCoveragePercent: number;
  activeCaps: HardCap[];
  sectionBreakdown: SectionBreakdown[];
  itemBreakdown: ItemBreakdown[];
  strengths: ItemBreakdown[];
  blockers: ItemBreakdown[];
  assumptions: string[];
  missingData: string[];
}

// ── Persistence model ─────────────────────────────────────────────

export interface BuffettAssessment {
  stockId: number;
  assessmentVersion: number;
  selectedScaleMode: ScaleMode;
  sectorUsed: BuffettSector;
  /** Normalized answers keyed by qualitative item id */
  qualitativeAnswers: Record<string, number>;
  /** Optional user notes keyed by qualitative item id */
  qualitativeNotes: Record<string, string>;
  computedRawScore: number;
  computedFinalScore: number;
  activeCaps: HardCap[];
  dataCoveragePercent: number;
  updatedAt: number; // epoch ms
}

// ── Checklist framework (extensible for Graham, Lynch, etc.) ──────

export interface ChecklistFramework {
  id: string;
  name: string;
  description: string;
  totalPoints: number;
  qualitativePoints: number;
  quantitativePoints: number;
  qualitativeSections: QualitativeSectionConfig[];
  quantitativeSections: QuantitativeSectionConfig[];
  hardCaps: HardCapRule[];
  verdictBands: VerdictBand[];
}

export interface HardCapRule {
  id: string;
  label: string;
  capValue: number;
  /** Evaluator function name or inline check description */
  checkDescription: string;
}

export interface VerdictBand {
  min: number;
  max: number;
  verdict: Verdict;
}
