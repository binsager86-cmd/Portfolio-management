import { StyleSheet } from "react-native";

export const s = StyleSheet.create({
  container: { flex: 1 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  kpiCardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  holdingsHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginTop: 16,
    marginBottom: 6,
  },
  holdingsTitle: { fontSize: 18, fontWeight: "700" as const },
  holdingsExportBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#1a3a2a",
    borderColor: "#10b981",
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 44,
  },
  holdingsExportText: { color: "#10b981", fontSize: 13, fontWeight: "700" as const },
  viewToggleRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  viewToggleBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
});

export const donutStyles = StyleSheet.create({
  section: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: { fontSize: 14, fontWeight: "700", marginBottom: 12 },
});
