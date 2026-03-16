/**
 * useValuationCalculations — Manages valuation form state, mutations,
 * and pre-flight validation for all 4 models.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { showErrorAlert } from "@/lib/errorHandling";
import {
    runDCFValuation,
    runDDMValuation,
    runGrahamValuation,
    runMultiplesValuation,
} from "@/services/api";

export type ValuationModel = "graham" | "dcf" | "ddm" | "multiples";

export function useValuationCalculations(stockId: number) {
  const queryClient = useQueryClient();
  const [model, setModel] = useState<ValuationModel>("graham");

  // ── Form state ──────────────────────────────────────────────────
  const [eps, setEps] = useState("");
  const [bvps, setBvps] = useState("");
  const [fcf, setFcf] = useState("");
  const [g1, setG1] = useState("0.10");
  const [g2, setG2] = useState("0.05");
  const [dr, setDr] = useState("0.10");
  const [shares, setShares] = useState("1");
  const [div, setDiv] = useState("");
  const [divGr, setDivGr] = useState("0.05");
  const [rr, setRr] = useState("0.10");
  const [mv, setMv] = useState("");
  const [pm, setPm] = useState("");

  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] });
  const onError = (err: Error) => showErrorAlert("Valuation Failed", err);

  // ── Mutations ───────────────────────────────────────────────────
  const grahamMut = useMutation({
    mutationFn: () => runGrahamValuation(stockId, { eps: parseFloat(eps), book_value_per_share: parseFloat(bvps) }),
    onSuccess, onError,
  });
  const dcfMut = useMutation({
    mutationFn: () => runDCFValuation(stockId, {
      fcf: parseFloat(fcf), growth_rate_stage1: parseFloat(g1), growth_rate_stage2: parseFloat(g2),
      discount_rate: parseFloat(dr), shares_outstanding: parseFloat(shares) || 1,
    }),
    onSuccess, onError,
  });
  const ddmMut = useMutation({
    mutationFn: () => runDDMValuation(stockId, {
      last_dividend: parseFloat(div), growth_rate: parseFloat(divGr), required_return: parseFloat(rr),
    }),
    onSuccess, onError,
  });
  const multMut = useMutation({
    mutationFn: () => runMultiplesValuation(stockId, {
      metric_value: parseFloat(mv), peer_multiple: parseFloat(pm),
      shares_outstanding: parseFloat(shares) || 1,
    }),
    onSuccess, onError,
  });

  // ── Pre-flight validation ───────────────────────────────────────
  const valError = useMemo((): string | null => {
    if (model === "graham") {
      const e = parseFloat(eps), b = parseFloat(bvps);
      if (eps && isNaN(e)) return "EPS must be a valid number.";
      if (bvps && isNaN(b)) return "Book Value must be a valid number.";
      if (eps && bvps && (e * b < 0)) return "EPS × BVPS is negative — Graham formula requires √ of a positive product.";
    }
    if (model === "dcf") {
      const drN = parseFloat(dr), g2N = parseFloat(g2), sharesN = parseFloat(shares);
      if (fcf && isNaN(parseFloat(fcf))) return "FCF must be a valid number.";
      if (dr && g2 && !isNaN(drN) && !isNaN(g2N) && Math.abs(drN - g2N) < 1e-10)
        return "Discount Rate equals Terminal Growth — causes division by zero in terminal value.";
      if (dr && !isNaN(drN) && drN <= 0) return "Discount Rate must be positive.";
      if (shares && !isNaN(sharesN) && sharesN <= 0) return "Shares outstanding must be positive.";
      if (dr && g2 && !isNaN(drN) && !isNaN(g2N) && g2N >= drN)
        return "Terminal Growth must be less than Discount Rate for DCF convergence.";
    }
    if (model === "ddm") {
      const rrN = parseFloat(rr), grN = parseFloat(divGr);
      if (div && isNaN(parseFloat(div))) return "Dividend must be a valid number.";
      if (rr && !isNaN(rrN) && rrN <= 0) return "Required Return must be positive.";
      if (rr && divGr && !isNaN(rrN) && !isNaN(grN) && Math.abs(rrN - grN) < 1e-10)
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
  }, [model, eps, bvps, fcf, g1, g2, dr, shares, div, divGr, rr, mv, pm]);

  return {
    model, setModel,
    eps, setEps, bvps, setBvps, fcf, setFcf,
    g1, setG1, g2, setG2, dr, setDr,
    shares, setShares,
    div, setDiv, divGr, setDivGr, rr, setRr,
    mv, setMv, pm, setPm,
    grahamMut, dcfMut, ddmMut, multMut,
    valError,
  };
}
