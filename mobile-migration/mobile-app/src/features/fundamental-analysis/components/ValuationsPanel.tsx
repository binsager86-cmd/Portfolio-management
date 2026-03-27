/**
 * ValuationsPanel — Run Graham / DCF / DDM / Multiples valuations
 * with detailed result cards (formula breakdowns, projections,
 * margin-of-safety signals) and valuation history.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { usePeerMultiples, useValuations } from "@/hooks/queries";
import { exportCSV, exportExcel, exportPDF, TableData } from "@/lib/exportAnalysis";
import { deleteValuation, type PeerMultiple, type ValuationRunResult } from "@/services/api";
import { useValuationCalculations } from "../hooks/useValuationCalculations";
import { st } from "../styles";
import { MODEL_INFO, type PanelWithSymbolProps } from "../types";
import { ActionButton, Card, Chip, ExportBar, FadeIn, LabeledInput, SectionHeader } from "./shared";

/* ── Helpers ──────────────────────────────────────────────────── */

const fmt = (v: unknown, dp = 2) =>
  typeof v === "number" ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp }) : "—";

const MULT_OPTIONS = ["P/E", "P/B", "P/S", "P/CF", "EV/EBITDA"] as const;

const MULT_COLS: { key: string; label: string }[] = [
  { key: "pe", label: "P/E" },
  { key: "pb", label: "P/B" },
  { key: "ps", label: "P/S" },
  { key: "pcf", label: "P/CF" },
  { key: "ev_ebitda", label: "EV/EBITDA" },
];

/* Parameter display helpers for history cards */
const _PCT: Record<string, Set<string>> = {
  dcf: new Set(["growth_stage1", "growth_stage2", "discount_rate", "terminal_growth"]),
  ddm: new Set(["growth_rate", "required_return"]),
};
const _BIG = new Set(["fcf", "shares_outstanding", "cash", "debt"]);
const _INT = new Set(["stage1_years", "stage2_years"]);
const _LABELS: Record<string, string> = {
  growth_stage1: "Stage 1 Growth", growth_stage2: "Stage 2 Growth",
  discount_rate: "Discount Rate", terminal_growth: "Perpetual Growth",
  stage1_years: "Stage 1 Years", stage2_years: "Stage 2 Years",
  shares_outstanding: "Shares", growth_rate: "Growth Rate",
  required_return: "Required Return", last_dividend: "Last Dividend",
  corporate_yield: "Corp Bond Yield", margin_of_safety: "Margin of Safety",
  current_price: "Current Price", metric_value: "Metric Value",
  peer_multiple: "Peer Multiple", multiple_type: "Multiple Type",
};
const fmtParam = (model: string, key: string, val: unknown): string => {
  if (typeof val !== "number") return String(val);
  if (_PCT[model]?.has(key)) return (val * 100).toFixed(2) + "%";
  if (_BIG.has(key)) return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (_INT.has(key)) return String(Math.round(val));
  return fmt(val);
};
const paramLabel = (key: string) => _LABELS[key] ?? key.replace(/_/g, " ");

/* ── Mini row for key-value pairs ─────────────────────────────── */

function KVRow({ label, value, colors, bold }: { label: string; value: string; colors: ThemePalette; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: bold ? "700" : "500", fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}

/* ── Result Cards per model ───────────────────────────────────── */

/* ── Editable MoS strip (shared by all result cards) ──────── */

function MoSStrip({ iv, mos, onChangeMos, colors, accentColor }: {
  iv: number | null; mos: string; onChangeMos: (v: string) => void;
  colors: ThemePalette; accentColor: string;
}) {
  if (iv == null) return null;
  const mosPct = parseFloat(mos) || 0;
  const buyPrice = iv * (1 - mosPct / 100);
  return (
    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderColor }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <FontAwesome name="shield" size={12} color={accentColor} />
        <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700", flex: 1 }}>Margin of Safety</Text>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.borderColor, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
          <TextInput
            value={mos}
            onChangeText={onChangeMos}
            keyboardType="numeric"
            style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", width: 40, textAlign: "right", padding: 0, fontVariant: ["tabular-nums"] }}
          />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 2 }}>%</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Acceptable Buy Price</Text>
        <Text style={{ color: accentColor, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          {fmt(buyPrice)}
        </Text>
      </View>
    </View>
  );
}

