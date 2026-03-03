/**
 * Planner — Time Value of Money calculator (CFA-level).
 *
 * Modes: FV, PV, Savings, Loan, Goal-Based Planning.
 * Goal mode: set a target FV, solve for required periodic contributions.
 * Includes Fisher real-return adjustment, sensitivity analysis,
 * milestone tracking, and year-by-year projection.
 */

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { formatCurrency } from "@/lib/currency";
import type { ThemePalette } from "@/constants/theme";

type CalcMode = "fv" | "pv" | "savings" | "loan" | "goal";
type ContribFreq = "monthly" | "quarterly" | "annual";

const FREQ_MAP: Record<ContribFreq, { n: number; label: string; adj: string }> = {
  monthly:   { n: 12, label: "Monthly",   adj: "/mo" },
  quarterly: { n: 4,  label: "Quarterly", adj: "/qtr" },
  annual:    { n: 1,  label: "Annual",    adj: "/yr" },
};

interface ProjectionRow {
  year: number;
  startBalance: number;
  contribution: number;
  interest: number;
  endBalance: number;
}

interface SensitivityRow { rateLabel: string; pmt: number; delta: number }
interface MilestoneRow { pct: number; year: number | null; amount: number }

/**
 * Solve for PMT (ordinary annuity, CFA Level I formula).
 *
 * FV = PV(1+r)^n + PMT × [(1+r)^n − 1] / r
 * ⟹  PMT = [FV − PV(1+r)^n] × r / [(1+r)^n − 1]
 */
function solvePMT(fvTarget: number, pv: number, periodicRate: number, nPeriods: number): number {
  if (nPeriods <= 0) return 0;
  const pvGrowth = pv * Math.pow(1 + periodicRate, nPeriods);
  const gap = fvTarget - pvGrowth;
  if (gap <= 0) return 0; // PV already exceeds target
  if (periodicRate === 0) return gap / nPeriods;
  const fvifa = (Math.pow(1 + periodicRate, nPeriods) - 1) / periodicRate;
  return gap / fvifa;
}

/** Build year-by-year projection compounding each sub-period within a year */
function buildProjection(
  pv: number, periodicRate: number, pmtPerPeriod: number, freq: number, years: number,
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  let bal = pv;
  for (let y = 1; y <= years; y++) {
    const startBal = bal;
    for (let p = 0; p < freq; p++) bal = bal * (1 + periodicRate) + pmtPerPeriod;
    const yearContrib = pmtPerPeriod * freq;
    rows.push({ year: y, startBalance: startBal, contribution: yearContrib, interest: bal - startBal - yearContrib, endBalance: bal });
  }
  return rows;
}

