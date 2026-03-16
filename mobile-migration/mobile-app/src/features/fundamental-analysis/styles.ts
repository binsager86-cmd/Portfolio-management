/**
 * Fundamental Analysis — Central stylesheet.
 */

import { StyleSheet } from "react-native";

export const st = StyleSheet.create({
  container: { flex: 1 },

  /* Header */
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  headerBack: { width: 30, height: 30, borderRadius: 15, justifyContent: "center", alignItems: "center" },
  headerBadge: { width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center" },

  /* Tabs */
  tabContainer: { borderBottomWidth: 1 },
  tabBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, marginHorizontal: 2, borderRadius: 8, marginVertical: 4 },
  tabBtnActive: { borderRadius: 8 },

  /* Search */
  searchRow: { flexDirection: "row", paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, gap: 8, alignItems: "center" },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  addBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },

  /* Chips */
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 6 },

  /* Cards */
  card: {
    borderRadius: 14, borderWidth: 1, marginBottom: 10, paddingHorizontal: 16, paddingVertical: 14,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },

  /* Stock list */
  listContent: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 80 },
  symbolBadge: { width: 48, height: 48, borderRadius: 14, justifyContent: "center", alignItems: "center" },
  tagPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  iconBtn: { width: 30, height: 30, borderRadius: 10, justifyContent: "center", alignItems: "center" },

  /* Sections */
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  sectionIcon: { width: 26, height: 26, borderRadius: 8, justifyContent: "center", alignItems: "center" },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginLeft: 8, flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },

  /* Statements */
  stmtHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  stmtIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  lineItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, paddingHorizontal: 16 },
  editInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12, width: 90, textAlign: "right", fontVariant: ["tabular-nums"] },

  /* Comparison */
  compHeaderRow: { flexDirection: "row", paddingBottom: 8, marginBottom: 4, borderBottomWidth: 2 },
  compRow: { flexDirection: "row", paddingVertical: 5 },
  compCellName: { width: 170, fontSize: 12, paddingRight: 8 },
  compCellVal: { width: 100, textAlign: "right", fontSize: 12, fontVariant: ["tabular-nums"] },
  compCellYoy: { width: 72, textAlign: "right", fontSize: 11, fontVariant: ["tabular-nums"] },

  /* Metrics */
  metricRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  metricTableHeader: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1 },
  metricTableRow: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 14 },
  metricTableNameCell: { width: 150, fontSize: 12 },
  metricTableValCell: { width: 90, textAlign: "right", fontSize: 12, fontVariant: ["tabular-nums"] },

  /* Growth */
  growthRow: { paddingVertical: 12, flexDirection: "row", alignItems: "center" },
  growthBarTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  growthBarFill: { height: 6, borderRadius: 3, borderWidth: 1 },

  /* Score */
  scoreRing: { width: 110, height: 110, borderRadius: 55, borderWidth: 5, justifyContent: "center", alignItems: "center" },
  scoreRingInner: { width: 90, height: 90, borderRadius: 45, justifyContent: "center", alignItems: "center" },
  scoreNum: { fontSize: 34, fontWeight: "900", fontVariant: ["tabular-nums"] },
  scoreBarTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  scoreBarFill: { height: 8, borderRadius: 4 },
  scoreHistRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8 },
  scoreHistCell: { fontSize: 11, textAlign: "center", fontVariant: ["tabular-nums"] },

  /* Empty states */
  empty: { alignItems: "center", paddingVertical: 60, gap: 4 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: "center", alignItems: "center" },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center" },
  modalBox: {
    width: "92%", maxWidth: 460, borderRadius: 18, borderWidth: 1, padding: 22,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },

  /* Form */
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  actionBtnText: { fontSize: 14, fontWeight: "700" },
  exportTrigger: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  exportOverlay: { position: "absolute", top: 0, right: 0, paddingTop: 32, zIndex: 99 },
  exportDropdown: {
    borderRadius: 10, borderWidth: 1, paddingVertical: 4, minWidth: 150,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  exportDropItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  errorBanner: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 8, marginTop: 6 },

  /* Stock picker */
  pickerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  pickerSymbolBadge: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  selectedStockCard: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1 },

  /* Reusable layout */
  rowCenter: { flexDirection: "row" as const, alignItems: "center" as const },
  rowBetween: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const },

  /* Empty-state typography */
  emptyTitle: { fontSize: 16, fontWeight: "700" as const, marginTop: 16 },
  emptySubtitle: { fontSize: 13, marginTop: 4 },

  /* Field label */
  fieldLabel: { fontSize: 11, fontWeight: "600" as const, marginBottom: 4, letterSpacing: 0.5 },
});
