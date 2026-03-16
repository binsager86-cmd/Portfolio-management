/**
 * ValuationsPanel — Run Graham / DCF / DDM / Multiples valuations
 * and display valuation history.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { useValuations } from "@/hooks/queries";
import { exportCSV, exportExcel, exportPDF, TableData } from "@/lib/exportAnalysis";
import { useValuationCalculations } from "../hooks/useValuationCalculations";
import { st } from "../styles";
import { MODEL_INFO, type PanelWithSymbolProps } from "../types";
import { ActionButton, Card, Chip, ExportBar, FadeIn, LabeledInput, SectionHeader } from "./shared";

export function ValuationsPanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  const {
    model, setModel,
    eps, setEps, bvps, setBvps, fcf, setFcf,
    g1, setG1, g2, setG2, dr, setDr,
    shares, setShares,
    div, setDiv, divGr, setDivGr, rr, setRr,
    mv, setMv, pm, setPm,
    grahamMut, dcfMut, ddmMut, multMut,
    valError,
  } = useValuationCalculations(stockId);

  const { data, isLoading, refetch, isFetching } = useValuations(stockId);
  const valuations = data?.valuations ?? [];

  const info = MODEL_INFO[model];

  const exportTables = useCallback((): TableData[] => {
    if (valuations.length === 0) return [];
    return [{
      title: "Valuation History",
      headers: ["Model", "Date", "Intrinsic Value", "Parameters"],
      rows: valuations.map((v) => [
        v.model_type.toUpperCase(),
        v.valuation_date,
        v.intrinsic_value != null ? v.intrinsic_value.toFixed(2) : "N/A",
        v.parameters ? Object.entries(v.parameters).map(([k, val]) => `${k}: ${typeof val === "number" ? val.toFixed(4) : val}`).join("; ") : "",
      ]),
    }];
  }, [valuations]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 960, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      <FadeIn>
        <SectionHeader title="Run Valuation" icon="calculator" iconColor={colors.accentTertiary} colors={colors} />

        {/* Model selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {(["graham", "dcf", "ddm", "multiples"] as const).map((m) => (
            <Chip key={m} label={m === "multiples" ? "MULTIPLES" : m.toUpperCase()} active={model === m} onPress={() => setModel(m)} colors={colors}
              icon={MODEL_INFO[m].icon} />
          ))}
        </ScrollView>

        <Card colors={colors}>
          {/* Model header */}
          <View style={[st.rowCenter, { marginBottom: 12 }]}>
            <View style={[st.sectionIcon, { backgroundColor: colors.accentTertiary + "18" }]}>
              <FontAwesome name={info.icon} size={12} color={colors.accentTertiary} />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{info.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{info.formula}</Text>
            </View>
          </View>

          {model === "graham" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="EPS" value={eps} onChangeText={setEps} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="BOOK VALUE / SHARE" value={bvps} onChangeText={setBvps} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              {valError && <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>{valError}</Text>}
              <ActionButton label={grahamMut.isPending ? "Calculating..." : "Calculate Graham"} onPress={() => grahamMut.mutate()}
                colors={colors} disabled={!eps || !bvps || !!valError} loading={grahamMut.isPending} icon="play" />
            </>
          )}

          {model === "dcf" && (
            <>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <LabeledInput label="FCF" value={fcf} onChangeText={setFcf} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="STAGE 1 GROWTH" value={g1} onChangeText={setG1} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="STAGE 2 GROWTH" value={g2} onChangeText={setG2} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="DISCOUNT RATE" value={dr} onChangeText={setDr} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="SHARES" value={shares} onChangeText={setShares} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              {valError && <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>{valError}</Text>}
              <ActionButton label={dcfMut.isPending ? "Calculating..." : "Calculate DCF"} onPress={() => dcfMut.mutate()}
                colors={colors} disabled={!fcf || !!valError} loading={dcfMut.isPending} icon="play" />
            </>
          )}

          {model === "ddm" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="LAST DIVIDEND" value={div} onChangeText={setDiv} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="GROWTH RATE" value={divGr} onChangeText={setDivGr} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="REQ. RETURN" value={rr} onChangeText={setRr} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              {valError && <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>{valError}</Text>}
              <ActionButton label={ddmMut.isPending ? "Calculating..." : "Calculate DDM"} onPress={() => ddmMut.mutate()}
                colors={colors} disabled={!div || !!valError} loading={ddmMut.isPending} icon="play" />
            </>
          )}

          {model === "multiples" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="METRIC VALUE" value={mv} onChangeText={setMv} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="PEER MULTIPLE" value={pm} onChangeText={setPm} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="SHARES" value={shares} onChangeText={setShares} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              {valError && <Text style={{ color: colors.danger, fontSize: 11, marginTop: 4 }}>{valError}</Text>}
              <ActionButton label={multMut.isPending ? "Calculating..." : "Calculate Multiples"} onPress={() => multMut.mutate()}
                colors={colors} disabled={!mv || !pm || !!valError} loading={multMut.isPending} icon="play" />
            </>
          )}
        </Card>
      </FadeIn>

      {/* Valuation history */}
      {valuations.length > 0 && (
        <FadeIn delay={100}>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20 }}>
            <View style={{ flex: 1 }}>
              <SectionHeader title="Valuation History" icon="history" iconColor={colors.accentSecondary} badge={valuations.length} colors={colors} />
            </View>
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

          {valuations.map((v, idx) => (
            <FadeIn key={v.id} delay={idx * 40}>
              <Card colors={colors} style={{ marginBottom: 10 }}>
                <View style={st.rowCenter}>
                  {/* Model icon */}
                  <View style={[st.sectionIcon, { backgroundColor: colors.accentPrimary + "15" }]}>
                    <FontAwesome name={MODEL_INFO[v.model_type]?.icon ?? "calculator"} size={12} color={colors.accentPrimary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{v.model_type}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{v.valuation_date}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{
                      color: v.intrinsic_value != null ? colors.accentPrimary : colors.textMuted,
                      fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"],
                    }}>
                      {v.intrinsic_value != null ? v.intrinsic_value.toFixed(2) : "N/A"}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Intrinsic Value</Text>
                  </View>
                </View>

                {v.parameters && Object.keys(v.parameters).length > 0 && (
                  <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8 }}>
                    {Object.entries(v.parameters).map(([k, val]) => (
                      <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
                          {typeof val === "number" ? val.toFixed(4) : String(val)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </FadeIn>
          ))}
        </FadeIn>
      )}
    </ScrollView>
  );
}