function GrahamResultCard({ r, colors, mos, onChangeMos }: { r: ValuationRunResult; colors: ThemePalette; mos: string; onChangeMos: (v: string) => void }) {
  const verdict = r.verdict as string | undefined;
  const verdictColor = verdict?.includes("Undervalued") ? colors.success
    : verdict?.includes("Fair") ? colors.warning
    : verdict?.includes("Overvalued") ? colors.danger
    : colors.textMuted;
  const ivOriginal = r.iv_original as number | undefined;
  const ivRevised = r.iv_revised as number | undefined;
  const peOriginal = r.implied_pe_original as number | undefined;
  const peRevised = r.implied_pe_revised as number | undefined;
  return (
    <Card colors={colors} style={{ marginTop: 12, borderLeftWidth: 3, borderLeftColor: colors.success }}>
      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 8 }}>
        Graham Growth Formula Result
      </Text>

      {/* Parameters used */}
      <KVRow label="EPS (TTM)" value={fmt(r.parameters?.eps)} colors={colors} />
      <KVRow label="Growth Rate (g)" value={`${fmt(r.parameters?.growth_rate, 1)}%`} colors={colors} />
      <KVRow label="AAA Yield (Y)" value={`${fmt(r.parameters?.aaa_yield, 2)}%`} colors={colors} />

      <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 8 }} />

      {/* Original formula */}
      {peOriginal != null && (
        <KVRow label="P/E Original (8.5 + 2g)" value={fmt(peOriginal, 1)} colors={colors} />
      )}
      {ivOriginal != null && (
        <KVRow label="IV Original" value={fmt(ivOriginal, 4)} colors={colors} bold />
      )}

      {/* Revised formula */}
      {peRevised != null && (
        <KVRow label="P/E Revised (7 + 1g)" value={fmt(peRevised, 1)} colors={colors} />
      )}
      {ivRevised != null && (
        <KVRow label="IV Revised" value={fmt(ivRevised, 4)} colors={colors} bold />
      )}

      <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 8 }} />

      {/* Intrinsic value = revised */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600" }}>Intrinsic Value (Revised)</Text>
        <Text style={{ color: colors.success, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
          {fmt(r.intrinsic_value)}
        </Text>
      </View>

      <MoSStrip iv={r.intrinsic_value} mos={mos} onChangeMos={onChangeMos} colors={colors} accentColor={colors.success} />

      {/* Current price & verdict */}
      {r.current_price != null && (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderColor }}>
          <KVRow label="Current Price" value={fmt(r.current_price)} colors={colors} bold />
          {verdict && (
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 8 }}>
              <FontAwesome
                name={verdict.includes("Undervalued") ? "arrow-circle-down" : verdict.includes("Fair") ? "minus-circle" : "arrow-circle-up"}
                size={16} color={verdictColor} />
              <Text style={{ color: verdictColor, fontSize: 14, fontWeight: "800" }}>{verdict}</Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

function DCFResultCard({ r, colors, mos, onChangeMos, currentPrice }: { r: ValuationRunResult; colors: ThemePalette; mos: string; onChangeMos: (v: string) => void; currentPrice?: number }) {
  const projections = (r.projections ?? []) as Array<{ year: number; stage: number; fcf: number; pv: number }>;
  const tvPct = r.tv_pct_of_ev as number | undefined;
  const baseYear = new Date().getFullYear();
  const COL_W = 100;
  const LABEL_W = 120;
  const fmtN = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const iv = typeof r.intrinsic_value === "number" ? r.intrinsic_value : null;
  const diff = iv != null && currentPrice && currentPrice > 0 ? ((iv - currentPrice) / currentPrice) * 100 : null;
  return (
    <Card colors={colors} style={{ marginTop: 12, borderLeftWidth: 3, borderLeftColor: "#6366f1" }}>
      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 8 }}>
        DCF Result
      </Text>

      {/* ── Horizontal projections table ──────────── */}
      {projections.length > 0 && (
        <View style={{ marginBottom: 12, borderWidth: 1, borderColor: colors.borderColor, borderRadius: 8, overflow: "hidden" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              {/* Header row */}
              <View style={{ flexDirection: "row", backgroundColor: colors.accentPrimary + "12" }}>
                <Text style={{ width: LABEL_W, paddingHorizontal: 8, paddingVertical: 6, color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>Year</Text>
                {projections.map((p) => (
                  <Text key={p.year} style={{ width: COL_W, paddingVertical: 6, color: p.stage === 1 ? colors.accentPrimary : colors.accentSecondary, fontSize: 10, fontWeight: "700", textAlign: "right", paddingHorizontal: 6 }}>
                    {baseYear + p.year - 1}
                  </Text>
                ))}
                <Text style={{ width: COL_W + 10, paddingVertical: 6, color: colors.textMuted, fontSize: 10, fontWeight: "700", textAlign: "right", paddingHorizontal: 6 }}>Terminal Value</Text>
              </View>
              {/* Future FCF row */}
              <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.borderColor }}>
                <Text style={{ width: LABEL_W, paddingHorizontal: 8, paddingVertical: 5, color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>Future FCF</Text>
                {projections.map((p) => (
                  <Text key={p.year} style={{ width: COL_W, paddingVertical: 5, color: colors.textPrimary, fontSize: 10, textAlign: "right", fontVariant: ["tabular-nums"], paddingHorizontal: 6 }}>
                    {fmtN(p.fcf)}
                  </Text>
                ))}
                <Text style={{ width: COL_W + 10, paddingVertical: 5, color: colors.textPrimary, fontSize: 10, textAlign: "right", fontVariant: ["tabular-nums"], fontWeight: "600", paddingHorizontal: 6 }}>
                  {typeof r.terminal_value === "number" ? fmtN(r.terminal_value) : "—"}
                </Text>
              </View>
              {/* PV of FCF row */}
              <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.borderColor }}>
                <Text style={{ width: LABEL_W, paddingHorizontal: 8, paddingVertical: 5, color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>PV of FCF</Text>
                {projections.map((p) => (
                  <Text key={p.year} style={{ width: COL_W, paddingVertical: 5, color: colors.textSecondary, fontSize: 10, textAlign: "right", fontVariant: ["tabular-nums"], paddingHorizontal: 6 }}>
                    {fmtN(p.pv)}
                  </Text>
                ))}
                <Text style={{ width: COL_W + 10, paddingVertical: 5, color: colors.textSecondary, fontSize: 10, textAlign: "right", fontVariant: ["tabular-nums"], fontWeight: "600", paddingHorizontal: 6 }}>
                  {typeof r.pv_terminal === "number" ? fmtN(r.pv_terminal) : "—"}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Summary section ──────────────────────────── */}
      <View style={{ backgroundColor: colors.cardBg, borderRadius: 8, borderWidth: 1, borderColor: colors.borderColor, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }}>
        <KVRow label="Sum of FCF" value={fmt(r.pv_fcfs)} colors={colors} />
        <KVRow label="Cash & Cash Equivalents" value={fmt(r.cash)} colors={colors} />
        <KVRow label="Total Debt" value={fmt(r.debt)} colors={colors} />
        <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 6 }} />
        <KVRow label="Equity Value" value={fmt(r.equity_value)} colors={colors} bold />
        <KVRow label="Shares Outstanding" value={typeof r.parameters?.shares_outstanding === "number" ? fmtN(r.parameters.shares_outstanding) : "—"} colors={colors} />
      </View>

      {/* ── Assumptions ─────────────────────────────── */}
      {r.parameters && (
        <View style={{ backgroundColor: colors.cardBg, borderRadius: 8, borderWidth: 1, borderColor: colors.borderColor, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>Assumptions</Text>
          <KVRow label="Base FCF" value={typeof r.parameters.fcf === "number" ? fmtN(r.parameters.fcf) : "—"} colors={colors} />
          <KVRow label="Stage 1 Growth" value={typeof r.parameters.growth_stage1 === "number" ? (r.parameters.growth_stage1 * 100).toFixed(2) + "%" : "—"} colors={colors} />
          <KVRow label="Stage 2 Growth" value={typeof r.parameters.growth_stage2 === "number" ? (r.parameters.growth_stage2 * 100).toFixed(2) + "%" : "—"} colors={colors} />
          <KVRow label="Discount Rate" value={typeof r.parameters.discount_rate === "number" ? (r.parameters.discount_rate * 100).toFixed(2) + "%" : "—"} colors={colors} />
          <KVRow label="Perpetual Growth" value={typeof r.parameters.terminal_growth === "number" ? (r.parameters.terminal_growth * 100).toFixed(2) + "%" : "—"} colors={colors} />
          <KVRow label="Stage 1 Years" value={typeof r.parameters.stage1_years === "number" ? String(r.parameters.stage1_years) : "5"} colors={colors} />
          <KVRow label="Stage 2 Years" value={typeof r.parameters.stage2_years === "number" ? String(r.parameters.stage2_years) : "5"} colors={colors} />
        </View>
      )}

      {/* ── DCF Price per Share ───────────────────────── */}
      <View style={{ backgroundColor: "#6366f1" + "18", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}>DCF Price per Share</Text>
          <Text style={{ color: "#6366f1", fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
            {fmt(r.intrinsic_value)}
          </Text>
        </View>
      </View>

      {/* ── Current Price & Difference ────────────────── */}
      {currentPrice != null && currentPrice > 0 && (
        <View style={{ backgroundColor: colors.cardBg, borderRadius: 8, borderWidth: 1, borderColor: colors.borderColor, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }}>
          <KVRow label="Current Price" value={fmt(currentPrice)} colors={colors} />
          {diff != null && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Difference</Text>
              <Text style={{ color: diff >= 0 ? colors.success : colors.danger, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                {diff >= 0 ? "+" : ""}{diff.toFixed(2)}%
              </Text>
            </View>
          )}
        </View>
      )}

      {/* TV % of EV warning */}
      {tvPct != null && (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, marginBottom: 4 }}>
          <FontAwesome
            name={tvPct > 75 ? "exclamation-triangle" : "info-circle"}
            size={12}
            color={tvPct > 75 ? colors.warning : colors.textMuted}
          />
          <Text style={{ color: tvPct > 75 ? colors.warning : colors.textMuted, fontSize: 11, marginLeft: 6 }}>
            Terminal Value = {tvPct.toFixed(1)}% of EV
            {tvPct > 75 ? "  ⚠ CFA guidance: >75% warrants caution" : ""}
          </Text>
        </View>
      )}

      <MoSStrip iv={r.intrinsic_value} mos={mos} onChangeMos={onChangeMos} colors={colors} accentColor={"#6366f1"} />
    </Card>
  );
}

function DDMResultCard({ r, colors, mos, onChangeMos }: { r: ValuationRunResult; colors: ThemePalette; mos: string; onChangeMos: (v: string) => void }) {
  const projections = (r.projections ?? []) as Array<{ year: number; dividend: number; pv: number }>;
  const spread = r.spread as number | undefined;
  return (
    <Card colors={colors} style={{ marginTop: 12, borderLeftWidth: 3, borderLeftColor: "#10b981" }}>
      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 8 }}>
        DDM Result
      </Text>

      <KVRow label="D₁ (next dividend)" value={fmt(r.d1, 4)} colors={colors} />
      {spread != null && <KVRow label="Spread (r − g)" value={(spread * 100).toFixed(2) + "%"} colors={colors} />}

      {/* Two-stage projections */}
      {projections.length > 0 && (
        <View style={{ marginTop: 8, marginBottom: 6 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>
            High-Growth Stage Dividends
          </Text>
          <View style={{ flexDirection: "row", paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: colors.borderColor }}>
            <Text style={{ flex: 1, color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>Year</Text>
            <Text style={{ flex: 2, color: colors.textMuted, fontSize: 10, fontWeight: "700", textAlign: "right" }}>Dividend</Text>
            <Text style={{ flex: 2, color: colors.textMuted, fontSize: 10, fontWeight: "700", textAlign: "right" }}>PV</Text>
          </View>
          {projections.map((p) => (
            <View key={p.year} style={{ flexDirection: "row", paddingVertical: 2 }}>
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 11, fontVariant: ["tabular-nums"] }}>{p.year}</Text>
              <Text style={{ flex: 2, color: colors.textPrimary, fontSize: 11, textAlign: "right", fontVariant: ["tabular-nums"] }}>{fmt(p.dividend, 4)}</Text>
              <Text style={{ flex: 2, color: colors.textPrimary, fontSize: 11, textAlign: "right", fontVariant: ["tabular-nums"] }}>{fmt(p.pv, 4)}</Text>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 6 }} />
          {r.pv_dividends != null && <KVRow label="Σ PV of Dividends" value={fmt(r.pv_dividends)} colors={colors} />}
          {r.pv_terminal != null && <KVRow label="PV of Terminal Value" value={fmt(r.pv_terminal)} colors={colors} />}
        </View>
      )}

      {/* Formula description */}
      {r.assumptions?.formula && (
        <Text style={{ color: colors.textMuted, fontSize: 11, fontStyle: "italic", marginBottom: 4 }}>
          Formula: {String(r.assumptions.formula)}
        </Text>
      )}

      <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 6 }} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600" }}>Intrinsic Value</Text>
        <Text style={{ color: "#10b981", fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
          {fmt(r.intrinsic_value)}
        </Text>
      </View>

      <MoSStrip iv={r.intrinsic_value} mos={mos} onChangeMos={onChangeMos} colors={colors} accentColor={"#10b981"} />
    </Card>
  );
}

function MultiplesResultCard({ r, colors, mos, onChangeMos }: { r: ValuationRunResult; colors: ThemePalette; mos: string; onChangeMos: (v: string) => void }) {
  const mt = r.parameters?.multiple_type ?? "P/E";
  return (
    <Card colors={colors} style={{ marginTop: 12, borderLeftWidth: 3, borderLeftColor: "#f59e0b" }}>
      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 8 }}>
        Comparable Multiples Result ({String(mt)})
      </Text>

      <KVRow label="Metric Value" value={fmt(r.parameters?.metric_value)} colors={colors} />
      <KVRow label="Peer Multiple" value={fmt(r.parameters?.peer_multiple)} colors={colors} />
      <KVRow label="Implied Total" value={fmt(r.implied_total)} colors={colors} bold />
      <KVRow label="Shares Outstanding" value={fmt(r.parameters?.shares_outstanding, 0)} colors={colors} />

      <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 8 }} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600" }}>Intrinsic Value / Share</Text>
        <Text style={{ color: "#f59e0b", fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
          {fmt(r.intrinsic_value)}
        </Text>
      </View>

      <MoSStrip iv={r.intrinsic_value} mos={mos} onChangeMos={onChangeMos} colors={colors} accentColor={"#f59e0b"} />
    </Card>
  );
}

function ResultCard({ r, colors, mos, onChangeMos, currentPrice }: { r: ValuationRunResult; colors: ThemePalette; mos: string; onChangeMos: (v: string) => void; currentPrice?: number }) {
  if (r.error) {
    return (
      <Card colors={colors} style={{ marginTop: 12, borderLeftWidth: 3, borderLeftColor: colors.danger }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <FontAwesome name="exclamation-circle" size={14} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "600" }}>{String(r.error)}</Text>
        </View>
      </Card>
    );
  }
  switch (r.model_type) {
    case "graham": return <GrahamResultCard r={r} colors={colors} mos={mos} onChangeMos={onChangeMos} />;
    case "dcf": return <DCFResultCard r={r} colors={colors} mos={mos} onChangeMos={onChangeMos} currentPrice={currentPrice} />;
    case "ddm": return <DDMResultCard r={r} colors={colors} mos={mos} onChangeMos={onChangeMos} />;
    case "multiples": return <MultiplesResultCard r={r} colors={colors} mos={mos} onChangeMos={onChangeMos} />;
    default: return null;
  }
}

/* ── Main Panel ───────────────────────────────────────────────── */

export function ValuationsPanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  const {
    model, setModel,
    eps, setEps, currentPrice, setCurrentPrice,
    grahamGrowth, setGrahamGrowth, corpYield, setCorpYield, marginOfSafety, setMarginOfSafety,
    mosGraham, setMosGraham, mosDcf, setMosDcf, mosDdm, setMosDdm, mosMult, setMosMult,
    fcf, setFcf,
    g1, setG1, g2, setG2, dr, setDr, tg, setTg,
    s1, setS1, s2, setS2,
    shares, setShares, cash, setCash, debt, setDebt,
    div, setDiv, divGr, setDivGr, rr, setRr,
    mv, setMv, pm, setPm, multipleType, setMultipleType,
    grahamMut, dcfMut, ddmMut, multMut,
    valError, lastResult,
    defaults, defaultsLoading,
  } = useValuationCalculations(stockId);

  const { data, isLoading, refetch, isFetching } = useValuations(stockId);
  const valuations = data?.valuations ?? [];

  // Peer multiples (fetched on demand)
  const [fetchPeers, setFetchPeers] = useState(false);
  const { data: peerData, isLoading: peerLoading } = usePeerMultiples(stockId, fetchPeers);

  // Summary-level Margin of Safety
  const [summaryMos, setSummaryMos] = useState("15");

  const info = MODEL_INFO[model];

  // Collect most-recent result per model from history for the combined summary
  const latestByModel = useMemo(() => {
    const map: Record<string, { iv: number; date: string }> = {};
    for (const v of valuations) {
      if (v.intrinsic_value != null && !map[v.model_type]) {
        map[v.model_type] = { iv: v.intrinsic_value, date: v.valuation_date };
      }
    }
    return map;
  }, [valuations]);

  const summaryModels = Object.keys(latestByModel);
  const avgIV = summaryModels.length > 0
    ? summaryModels.reduce((s, k) => s + latestByModel[k].iv, 0) / summaryModels.length
    : null;

  // Filter history by currently selected model tab
  const filteredValuations = useMemo(
    () => valuations.filter((v) => v.model_type === model),
    [valuations, model],
  );

  const exportTables = useCallback((): TableData[] => {
    if (filteredValuations.length === 0) return [];
    return [{
      title: `${model.toUpperCase()} Valuation History`,
      headers: ["Date", "Intrinsic Value", "Parameters"],
      rows: filteredValuations.map((v) => [
        v.valuation_date,
        v.intrinsic_value != null ? v.intrinsic_value.toFixed(2) : "N/A",
        v.parameters ? Object.entries(v.parameters).map(([k, val]) => `${paramLabel(k)}: ${fmtParam(v.model_type, k, val)}`).join("; ") : "",
      ]),
    }];
  }, [filteredValuations, model]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 960, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      {/* ── Combined Summary ──────────────────────────────── */}
      {summaryModels.length >= 2 && (() => {
        const mosPct = parseFloat(summaryMos) || 0;
        const avgBuyBelow = avgIV != null ? avgIV * (1 - mosPct / 100) : null;
        return (
          <FadeIn>
            <SectionHeader title="Valuation Summary" icon="bar-chart" iconColor={colors.accentPrimary} colors={colors} />
            <Card colors={colors} style={{ marginBottom: 14 }}>
              {/* Per-model rows: IV + Buy Below */}
              <View style={{ flexDirection: "row", paddingBottom: 4, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.borderColor }}>
                <Text style={{ flex: 1, color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>MODEL</Text>
                <Text style={{ width: 100, color: colors.textMuted, fontSize: 10, fontWeight: "700", textAlign: "right" }}>INTRINSIC VALUE</Text>
                <Text style={{ width: 100, color: colors.textMuted, fontSize: 10, fontWeight: "700", textAlign: "right" }}>BUY BELOW</Text>
              </View>
              {summaryModels.map((m) => {
                const mInfo = MODEL_INFO[m];
                const iv = latestByModel[m].iv;
                const buyBelow = iv * (1 - mosPct / 100);
                return (
                  <View key={m} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <FontAwesome name={mInfo?.icon ?? "calculator"} size={11} color={colors.textMuted} />
                      <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600", textTransform: "uppercase" }}>{m}</Text>
                    </View>
                    <Text style={{ width: 100, color: colors.textPrimary, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "right" }}>
                      {fmt(iv)}
                    </Text>
                    <Text style={{ width: 100, color: colors.success, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "right" }}>
                      {fmt(buyBelow)}
                    </Text>
                  </View>
                );
              })}
              <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 8 }} />
              {/* Average row */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 13, fontWeight: "800" }}>Average</Text>
                <Text style={{ width: 100, color: colors.accentPrimary, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"], textAlign: "right" }}>
                  {fmt(avgIV)}
                </Text>
                <Text style={{ width: 100, color: colors.success, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"], textAlign: "right" }}>
                  {fmt(avgBuyBelow)}
                </Text>
              </View>

              {/* ── Margin of Safety control ──────────────── */}
              <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderColor }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <FontAwesome name="shield" size={12} color={colors.accentPrimary} />
                  <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700", flex: 1 }}>Margin of Safety</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.borderColor, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <TextInput
                      value={summaryMos}
                      onChangeText={setSummaryMos}
                      keyboardType="numeric"
                      style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", width: 40, textAlign: "right", padding: 0, fontVariant: ["tabular-nums"] }}
                    />
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 2 }}>%</Text>
                  </View>
                </View>
              </View>
            </Card>
          </FadeIn>
        );
      })()}

      <FadeIn>
        <SectionHeader title="Run Valuation" icon="calculator" iconColor={colors.accentTertiary} colors={colors} />

        {defaultsLoading && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <ActivityIndicator size="small" color={colors.accentPrimary} />
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Loading defaults...</Text>
          </View>
        )}

        {/* Model selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {(["graham", "dcf", "ddm", "multiples"] as const).map((m) => (
            <Chip key={m} label={m === "multiples" ? "MULTIPLES" : m.toUpperCase()} active={model === m} onPress={() => setModel(m)} colors={colors}
              icon={MODEL_INFO[m].icon} />
          ))}
        </ScrollView>

        <Card colors={colors}>
          {/* Model header */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={[st.sectionIcon, { backgroundColor: colors.accentTertiary + "18" }]}>
              <FontAwesome name={info.icon} size={12} color={colors.accentTertiary} />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{info.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{info.formula}</Text>
            </View>
          </View>

          {/* ── GRAHAM ──────────────────────────────────────── */}
          {model === "graham" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="EPS (TTM)" value={eps} onChangeText={setEps} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Earnings Per Share (Trailing Twelve Months). The company's net income divided by outstanding shares over the last 4 quarters. Auto-filled from your financial statements." />
                <LabeledInput label="GROWTH RATE (g) %" value={grahamGrowth} onChangeText={setGrahamGrowth} colors={colors} keyboardType="numeric" flex={1} placeholder="Avg YoY"
                  helperText="Expected annual EPS growth rate (%). Auto-filled as the average year-over-year historical EPS growth. Graham caps this between 0–15% for conservatism. Higher g = higher intrinsic value." />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="AAA BOND YIELD (Y) %" value={corpYield} onChangeText={setCorpYield} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Current yield on AAA-rated corporate bonds (%). Graham used 4.4% as the baseline in his era. Auto-filled from 10-Year US Treasury yield (^TNX). Higher Y = lower intrinsic value (stricter discount)." />
                <LabeledInput label="CURRENT PRICE" value={currentPrice} onChangeText={setCurrentPrice} colors={colors} keyboardType="numeric" flex={1}
                  helperText="The stock's current market price per share. Auto-filled from live market data (Yahoo Finance). Used to determine the verdict: Undervalued, Fair Value, or Overvalued." />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="MARGIN OF SAFETY %" value={marginOfSafety} onChangeText={setMarginOfSafety} colors={colors} keyboardType="numeric" flex={1}
                  helperText="The discount (%) you require below intrinsic value before buying. Graham recommended 25–35%. A 25% MoS on a $100 intrinsic value = buy price of $75. Higher MoS = more conservative." />
              </View>
              {valError && <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>{valError}</Text>}
              <ActionButton label={grahamMut.isPending ? "Calculating..." : "Calculate Graham"} onPress={() => grahamMut.mutate()}
                colors={colors} disabled={!eps || !!valError} loading={grahamMut.isPending} icon="play" />
            </>
          )}

          {/* ── DCF ─────────────────────────────────────────── */}
          {model === "dcf" && (
            <>
              {/* FCF History from financial statements */}
              {defaults?.fcf_history && defaults.fcf_history.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Free Cash Flow History
                  </Text>
                  <View style={{ backgroundColor: colors.cardBg, borderRadius: 8, borderWidth: 1, borderColor: colors.borderColor, overflow: "hidden" }}>
                    {/* Table header */}
                    <View style={{ flexDirection: "row", backgroundColor: colors.accentPrimary + "10", paddingHorizontal: 10, paddingVertical: 6 }}>
                      <Text style={{ flex: 1, color: colors.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>Year</Text>
                      <Text style={{ flex: 1, color: colors.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", textAlign: "right" }}>FCF</Text>
                      <Text style={{ flex: 1, color: colors.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", textAlign: "right" }}>YoY Growth</Text>
                    </View>
                    {defaults.fcf_history.map((item, idx) => {
                      const prev = idx > 0 ? defaults!.fcf_history[idx - 1].fcf : null;
                      const growth = prev && prev !== 0 ? ((item.fcf - prev) / Math.abs(prev)) * 100 : null;
                      return (
                        <View key={item.year} style={{
                          flexDirection: "row", paddingHorizontal: 10, paddingVertical: 5,
                          borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: colors.borderColor,
                        }}>
                          <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 11, fontVariant: ["tabular-nums"] }}>{item.year}</Text>
                          <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"], textAlign: "right" }}>
                            {item.fcf.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </Text>
                          <Text style={{
                            flex: 1, fontSize: 11, fontWeight: "600", fontVariant: ["tabular-nums"], textAlign: "right",
                            color: growth == null ? colors.textMuted : growth >= 0 ? colors.success : colors.danger,
                          }}>
                            {growth != null ? `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%` : "—"}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                  {/* Average FCF growth */}
                  {defaults.avg_fcf_growth != null && (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 6 }}>
                      <FontAwesome name="line-chart" size={10} color={colors.accentPrimary} />
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                        Avg FCF Growth:{" "}
                        <Text style={{
                          fontWeight: "700",
                          color: defaults.avg_fcf_growth >= 0 ? colors.success : colors.danger,
                        }}>
                          {defaults.avg_fcf_growth >= 0 ? "+" : ""}{(defaults.avg_fcf_growth * 100).toFixed(1)}%
                        </Text>
                      </Text>
                    </View>
                  )}
                </View>
              )}
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <LabeledInput label="FREE CASH FLOW" value={fcf} onChangeText={setFcf} colors={colors} keyboardType="numeric" flex={1}
                  helperText="The company's most recent annual Free Cash Flow (Operating Cash Flow minus Capital Expenditures). Represents the cash available to all investors after reinvestment. Auto-filled from your uploaded financial statements." />
                <LabeledInput label="STAGE 1 GROWTH %" value={g1} onChangeText={setG1} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Near-term annual FCF growth rate (%) for the first 5 years. Enter 10 for 10%. Reflects the company's current growth momentum. Auto-filled from historical revenue growth. Higher = more optimistic projection." />
                <LabeledInput label="STAGE 2 GROWTH %" value={g2} onChangeText={setG2} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Transition-period annual FCF growth rate (%) for years 6–10. Enter 5 for 5%. Growth decelerates as the company matures and competition increases. Typically lower than Stage 1." />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="DISCOUNT RATE %" value={dr} onChangeText={setDr} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Your required rate of return (%). Enter 10 for 10%. Used to discount future cash flows to present value. Reflects the risk of the investment — higher discount rate = more conservative valuation. Often based on WACC." />
                <LabeledInput label="PERPETUAL GROWTH %" value={tg} onChangeText={setTg} colors={colors} keyboardType="numeric" flex={1}
                  helperText="The perpetual growth rate (%) assumed forever after Stage 2. Enter 2.5 for 2.5%. Used to calculate terminal value via the Gordon Growth Model. Must be less than Discount Rate. Typically 2–3%. Small changes here have large impact." />
                <LabeledInput label="SHARES" value={shares} onChangeText={setShares} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Total shares outstanding. Used to convert enterprise value to per-share intrinsic value. Auto-filled from your financial statements." />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="STAGE 1 YEARS" value={s1} onChangeText={setS1} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Number of years for the high-growth Stage 1 period. Default is 5. The company grows FCF at the Stage 1 Growth rate for this many years." />
                <LabeledInput label="STAGE 2 YEARS" value={s2} onChangeText={setS2} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Number of years for the transition Stage 2 period. Default is 5. After Stage 1, the company grows FCF at the Stage 2 Growth rate for this many years before reaching terminal/perpetual growth." />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="CASH" value={cash} onChangeText={setCash} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Cash and cash equivalents from the latest balance sheet. Added to enterprise value in the equity bridge: Equity = Enterprise Value + Cash − Debt. Auto-filled from uploaded statements (cash balances / cash equivalents)." />
                <LabeledInput label="TOTAL DEBT" value={debt} onChangeText={setDebt} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Total debt from the latest balance sheet (loans, borrowings, bank facilities, overdrafts, Islamic payables). Subtracted from enterprise value: Equity = Enterprise Value + Cash − Debt. Auto-filled from uploaded statements." />
              </View>
              {valError && <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>{valError}</Text>}
              <ActionButton label={dcfMut.isPending ? "Calculating..." : "Calculate DCF"} onPress={() => dcfMut.mutate()}
                colors={colors} disabled={!fcf || !!valError} loading={dcfMut.isPending} icon="play" />
            </>
          )}

          {/* ── DDM ─────────────────────────────────────────── */}
          {model === "ddm" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="LAST DIVIDEND" value={div} onChangeText={setDiv} colors={colors} keyboardType="numeric" flex={1}
                  helperText="The most recent annual dividend per share (DPS) paid by the company. This is the starting point for projecting future dividends. Use the trailing twelve-month (TTM) dividend or the last declared annual dividend. Auto-filled from your uploaded financial statements if available." />
                <LabeledInput label="GROWTH RATE (g) %" value={divGr} onChangeText={setDivGr} colors={colors} keyboardType="numeric" flex={1}
                  helperText="The expected stable long-term dividend growth rate (%). Enter 5 for 5%. This rate is assumed to persist indefinitely in the Gordon Growth Model (single-stage DDM). Should reflect the company's sustainable earnings growth — typically in line with nominal GDP growth (4–6%) for mature companies. Must be less than the Required Return for the model to converge." />
                <LabeledInput label="REQUIRED RETURN (r) %" value={rr} onChangeText={setRr} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Your minimum acceptable rate of return (cost of equity) in %. Enter 10 for 10%. Often estimated using CAPM: r = Risk-Free Rate + β × Equity Risk Premium. For most equities, 8–12% is common. Must exceed the Growth Rate — the spread (r − g) drives the valuation. A smaller spread means a higher intrinsic value and vice versa." />
              </View>
              {valError && <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>{valError}</Text>}
              <ActionButton label={ddmMut.isPending ? "Calculating..." : "Calculate DDM"} onPress={() => ddmMut.mutate()}
                colors={colors} disabled={!div || !!valError} loading={ddmMut.isPending} icon="play" />
            </>
          )}

          {/* ── MULTIPLES ───────────────────────────────────── */}
          {model === "multiples" && (
            <>
              {/* ── Peer Multiples Table ─────────────────────── */}
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Peer Comparable Multiples
                  </Text>
                  {!peerData && !peerLoading && (
                    <Pressable
                      onPress={() => setFetchPeers(true)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accentPrimary + "18", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
                    >
                      <FontAwesome name="download" size={10} color={colors.accentPrimary} />
                      <Text style={{ color: colors.accentPrimary, fontSize: 11, fontWeight: "600" }}>Fetch Multiples</Text>
                    </Pressable>
                  )}
                  {peerLoading && <ActivityIndicator size="small" color={colors.accentPrimary} />}
                </View>

                {peerData && peerData.peers.length > 0 && (
                  <View style={{ borderWidth: 1, borderColor: colors.borderColor, borderRadius: 8, overflow: "hidden" }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator>
                      <View>
                        {/* Table header */}
                        <View style={{ flexDirection: "row", backgroundColor: colors.accentPrimary + "10" }}>
                          <Text style={{ width: 130, paddingHorizontal: 8, paddingVertical: 6, color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>Company</Text>
                          {MULT_COLS.map((col) => (
                            <Text key={col.key} style={{ width: 80, paddingVertical: 6, color: colors.textMuted, fontSize: 10, fontWeight: "700", textAlign: "right", paddingHorizontal: 6 }}>
                              {col.label}
                            </Text>
                          ))}
                        </View>
                        {/* Data rows */}
                        {peerData.peers.map((peer, idx) => (
                          <View key={peer.stock_id} style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.borderColor, backgroundColor: peer.stock_id === stockId ? colors.accentPrimary + "08" : undefined }}>
                            <View style={{ width: 130, paddingHorizontal: 8, paddingVertical: 5, justifyContent: "center" }}>
                              <Text style={{ color: peer.stock_id === stockId ? colors.accentPrimary : colors.textPrimary, fontSize: 10, fontWeight: "700" }} numberOfLines={1}>
                                {peer.symbol}
                              </Text>
                              <Text style={{ color: colors.textMuted, fontSize: 8 }} numberOfLines={1}>{peer.company_name}</Text>
                            </View>
                            {MULT_COLS.map((col) => {
                              const val = peer[col.key as keyof PeerMultiple] as number | null;
                              return (
                                <Pressable
                                  key={col.key}
                                  onPress={() => {
                                    if (val != null) {
                                      setPm(String(val));
                                      setMultipleType(col.label);
                                    }
                                  }}
                                  style={({ pressed }) => ({
                                    width: 80, paddingVertical: 5, paddingHorizontal: 6, justifyContent: "center",
                                    backgroundColor: pressed && val != null ? colors.accentPrimary + "20" : undefined,
                                  })}
                                >
                                  <Text style={{
                                    color: val != null ? colors.textPrimary : colors.textMuted,
                                    fontSize: 10, fontWeight: "600", textAlign: "right", fontVariant: ["tabular-nums"],
                                  }}>
                                    {val != null ? val.toFixed(2) : "—"}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}
                {peerData && peerData.peers.length === 0 && (
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontStyle: "italic" }}>No analysis stocks found. Add stocks to see comparable multiples.</Text>
                )}
                {peerData && peerData.peers.length > 0 && (
                  <Text style={{ color: colors.textMuted, fontSize: 9, marginTop: 4 }}>
                    Tap any multiple to use it as the Peer Multiple below.
                  </Text>
                )}
              </View>

              {/* Manual inputs */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="METRIC VALUE" value={mv} onChangeText={setMv} colors={colors} keyboardType="numeric" flex={1}
                  helperText="The company's actual financial metric (e.g. EPS for P/E, Book Value per Share for P/B, Revenue per Share for P/S, Cash Flow per Share for P/CF, or EBITDA for EV/EBITDA). This is the subject company's fundamentals you want to value." />
                <LabeledInput label="PEER MULTIPLE" value={pm} onChangeText={setPm} colors={colors} keyboardType="numeric" flex={1}
                  helperText="The comparable multiple from a peer or industry average (e.g. 15x for P/E). Tap a cell in the peer table above to auto-fill this. The implied value = Metric Value × Peer Multiple." />
                <LabeledInput label="SHARES" value={shares} onChangeText={setShares} colors={colors} keyboardType="numeric" flex={1}
                  helperText="Total shares outstanding. Used to convert implied total value to per-share intrinsic value." />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: 10 }}>Multiple Type:</Text>
                <Text style={{ color: colors.accentPrimary, fontSize: 11, fontWeight: "700" }}>{multipleType}</Text>
              </View>
              {valError && <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>{valError}</Text>}
              <ActionButton label={multMut.isPending ? "Calculating..." : "Calculate Multiples"} onPress={() => multMut.mutate()}
                colors={colors} disabled={!mv || !pm || !!valError} loading={multMut.isPending} icon="play" />
            </>
          )}
        </Card>

        {/* ── Live Result Card ───────────────────────────── */}
        {lastResult && lastResult.model_type === model && (
          <ResultCard
            r={lastResult}
            colors={colors}
            mos={model === "graham" ? mosGraham : model === "dcf" ? mosDcf : model === "ddm" ? mosDdm : mosMult}
            onChangeMos={model === "graham" ? setMosGraham : model === "dcf" ? setMosDcf : model === "ddm" ? setMosDdm : setMosMult}
            currentPrice={currentPrice ? parseFloat(currentPrice) || undefined : undefined}
          />
        )}
      </FadeIn>

      {/* ── Valuation history (filtered by selected model) ─── */}
      {filteredValuations.length > 0 && (
        <FadeIn delay={100}>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20 }}>
            <View style={{ flex: 1 }}>
              <SectionHeader title={`${model.toUpperCase()} History`} icon="history" iconColor={colors.accentSecondary} badge={filteredValuations.length} colors={colors} />
            </View>
            <Pressable
              onPress={() => {
                const ids = filteredValuations.map((v) => v.id);
                const doDelete = async () => {
                  try {
                    for (const id of ids) await deleteValuation(stockId, id);
                    refetch();
                  } catch { /* ignore */ }
                };
                const msg = `Delete all ${model.toUpperCase()} valuations (${ids.length})?`;
                if (Platform.OS === "web") {
                  if (window.confirm(msg)) doDelete();
                } else {
                  Alert.alert("Delete All", msg, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: doDelete },
                  ]);
                }
              }}
              style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.danger + "18", marginRight: 8 }}
            >
              <FontAwesome name="trash" size={14} color={colors.danger} />
            </Pressable>
            <ExportBar
              onExport={async (fmt) => {
                const t = exportTables();
                if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Valuations");
                else if (fmt === "csv") await exportCSV(t, stockSymbol, "Valuations");
                else await exportPDF(t, stockSymbol, "Valuations");
              }}
              colors={colors}
            />
          </View>

          {filteredValuations.map((v, idx) => (
            <FadeIn key={v.id} delay={idx * 40}>
              <Card colors={colors} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {/* Model icon */}
                  <View style={[st.sectionIcon, { backgroundColor: colors.accentPrimary + "15" }]}>
                    <FontAwesome name={MODEL_INFO[v.model_type]?.icon ?? "calculator"} size={12} color={colors.accentPrimary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{v.model_type}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{v.valuation_date}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 10 }}>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{
                        color: v.intrinsic_value != null ? colors.accentPrimary : colors.textMuted,
                        fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"],
                      }}>
                        {v.intrinsic_value != null ? v.intrinsic_value.toFixed(2) : "N/A"}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Intrinsic Value</Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        const doDelete = async () => {
                          try { await deleteValuation(stockId, v.id); refetch(); } catch { /* ignore */ }
                        };
                        if (Platform.OS === "web") {
                          if (window.confirm("Delete this valuation?")) doDelete();
                        } else {
                          Alert.alert("Delete", "Delete this valuation?", [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: doDelete },
                          ]);
                        }
                      }}
                      style={{ padding: 6, borderRadius: 6, backgroundColor: colors.danger + "18" }}
                    >
                      <FontAwesome name="trash" size={12} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>

                {/* ── Non-DCF: generic parameters list ──── */}
                {v.model_type !== "dcf" && v.parameters && Object.keys(v.parameters).length > 0 && (
                  <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8 }}>
                    {Object.entries(v.parameters).map(([k, val]) => (
                      <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{paramLabel(k)}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
                          {fmtParam(v.model_type, k, val)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* ── DCF history: same UI as DCFResultCard ──── */}
                {v.model_type === "dcf" && (() => {
                  const projections = (v.assumptions?.projections ?? []) as Array<{ year: number; stage: number; fcf: number; pv: number }>;
                  const tvPct = typeof v.assumptions?.tv_pct_of_ev === "number" ? v.assumptions.tv_pct_of_ev as number : null;
                  const baseYear = new Date().getFullYear();
                  const COL_W = 100;
                  const LABEL_W = 120;
                  const fmtN = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
                  const params = v.parameters as Record<string, unknown> | undefined;
                  const a = v.assumptions as Record<string, unknown> | undefined;
                  return (
                    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8 }}>
                      {/* ── Horizontal projections table ──────────── */}
                      {projections.length > 0 && (
                        <View style={{ marginBottom: 12, borderWidth: 1, borderColor: colors.borderColor, borderRadius: 8, overflow: "hidden" }}>
                          <ScrollView horizontal showsHorizontalScrollIndicator>
                            <View>
                              {/* Header row */}
                              <View style={{ flexDirection: "row", backgroundColor: colors.accentPrimary + "12" }}>
                                <Text style={{ width: LABEL_W, paddingHorizontal: 8, paddingVertical: 6, color: colors.textMuted, fontSize: 10, fontWeight: "700" }}>Year</Text>
                                {projections.map((p) => (
                                  <Text key={p.year} style={{ width: COL_W, paddingVertical: 6, color: p.stage === 1 ? colors.accentPrimary : colors.accentSecondary, fontSize: 10, fontWeight: "700", textAlign: "right", paddingHorizontal: 6 }}>
                                    {baseYear + p.year - 1}
                                  </Text>
                                ))}
                                <Text style={{ width: COL_W + 10, paddingVertical: 6, color: colors.textMuted, fontSize: 10, fontWeight: "700", textAlign: "right", paddingHorizontal: 6 }}>Terminal Value</Text>
                              </View>
                              {/* Future FCF row */}
                              <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.borderColor }}>
                                <Text style={{ width: LABEL_W, paddingHorizontal: 8, paddingVertical: 5, color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>Future FCF</Text>
                                {projections.map((p) => (
                                  <Text key={p.year} style={{ width: COL_W, paddingVertical: 5, color: colors.textPrimary, fontSize: 10, textAlign: "right", fontVariant: ["tabular-nums"], paddingHorizontal: 6 }}>
                                    {fmtN(p.fcf)}
                                  </Text>
                                ))}
                                <Text style={{ width: COL_W + 10, paddingVertical: 5, color: colors.textPrimary, fontSize: 10, textAlign: "right", fontVariant: ["tabular-nums"], fontWeight: "600", paddingHorizontal: 6 }}>
                                  {typeof a?.terminal_value === "number" ? fmtN(a.terminal_value as number) : "—"}
                                </Text>
                              </View>
                              {/* PV of FCF row */}
                              <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.borderColor }}>
                                <Text style={{ width: LABEL_W, paddingHorizontal: 8, paddingVertical: 5, color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>PV of FCF</Text>
                                {projections.map((p) => (
                                  <Text key={p.year} style={{ width: COL_W, paddingVertical: 5, color: colors.textSecondary, fontSize: 10, textAlign: "right", fontVariant: ["tabular-nums"], paddingHorizontal: 6 }}>
                                    {fmtN(p.pv)}
                                  </Text>
                                ))}
                                <Text style={{ width: COL_W + 10, paddingVertical: 5, color: colors.textSecondary, fontSize: 10, textAlign: "right", fontVariant: ["tabular-nums"], fontWeight: "600", paddingHorizontal: 6 }}>
                                  {typeof a?.pv_terminal === "number" ? fmtN(a.pv_terminal as number) : "—"}
                                </Text>
                              </View>
                            </View>
                          </ScrollView>
                        </View>
                      )}

                      {/* ── Summary section ──────────────────────── */}
                      <View style={{ backgroundColor: colors.cardBg, borderRadius: 8, borderWidth: 1, borderColor: colors.borderColor, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }}>
                        <KVRow label="Sum of FCF" value={fmt(a?.pv_fcfs)} colors={colors} />
                        <KVRow label="Cash & Cash Equivalents" value={fmt(a?.cash)} colors={colors} />
                        <KVRow label="Total Debt" value={fmt(a?.debt)} colors={colors} />
                        <View style={{ height: 1, backgroundColor: colors.borderColor, marginVertical: 6 }} />
                        <KVRow label="Equity Value" value={fmt(a?.equity_value)} colors={colors} bold />
                        <KVRow label="Shares Outstanding" value={typeof params?.shares_outstanding === "number" ? fmtN(params.shares_outstanding as number) : "—"} colors={colors} />
                      </View>

                      {/* ── Assumptions ──────────────────────────── */}
                      {params && (
                        <View style={{ backgroundColor: colors.cardBg, borderRadius: 8, borderWidth: 1, borderColor: colors.borderColor, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }}>
                          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>Assumptions</Text>
                          <KVRow label="Base FCF" value={typeof params.fcf === "number" ? fmtN(params.fcf as number) : "—"} colors={colors} />
                          <KVRow label="Stage 1 Growth" value={typeof params.growth_stage1 === "number" ? ((params.growth_stage1 as number) * 100).toFixed(2) + "%" : "—"} colors={colors} />
                          <KVRow label="Stage 2 Growth" value={typeof params.growth_stage2 === "number" ? ((params.growth_stage2 as number) * 100).toFixed(2) + "%" : "—"} colors={colors} />
                          <KVRow label="Discount Rate" value={typeof params.discount_rate === "number" ? ((params.discount_rate as number) * 100).toFixed(2) + "%" : "—"} colors={colors} />
                          <KVRow label="Perpetual Growth" value={typeof params.terminal_growth === "number" ? ((params.terminal_growth as number) * 100).toFixed(2) + "%" : "—"} colors={colors} />
                          <KVRow label="Stage 1 Years" value={typeof params.stage1_years === "number" ? String(params.stage1_years) : "5"} colors={colors} />
                          <KVRow label="Stage 2 Years" value={typeof params.stage2_years === "number" ? String(params.stage2_years) : "5"} colors={colors} />
                        </View>
                      )}

                      {/* ── DCF Price per Share ──────────────────── */}
                      <View style={{ backgroundColor: "#6366f1" + "18", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}>DCF Price per Share</Text>
                          <Text style={{ color: "#6366f1", fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
                            {fmt(v.intrinsic_value)}
                          </Text>
                        </View>
                      </View>

                      {/* TV % of EV warning */}
                      {tvPct != null && (
                        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, marginBottom: 4 }}>
                          <FontAwesome
                            name={tvPct > 75 ? "exclamation-triangle" : "info-circle"}
                            size={12}
                            color={tvPct > 75 ? colors.warning : colors.textMuted}
                          />
                          <Text style={{ color: tvPct > 75 ? colors.warning : colors.textMuted, fontSize: 11, marginLeft: 6 }}>
                            Terminal Value = {tvPct.toFixed(1)}% of EV
                            {tvPct > 75 ? "  ⚠ CFA guidance: >75% warrants caution" : ""}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()}
              </Card>
            </FadeIn>
          ))}
        </FadeIn>
      )}
    </ScrollView>
  );
}