export default function PlannerScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();

  const [mode, setMode] = useState<CalcMode>("fv");
  const [pv, setPv] = useState("10000");
  const [rate, setRate] = useState("8");
  const [years, setYears] = useState("10");
  const [pmt, setPmt] = useState("500");
  // ── Goal-mode specific ──
  const [targetFv, setTargetFv] = useState("100000");
  const [contribFreq, setContribFreq] = useState<ContribFreq>("monthly");
  const [inflation, setInflation] = useState("2");

  const pvNum = parseFloat(pv) || 0;
  const rateNum = (parseFloat(rate) || 0) / 100;
  const yearsNum = parseInt(years) || 0;
  const pmtNum = parseFloat(pmt) || 0;
  const targetFvNum = parseFloat(targetFv) || 0;
  const inflNum = (parseFloat(inflation) || 0) / 100;

  const result = useMemo(() => {
    if (mode === "fv") {
      // Future Value of lump sum + annuity
      const fvLump = pvNum * Math.pow(1 + rateNum, yearsNum);
      const fvAnnuity = pmtNum > 0 ? pmtNum * ((Math.pow(1 + rateNum, yearsNum) - 1) / rateNum) : 0;
      return {
        main: fvLump + fvAnnuity,
        label: "Future Value",
        details: [
          { l: "Lump Sum FV", v: fvLump },
          { l: "Annuity FV", v: fvAnnuity },
          { l: "Total Invested", v: pvNum + pmtNum * yearsNum },
          { l: "Total Interest", v: fvLump + fvAnnuity - pvNum - pmtNum * yearsNum },
        ],
      };
    }
    if (mode === "pv") {
      // Present Value
      const pvCalc = pvNum / Math.pow(1 + rateNum, yearsNum);
      return {
        main: pvCalc,
        label: "Present Value",
        details: [
          { l: "Future Amount", v: pvNum },
          { l: "Discount", v: pvNum - pvCalc },
        ],
      };
    }
    if (mode === "savings") {
      // Savings projection year-by-year
      const rows: ProjectionRow[] = [];
      let bal = pvNum;
      for (let y = 1; y <= yearsNum; y++) {
        const interest = bal * rateNum;
        const endBal = bal + pmtNum * 12 + interest;
        rows.push({ year: y, startBalance: bal, contribution: pmtNum * 12, interest, endBalance: endBal });
        bal = endBal;
      }
      return {
        main: bal,
        label: "Projected Balance",
        rows,
        details: [
          { l: "Total Contributions", v: pvNum + pmtNum * 12 * yearsNum },
          { l: "Total Interest Earned", v: bal - pvNum - pmtNum * 12 * yearsNum },
        ],
      };
    }
    // ── Goal-Based: Solve for PMT ──
    if (mode === "goal") {
      const freq = FREQ_MAP[contribFreq].n;
      const periodicRate = rateNum / freq;
      const nPeriods = yearsNum * freq;
      const pvGrowth = pvNum * Math.pow(1 + rateNum, yearsNum);
      const gap = targetFvNum - pvGrowth;
      const requiredPmt = solvePMT(targetFvNum, pvNum, periodicRate, nPeriods);
      const annualContrib = requiredPmt * freq;
      const totalContributed = pvNum + requiredPmt * nPeriods;
      const totalInterest = targetFvNum - totalContributed;
      const wealthMultiple = totalContributed > 0 ? targetFvNum / totalContributed : 0;
      // Fisher equation: (1 + r_nominal) / (1 + r_inflation) − 1
      const realRate = inflNum > 0 ? (1 + rateNum) / (1 + inflNum) - 1 : rateNum;
      const realFV = inflNum > 0 ? targetFvNum / Math.pow(1 + inflNum, yearsNum) : targetFvNum;
      // Projection
      const rows = buildProjection(pvNum, periodicRate, requiredPmt, freq, yearsNum);
      // Sensitivity: PMT at rate +/- 1%, +/- 2%
      const sensitivity: SensitivityRow[] = [-2, -1, 0, 1, 2].map((d) => {
        const adjRate = Math.max(rateNum + d / 100, 0);
        const adjPR = adjRate / freq;
        return { rateLabel: `${(adjRate * 100).toFixed(1)}%`, pmt: solvePMT(targetFvNum, pvNum, adjPR, nPeriods), delta: d };
      });
      // Milestones
      const milestones: MilestoneRow[] = [25, 50, 75, 100].map((pct) => {
        const target = (targetFvNum * pct) / 100;
        const hit = rows.find((r) => r.endBalance >= target);
        return { pct, year: hit ? hit.year : null, amount: target };
      });
      return {
        main: requiredPmt,
        label: `Required ${FREQ_MAP[contribFreq].label} Payment`,
        details: [
          { l: "Target Future Value", v: targetFvNum },
          { l: "PV Growth (lump sum)", v: pvGrowth },
          { l: "Funding Gap", v: Math.max(gap, 0) },
          { l: "Annual Contribution", v: annualContrib },
          { l: "Total Contributions", v: totalContributed },
          { l: "Total Interest Earned", v: totalInterest },
        ],
        rows,
        goalMeta: { wealthMultiple, realRate, realFV, pvGrowth, hasInflation: inflNum > 0, sensitivity, milestones, alreadyMet: gap <= 0 },
      };
    }

    // ── Loan Amortization ──
    if (rateNum === 0 || yearsNum === 0) return { main: 0, label: "Monthly Payment", details: [] };
    const monthRate = rateNum / 12;
    const nMonths = yearsNum * 12;
    const monthlyPmt = pvNum * (monthRate * Math.pow(1 + monthRate, nMonths)) / (Math.pow(1 + monthRate, nMonths) - 1);
    const totalPaid = monthlyPmt * nMonths;
    return {
      main: monthlyPmt,
      label: "Monthly Payment",
      details: [
        { l: "Loan Amount", v: pvNum },
        { l: "Total Paid", v: totalPaid },
        { l: "Total Interest", v: totalPaid - pvNum },
      ],
    };
  }, [mode, pvNum, rateNum, yearsNum, pmtNum, targetFvNum, contribFreq, inflNum]);

  const projectionRows = (result as any).rows as ProjectionRow[] | undefined;
  const goalMeta = (result as any).goalMeta as {
    wealthMultiple: number; realRate: number; realFV: number; pvGrowth: number;
    hasInflation: boolean; sensitivity: SensitivityRow[]; milestones: MilestoneRow[]; alreadyMet: boolean;
  } | undefined;

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[s.content, isDesktop && { maxWidth: 700, alignSelf: "center", width: "100%" }]}
    >
      <Text style={[s.title, { color: colors.textPrimary }]}>Financial Planner</Text>

      {/* Mode Tabs */}
      <View style={s.modeRow}>
        {([
          { key: "fv", label: "Future Value", icon: "arrow-up" as const },
          { key: "pv", label: "Present Value", icon: "arrow-down" as const },
          { key: "savings", label: "Savings", icon: "line-chart" as const },
          { key: "goal", label: "Goal", icon: "bullseye" as const },
          { key: "loan", label: "Loan", icon: "home" as const },
        ]).map((m) => (
          <Pressable
            key={m.key}
            onPress={() => setMode(m.key as CalcMode)}
            style={[
              s.modeChip,
              {
                backgroundColor: mode === m.key ? colors.accentPrimary : colors.bgCard,
                borderColor: mode === m.key ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <FontAwesome name={m.icon} size={11} color={mode === m.key ? "#fff" : colors.textMuted} style={{ marginRight: 5 }} />
            <Text style={{ color: mode === m.key ? "#fff" : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Input Fields */}
      <View style={[s.inputCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        {/* Goal: Target FV first */}
        {mode === "goal" && (
          <View style={s.inputRow}>
            <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Target Future Value</Text>
            <TextInput
              value={targetFv}
              onChangeText={setTargetFv}
              keyboardType="numeric"
              placeholder="e.g. 100,000"
              placeholderTextColor={colors.textMuted}
              style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
            />
          </View>
        )}
        <View style={s.inputRow}>
          <Text style={[s.inputLabel, { color: colors.textSecondary }]}>
            {mode === "loan" ? "Loan Amount" : mode === "pv" ? "Future Amount" : "Initial Investment"}
          </Text>
          <TextInput
            value={pv}
            onChangeText={setPv}
            keyboardType="numeric"
            style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
          />
        </View>
        <View style={s.inputRow}>
          <Text style={[s.inputLabel, { color: colors.textSecondary }]}>
            {mode === "goal" ? "Expected Annual Return (%)" : "Annual Rate (%)"}
          </Text>
          <TextInput
            value={rate}
            onChangeText={setRate}
            keyboardType="numeric"
            style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
          />
        </View>
        <View style={s.inputRow}>
          <Text style={[s.inputLabel, { color: colors.textSecondary }]}>
            {mode === "goal" ? "Investment Horizon (Years)" : "Years"}
          </Text>
          <TextInput
            value={years}
            onChangeText={setYears}
            keyboardType="numeric"
            style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
          />
        </View>
        {(mode === "fv" || mode === "savings") && (
          <View style={s.inputRow}>
            <Text style={[s.inputLabel, { color: colors.textSecondary }]}>
              {mode === "savings" ? "Monthly Contribution" : "Annual Payment (PMT)"}
            </Text>
            <TextInput
              value={pmt}
              onChangeText={setPmt}
              keyboardType="numeric"
              style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
            />
          </View>
        )}
        {/* Goal-specific: Inflation + Frequency */}
        {mode === "goal" && (
          <>
            <View style={s.inputRow}>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Inflation Rate (%)</Text>
              <TextInput
                value={inflation}
                onChangeText={setInflation}
                keyboardType="numeric"
                placeholder="0 = ignore"
                placeholderTextColor={colors.textMuted}
                style={[s.input, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
              />
            </View>
            <View style={s.inputRow}>
              <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Contribution Frequency</Text>
              <View style={s.freqRow}>
                {(["monthly", "quarterly", "annual"] as const).map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => setContribFreq(f)}
                    style={[
                      s.freqChip,
                      {
                        backgroundColor: contribFreq === f ? colors.accentPrimary : colors.bgPrimary,
                        borderColor: contribFreq === f ? colors.accentPrimary : colors.borderColor,
                      },
                    ]}
                  >
                    <Text style={{ color: contribFreq === f ? "#fff" : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
                      {FREQ_MAP[f].label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
      </View>

      {/* Result */}
      <View style={[s.resultCard, { backgroundColor: colors.accentPrimary + "15", borderColor: colors.accentPrimary }]}>
        {goalMeta?.alreadyMet ? (
          <>
            <FontAwesome name="check-circle" size={28} color={colors.success} style={{ marginBottom: 4 }} />
            <Text style={[s.resultLabel, { color: colors.success }]}>Target Already Met!</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 4 }}>
              Your initial investment of {formatCurrency(pvNum, "KWD")} compounding at {rate}% exceeds the target in {years} years.
            </Text>
          </>
        ) : (
          <>
            <Text style={[s.resultLabel, { color: colors.accentPrimary }]}>{result.label}</Text>
            <Text style={[s.resultValue, { color: colors.accentPrimary }]}>
              {formatCurrency(result.main, "KWD")}
            </Text>
            {mode === "goal" && (
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {FREQ_MAP[contribFreq].adj} for {years} years
              </Text>
            )}
          </>
        )}
      </View>

      {/* Detail Breakdown */}
      {result.details && result.details.length > 0 && (
        <View style={[s.detailCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          {result.details.map((d, i) => (
            <View key={i} style={[s.detailRow, { borderBottomColor: colors.borderColor }]}>
              <Text style={[s.detailLabel, { color: colors.textSecondary }]}>{d.l}</Text>
              <Text style={[s.detailValue, { color: colors.textPrimary }]}>{formatCurrency(d.v, "KWD")}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Goal: Key Metrics ─────────────────────────────────────── */}
      {goalMeta && !goalMeta.alreadyMet && (
        <View style={[s.metricsCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[s.chartTitle, { color: colors.textPrimary }]}>Key Metrics</Text>
          <View style={s.metricsGrid}>
            <MetricBadge icon="line-chart" label="Wealth Multiple" value={`${goalMeta.wealthMultiple.toFixed(2)}x`}
              sub="FV / Total Invested" colors={colors} accent={colors.accentPrimary} />
            <MetricBadge icon="percent" label="Real Return" value={`${(goalMeta.realRate * 100).toFixed(2)}%`}
              sub={goalMeta.hasInflation ? "Fisher-adjusted" : "No inflation adj."} colors={colors} accent={colors.success} />
            {goalMeta.hasInflation && (
              <MetricBadge icon="money" label="FV (Today's $)" value={formatCurrency(goalMeta.realFV, "KWD")}
                sub="Purchasing power" colors={colors} accent={"#f59e0b"} />
            )}
            <MetricBadge icon="arrow-circle-up" label="PV Growth" value={formatCurrency(goalMeta.pvGrowth, "KWD")}
              sub="Initial inv. compounded" colors={colors} accent={"#8b5cf6"} />
          </View>
        </View>
      )}

      {/* ── Goal: Sensitivity Analysis ────────────────────────────── */}
      {goalMeta && !goalMeta.alreadyMet && goalMeta.sensitivity.length > 0 && (
        <View style={[s.sensCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[s.chartTitle, { color: colors.textPrimary }]}>Sensitivity Analysis</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 10 }}>
            How required payment changes with different return assumptions
          </Text>
          <View style={[s.sensHeaderRow, { borderBottomColor: colors.borderColor }]}>
            <Text style={[s.sensCell, { color: colors.textMuted, fontWeight: "700" }]}>Return</Text>
            <Text style={[s.sensCell, { color: colors.textMuted, fontWeight: "700", textAlign: "right" }]}>
              {FREQ_MAP[contribFreq].label} PMT
            </Text>
            <Text style={[s.sensCell, { color: colors.textMuted, fontWeight: "700", textAlign: "right" }]}>vs Base</Text>
          </View>
          {goalMeta.sensitivity.map((row) => {
            const basePmt = goalMeta.sensitivity.find((r) => r.delta === 0)?.pmt ?? 0;
            const diff = basePmt > 0 ? ((row.pmt - basePmt) / basePmt) * 100 : 0;
            const isBase = row.delta === 0;
            return (
              <View key={row.rateLabel} style={[s.sensRow, { borderBottomColor: colors.borderColor }, isBase && { backgroundColor: colors.accentPrimary + "10" }]}>
                <Text style={[s.sensCell, { color: isBase ? colors.accentPrimary : colors.textPrimary, fontWeight: isBase ? "700" : "400" }]}>
                  {row.rateLabel}{isBase ? " (base)" : ""}
                </Text>
                <Text style={[s.sensCell, { textAlign: "right", color: colors.textPrimary, fontWeight: isBase ? "700" : "500", fontVariant: ["tabular-nums"] }]}>
                  {formatCurrency(Math.max(row.pmt, 0), "KWD")}
                </Text>
                <Text style={[s.sensCell, { textAlign: "right", fontWeight: "600", fontVariant: ["tabular-nums"], color: isBase ? colors.textMuted : diff > 0 ? colors.danger : colors.success }]}>
                  {isBase ? "-" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Goal: Milestone Tracker ───────────────────────────────── */}
      {goalMeta && !goalMeta.alreadyMet && (
        <View style={[s.metricsCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[s.chartTitle, { color: colors.textPrimary }]}>Milestone Tracker</Text>
          <View style={{ gap: 10 }}>
            {goalMeta.milestones.map((m) => {
              const barPct = m.year && yearsNum > 0 ? (m.year / yearsNum) * 100 : 0;
              return (
                <View key={m.pct} style={s.milestoneRow}>
                  <View style={s.milestoneLabel}>
                    <View style={[s.milestoneDot, { backgroundColor: m.year ? colors.success : colors.textMuted }]} />
                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>{m.pct}%</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>({formatCurrency(m.amount, "KWD")})</Text>
                  </View>
                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <View style={[s.milestoneBar, { backgroundColor: colors.bgPrimary }]}>
                      <View style={[s.milestoneBarFill, { width: `${Math.min(barPct, 100)}%` as any, backgroundColor: m.year ? colors.accentPrimary : colors.textMuted }]} />
                    </View>
                  </View>
                  <Text style={{ color: m.year ? colors.textPrimary : colors.textMuted, fontSize: 13, fontWeight: "600", minWidth: 52, textAlign: "right" }}>
                    {m.year ? `Year ${m.year}` : "N/A"}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Principal vs Interest Graph */}
      {(() => {
        // Calculate principal vs interest for modes that have them
        let principal = 0;
        let interest = 0;
        if (mode === "fv") {
          principal = pvNum + pmtNum * yearsNum;
          interest = result.main - principal;
        } else if (mode === "savings") {
          principal = pvNum + pmtNum * 12 * yearsNum;
          interest = result.main - principal;
        } else if (mode === "loan") {
          principal = pvNum;
          const monthRate = rateNum / 12;
          const nMonths = yearsNum * 12;
          if (rateNum > 0 && yearsNum > 0) {
            const monthlyPmt = pvNum * (monthRate * Math.pow(1 + monthRate, nMonths)) / (Math.pow(1 + monthRate, nMonths) - 1);
            const totalPaid = monthlyPmt * nMonths;
            interest = totalPaid - pvNum;
          }
        } else if (mode === "goal" && goalMeta && !goalMeta.alreadyMet) {
          const freq = FREQ_MAP[contribFreq].n;
          const nPeriods = yearsNum * freq;
          principal = pvNum + result.main * nPeriods;
          interest = targetFvNum - principal;
        }

        if ((mode === "fv" || mode === "savings" || mode === "loan" || mode === "goal") && (principal > 0 || interest > 0)) {
          const total = principal + interest;
          const principalPct = total > 0 ? (principal / total) * 100 : 0;
          const interestPct = total > 0 ? (interest / total) * 100 : 0;
          const principalColor = colors.accentPrimary;
          const interestColor = colors.success;

          return (
            <View style={[s.chartCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <Text style={[s.chartTitle, { color: colors.textPrimary }]}>
                {mode === "loan" ? "Payment Breakdown" : "Growth Breakdown"}
              </Text>

              {/* Stacked horizontal bar */}
              <View style={s.stackedBar}>
                {principalPct > 0 && (
                  <View style={[s.barSegment, { width: `${principalPct}%` as any, backgroundColor: principalColor, borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: interestPct > 0 ? 0 : 8, borderBottomRightRadius: interestPct > 0 ? 0 : 8 }]}>
                    {principalPct > 15 && (
                      <Text style={s.barLabel}>{principalPct.toFixed(1)}%</Text>
                    )}
                  </View>
                )}
                {interestPct > 0 && (
                  <View style={[s.barSegment, { width: `${interestPct}%` as any, backgroundColor: interestColor, borderTopRightRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: principalPct > 0 ? 0 : 8, borderBottomLeftRadius: principalPct > 0 ? 0 : 8 }]}>
                    {interestPct > 15 && (
                      <Text style={s.barLabel}>{interestPct.toFixed(1)}%</Text>
                    )}
                  </View>
                )}
              </View>

              {/* Legend */}
              <View style={s.legendRow}>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: principalColor }]} />
                  <View>
                    <Text style={[s.legendLabel, { color: colors.textSecondary }]}>
                      {mode === "loan" ? "Principal" : "Total Invested"}
                    </Text>
                    <Text style={[s.legendValue, { color: colors.textPrimary }]}>
                      {formatCurrency(principal, "KWD")} ({principalPct.toFixed(1)}%)
                    </Text>
                  </View>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: interestColor }]} />
                  <View>
                    <Text style={[s.legendLabel, { color: colors.textSecondary }]}>
                      {mode === "loan" ? "Total Interest" : "Interest Earned"}
                    </Text>
                    <Text style={[s.legendValue, { color: colors.textPrimary }]}>
                      {formatCurrency(interest, "KWD")} ({interestPct.toFixed(1)}%)
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          );
        }
        return null;
      })()}

      {/* Projection Table */}
      {projectionRows && projectionRows.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Year-by-Year Projection</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View style={[s.table, { borderColor: colors.borderColor }]}>
              <View style={[s.tableRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
                <Text style={[s.th, { color: colors.textSecondary }]}>Year</Text>
                <Text style={[s.th, { color: colors.textSecondary }]}>Start</Text>
                <Text style={[s.th, { color: colors.textSecondary }]}>Added</Text>
                <Text style={[s.th, { color: colors.textSecondary }]}>Interest</Text>
                <Text style={[s.th, { color: colors.textSecondary }]}>End</Text>
                {mode === "goal" && <Text style={[s.th, { color: colors.textSecondary }]}>% of Goal</Text>}
              </View>
              {projectionRows.map((row) => {
                const pctOfGoal = mode === "goal" && targetFvNum > 0 ? (row.endBalance / targetFvNum) * 100 : null;
                return (
                  <View key={row.year} style={[s.tableRow, { borderBottomColor: colors.borderColor }]}>
                    <Text style={[s.td, { color: colors.textPrimary }]}>{row.year}</Text>
                    <Text style={[s.td, { color: colors.textPrimary }]}>{formatCurrency(row.startBalance, "KWD")}</Text>
                    <Text style={[s.td, { color: colors.accentPrimary }]}>{formatCurrency(row.contribution, "KWD")}</Text>
                    <Text style={[s.td, { color: colors.success }]}>{formatCurrency(row.interest, "KWD")}</Text>
                    <Text style={[s.td, { color: colors.textPrimary, fontWeight: "600" }]}>{formatCurrency(row.endBalance, "KWD")}</Text>
                    {pctOfGoal !== null && (
                      <Text style={[s.td, { color: pctOfGoal >= 100 ? colors.success : colors.textMuted, fontWeight: pctOfGoal >= 100 ? "700" : "400" }]}>
                        {pctOfGoal.toFixed(1)}%
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/* ── MetricBadge sub-component ───────────────────────────────────── */
function MetricBadge({ icon, label, value, sub, colors, accent }: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string; value: string; sub: string;
  colors: ThemePalette; accent: string;
}) {
  return (
    <View style={[s.metricBadge, { backgroundColor: accent + "10", borderColor: accent + "30" }]}>
      <FontAwesome name={icon} size={16} color={accent} style={{ marginBottom: 6 }} />
      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 2 }}>{value}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 20, marginBottom: 10 },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  inputCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  inputRow: {
    marginBottom: 12,
  },
  inputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: "600",
  },
  resultCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    marginBottom: 16,
  },
  resultLabel: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  resultValue: { fontSize: 28, fontWeight: "800" },
  detailCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 14, fontWeight: "600" },

  // Principal vs Interest chart
  chartCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  chartTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  stackedBar: {
    flexDirection: "row",
    height: 36,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 14,
  },
  barSegment: {
    justifyContent: "center",
    alignItems: "center",
    minWidth: 2,
  },
  barLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: { fontSize: 11, fontWeight: "500" },
  legendValue: { fontSize: 13, fontWeight: "700" },
  table: { borderWidth: 1, borderRadius: 8, overflow: "hidden" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  th: { flex: 1, fontSize: 11, fontWeight: "700" },
  td: { flex: 1, fontSize: 11 },

  // Goal-mode styles
  freqRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  freqChip: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  metricsCard: { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  metricBadge: { flex: 1, minWidth: 140, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  sensCard: { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  sensHeaderRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 2 },
  sensRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  sensCell: { flex: 1, fontSize: 13 },
  milestoneRow: { flexDirection: "row", alignItems: "center" },
  milestoneLabel: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 120 },
  milestoneDot: { width: 8, height: 8, borderRadius: 4 },
  milestoneBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  milestoneBarFill: { height: 6, borderRadius: 3 },
});
