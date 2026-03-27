/**
 * useValuationCalculations — Manages valuation form state, mutations,
 * pre-flight validation, auto-population from defaults, and last result tracking.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { useValuationDefaults } from "@/hooks/queries";
import { showErrorAlert } from "@/lib/errorHandling";
import {
    runDCFValuation,
    runDDMValuation,
    runGrahamValuation,
    runMultiplesValuation,
    type ValuationRunResult,
} from "@/services/api";

export type ValuationModel = "graham" | "dcf" | "ddm" | "multiples";

export function useValuationCalculations(stockId: number) {
  const queryClient = useQueryClient();
  const [model, setModel] = useState<ValuationModel>("graham");

  // ── Auto-fetched defaults ───────────────────────────────────────
  const defaults = useValuationDefaults(stockId);
  const populated = useRef(false);

  // ── Form state ──────────────────────────────────────────────────
  const [eps, setEps] = useState("");
  const [grahamGrowth, setGrahamGrowth] = useState("");
  const [corpYield, setCorpYield] = useState("4.4");
  const [marginOfSafety, setMarginOfSafety] = useState("25");
  const [currentPrice, setCurrentPrice] = useState("");
  // Per-model MoS (editable in result cards, persisted in state)
  const [mosGraham, setMosGraham] = useState("15");
  const [mosDcf, setMosDcf] = useState("15");
  const [mosDdm, setMosDdm] = useState("15");
  const [mosMult, setMosMult] = useState("15");
  const [fcf, setFcf] = useState("");
  const [g1, setG1] = useState("10");
  const [g2, setG2] = useState("5");
  const [dr, setDr] = useState("10");
  const [tg, setTg] = useState("2.5");
  const [shares, setShares] = useState("1");
  const [s1, setS1] = useState("5");
  const [s2, setS2] = useState("5");
  const [cash, setCash] = useState("0");
  const [debt, setDebt] = useState("0");
  const [div, setDiv] = useState("");
  const [divGr, setDivGr] = useState("5");
  const [rr, setRr] = useState("10");
  const [mv, setMv] = useState("");
  const [pm, setPm] = useState("");
  const [multipleType, setMultipleType] = useState("P/E");

  // ── Last calculation result ─────────────────────────────────────
  const [lastResult, setLastResult] = useState<ValuationRunResult | null>(null);

  // ── Auto-populate from defaults when they load ──────────────────
  useEffect(() => {
    if (!defaults.data || populated.current) return;
    populated.current = true;
    const d = defaults.data;
    if (d.eps != null) setEps(String(d.eps));
    // Graham-specific defaults
    if (d.graham_growth_cagr != null) setGrahamGrowth(String(d.graham_growth_cagr));
    if (d.bond_yield != null) setCorpYield(String(d.bond_yield));
    if (d.current_price != null) setCurrentPrice(String(d.current_price));
    if (d.fcf != null) setFcf(String(d.fcf));
    if (d.shares_outstanding != null && d.shares_outstanding > 0) setShares(String(d.shares_outstanding));
    if (d.dividends_per_share != null) setDiv(String(d.dividends_per_share));
    if (d.avg_dividend_growth != null) setDivGr(String(Math.round(d.avg_dividend_growth * 10000) / 100));
    if (d.revenue_growth != null) setG1(String(Math.round(d.revenue_growth * 10000) / 100));
    if (d.total_cash != null) setCash(String(d.total_cash));
    if (d.total_debt != null) setDebt(String(d.total_debt));
    // EPS as default metric value for multiples
    if (d.eps != null) setMv(String(d.eps));
  }, [defaults.data]);

  const onSuccess = (result: ValuationRunResult) => {
    setLastResult(result);
    queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] });
  };
  const onError = (err: Error) => showErrorAlert("Valuation Failed", err);

  // ── Mutations ───────────────────────────────────────────────────
  const grahamMut = useMutation({
    mutationFn: () => {
      const cp = parseFloat(currentPrice);
      return runGrahamValuation(stockId, {
        eps: parseFloat(eps),
        growth_rate: parseFloat(grahamGrowth) || 0,
        corporate_yield: parseFloat(corpYield) || 4.4,
        margin_of_safety: parseFloat(marginOfSafety) || 25,
        current_price: !isNaN(cp) && cp > 0 ? cp : null,
      });
    },
    onSuccess, onError,
  });
  const dcfMut = useMutation({
    mutationFn: () => runDCFValuation(stockId, {
      fcf: parseFloat(fcf), growth_rate_stage1: parseFloat(g1) / 100, growth_rate_stage2: parseFloat(g2) / 100,
      discount_rate: parseFloat(dr) / 100, shares_outstanding: parseFloat(shares) || 1,
      terminal_growth: parseFloat(tg) / 100 || 0.025,
      stage1_years: parseInt(s1) || 5, stage2_years: parseInt(s2) || 5,
      cash: parseFloat(cash) || 0, debt: parseFloat(debt) || 0,
    }),
    onSuccess, onError,
  });
  const ddmMut = useMutation({
    mutationFn: () => runDDMValuation(stockId, {
      last_dividend: parseFloat(div), growth_rate: parseFloat(divGr) / 100, required_return: parseFloat(rr) / 100,
    }),
    onSuccess, onError,
  });
  const multMut = useMutation({
    mutationFn: () => runMultiplesValuation(stockId, {
      metric_value: parseFloat(mv), peer_multiple: parseFloat(pm),
      multiple_type: multipleType,
      shares_outstanding: parseFloat(shares) || 1,
    }),
    onSuccess, onError,
  });

  // ── Pre-flight validation ───────────────────────────────────────
  const valError = useMemo((): string | null => {
    if (model === "graham") {
      const e = parseFloat(eps);
      if (eps && isNaN(e)) return "EPS must be a valid number.";
      if (eps && e <= 0) return "EPS must be positive for Graham formula.";
    }
    if (model === "dcf") {
      const drN = parseFloat(dr), tgN = parseFloat(tg), sharesN = parseFloat(shares);
      if (fcf && isNaN(parseFloat(fcf))) return "FCF must be a valid number.";
      if (dr && tg && !isNaN(drN) && !isNaN(tgN) && Math.abs(drN - tgN) < 0.001)
        return "Discount Rate equals Perpetual Growth — causes division by zero.";
      if (dr && !isNaN(drN) && drN <= 0) return "Discount Rate must be positive.";
      if (shares && !isNaN(sharesN) && sharesN <= 0) return "Shares outstanding must be positive.";
      if (dr && tg && !isNaN(drN) && !isNaN(tgN) && tgN >= drN)
        return "Perpetual Growth must be less than Discount Rate for DCF convergence.";
    }
    if (model === "ddm") {
      const rrN = parseFloat(rr), grN = parseFloat(divGr);
      if (div && isNaN(parseFloat(div))) return "Dividend must be a valid number.";
      if (rr && !isNaN(rrN) && rrN <= 0) return "Required Return must be positive.";
      if (rr && divGr && !isNaN(rrN) && !isNaN(grN) && Math.abs(rrN - grN) < 0.001)
        return "Required Return equals Growth Rate — causes division by zero.";
      if (rr && divGr && !isNaN(rrN) && !isNaN(grN) && grN >= rrN)
        return "Growth Rate must be less than Required Return for DDM convergence.";
    }
    if (model === "multiples") {
      const sharesN = parseFloat(shares);
      if (mv && isNaN(parseFloat(mv))) return "Metric Value must be a valid number.";
      if (pm && isNaN(parseFloat(pm))) return "Peer Multiple must be a valid number.";
      if (shares && !isNaN(sharesN) && sharesN <= 0) return "Shares must be positive.";
    }
    return null;
  }, [model, eps, fcf, g1, g2, dr, tg, shares, div, divGr, rr, mv, pm]);

  return {
    model, setModel,
    eps, setEps, currentPrice, setCurrentPrice,
    grahamGrowth, setGrahamGrowth, corpYield, setCorpYield, marginOfSafety, setMarginOfSafety,
    fcf, setFcf,
    g1, setG1, g2, setG2, dr, setDr, tg, setTg,
    s1, setS1, s2, setS2,
    shares, setShares, cash, setCash, debt, setDebt,
    div, setDiv, divGr, setDivGr, rr, setRr,
    mv, setMv, pm, setPm, multipleType, setMultipleType,
    grahamMut, dcfMut, ddmMut, multMut,
    valError, lastResult,
    mosGraham, setMosGraham, mosDcf, setMosDcf, mosDdm, setMosDdm, mosMult, setMosMult,
    defaults: defaults.data ?? null,
    defaultsLoading: defaults.isLoading,
  };
}
