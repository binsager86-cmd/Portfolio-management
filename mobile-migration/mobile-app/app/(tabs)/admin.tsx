/**
 * Admin Dashboard — dedicated admin-only experience.
 *
 * Two summary cards at top:
 *   1. Registered Users — count + new-per-day
 *   2. Total Activities — count across all users
 *
 * Expandable detail sections:
 *   1. Users table: registered date, name, username, last login, portfolio value, growth
 *   2. Activities table: date, type (buy/sell/deposit/dividend), stock, shares, value
 *
 * Click a user row to filter activities by that user.
 */

import { useAdminActivities, useAdminCreateUser, useAdminDeleteUser, useAdminUpdatePassword, useAdminUpdateUsername, useAdminUsers } from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { formatCurrency } from "@/lib/currency";
import type { AdminActivity, AdminUser } from "@/services/api";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from "react-native";

// ── Helpers ─────────────────────────────────────────────────────────

/** Format currency without decimal places for admin overview */
function fmtInt(value: number): string {
  return formatCurrency(value, "KWD", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(epoch: number | null): string {
  if (!epoch) return "\u2014";
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(epoch: number | null): string {
  if (!epoch) return "\u2014";
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function timeAgo(epoch: number | null): string {
  if (!epoch) return "Never";
  const now = Date.now() / 1000;
  const diff = now - epoch;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(epoch);
}

const TXN_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  buy: { label: "Buy", icon: "arrow-up", color: "#3498db" },
  sell: { label: "Sell", icon: "arrow-down", color: "#e74c3c" },
  dividend: { label: "Dividend", icon: "gift", color: "#27ae60" },
  deposit: { label: "Deposit", icon: "plus-circle", color: "#8e44ad" },
  bonus: { label: "Bonus", icon: "star", color: "#f39c12" },
  split: { label: "Split", icon: "columns", color: "#1abc9c" },
};

function getTxnConfig(type: string) {
  return TXN_CONFIG[type] ?? { label: type, icon: "circle", color: "#95a5a6" };
}

/** Group users by registration day */
function getNewUsersPerDay(users: AdminUser[]): { date: string; count: number }[] {
  const map: Record<string, number> = {};
  for (const u of users) {
    if (!u.created_at) continue;
    const day = new Date(u.created_at * 1000).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
    map[day] = (map[day] || 0) + 1;
  }
  return Object.entries(map).map(([date, count]) => ({ date, count }));
}

// ── Summary Card ────────────────────────────────────────────────────

function SummaryCard({
  icon, iconColor, title, value, subtitle, onPress, active, colors, fonts,
}: {
  icon: string; iconColor: string; title: string; value: string | number;
  subtitle?: string; onPress?: () => void; active?: boolean; colors: any; fonts: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.summaryCard,
        {
          backgroundColor: colors.bgSecondary,
          borderColor: active ? iconColor : colors.borderColor,
          borderWidth: active ? 2 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <View style={[st.summaryIconWrap, { backgroundColor: iconColor + "18" }]}>
        <FontAwesome name={icon as any} size={22} color={iconColor} />
      </View>
      <Text style={[st.summaryLabel, { color: colors.textMuted, fontSize: fonts.caption }]}>
        {title}
      </Text>
      <Text style={[st.summaryValue, { color: colors.textPrimary, fontSize: fonts.hero }]}>
        {value}
      </Text>
      {subtitle ? (
        <Text style={[st.summarySub, { color: colors.textMuted, fontSize: fonts.caption }]}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ── Table Header ────────────────────────────────────────────────────

function TableHeader({
  columns, colors, fonts,
}: {
  columns: { label: string; flex: number; align?: "left" | "center" | "right" }[];
  colors: any; fonts: any;
}) {
  return (
    <View style={[st.tableHeaderRow, { borderBottomColor: colors.borderColor }]}>
      {columns.map((col) => (
        <Text
          key={col.label}
          style={[
            st.tableHeaderCell,
            { flex: col.flex, textAlign: col.align ?? "left",
              color: colors.textMuted, fontSize: fonts.caption },
          ]}
        >
          {col.label}
        </Text>
      ))}
    </View>
  );
}

// ── User Table Row ──────────────────────────────────────────────────

function UserTableRow({
  user, colors, fonts, isPhone, selected, onPress,
}: {
  user: AdminUser; colors: any; fonts: any; isPhone: boolean;
  selected: boolean; onPress: () => void;
}) {
  const growthColor = user.growth_value >= 0 ? "#27ae60" : "#e74c3c";
  const growthSign = user.growth_value >= 0 ? "+" : "";

  if (isPhone) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          st.userCardMobile,
          {
            backgroundColor: selected ? colors.accentPrimary + "10" : "transparent",
            borderBottomColor: colors.borderColor,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={st.userCardRow}>
          <View style={{ flex: 1 }}>
            <Text style={[st.userName, { color: colors.textPrimary, fontSize: fonts.body }]}>
              {user.name || user.username}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginTop: 2 }}>
              @{user.username}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[st.userValue, { color: colors.textPrimary, fontSize: fonts.body }]}>
              {fmtInt(user.total_value)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
              Stocks: {fmtInt(user.stocks_value)} {"\u00B7"} Cash: {fmtInt(user.cash_balance)}
            </Text>
            <Text style={{ color: growthColor, fontSize: fonts.caption, fontWeight: "600", marginTop: 2 }}>
              {growthSign}{fmtInt(user.growth_value)}
            </Text>
          </View>
        </View>
        <View style={st.userCardMeta}>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            Registered {formatDate(user.created_at)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            Last: {timeAgo(user.last_login)}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        st.tableRow,
        {
          backgroundColor: selected
            ? colors.accentPrimary + "10"
            : pressed ? (colors.bgCardHover ?? colors.bgPrimary) : "transparent",
          borderBottomColor: colors.borderColor,
        },
      ]}
    >
      <Text style={[st.tableCell, { flex: 1.2, color: colors.textPrimary, fontSize: fonts.body }]}>
        {formatDate(user.created_at)}
      </Text>
      <Text style={[st.tableCell, { flex: 1.2, color: colors.textPrimary, fontSize: fonts.body, fontWeight: "600" }]}>
        {user.name || "\u2014"}
      </Text>
      <Text style={[st.tableCell, { flex: 1, color: colors.textMuted, fontSize: fonts.body }]}>
        @{user.username}
      </Text>
      <Text style={[st.tableCell, { flex: 1.2, color: colors.textMuted, fontSize: fonts.body, textAlign: "center" }]}>
        {timeAgo(user.last_login)}
      </Text>
      <Text style={[st.tableCell, { flex: 1, color: colors.textPrimary, fontSize: fonts.body, textAlign: "center", fontWeight: "600" }]}>
        {fmtInt(user.stocks_value)}
      </Text>
      <Text style={[st.tableCell, { flex: 0.8, color: colors.success ?? "#27ae60", fontSize: fonts.body, textAlign: "center", fontWeight: "600" }]}>
        {fmtInt(user.cash_balance)}
      </Text>
      <Text style={[st.tableCell, { flex: 1, color: colors.textPrimary, fontSize: fonts.body, textAlign: "center", fontWeight: "700" }]}>
        {fmtInt(user.total_value)}
      </Text>
      <Text style={[st.tableCell, { flex: 0.8, color: growthColor, fontSize: fonts.body, textAlign: "center", fontWeight: "600" }]}>
        {growthSign}{fmtInt(user.growth_value)}
      </Text>
    </Pressable>
  );
}

// ── Activity Table Row ──────────────────────────────────────────────

function ActivityTableRow({
  activity, colors, fonts, isPhone,
}: {
  activity: AdminActivity; colors: any; fonts: any; isPhone: boolean;
}) {
  const cfg = getTxnConfig(activity.txn_type);

  if (isPhone) {
    return (
      <View style={[st.actCardMobile, { borderBottomColor: colors.borderColor }]}>
        <View style={st.actCardRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <View style={[st.txnIconBg, { backgroundColor: cfg.color + "18" }]}>
              <FontAwesome name={cfg.icon as any} size={12} color={cfg.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[st.actStock, { color: colors.textPrimary, fontSize: fonts.body }]}>
                {activity.stock_symbol}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                @{activity.username} {"\u00B7"} {cfg.label}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[st.actValue, { color: colors.textPrimary, fontSize: fonts.body }]}>
              {formatCurrency(activity.value)}
            </Text>
            {activity.shares > 0 && (
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                {activity.shares} shares @ {activity.price > 0 ? formatCurrency(activity.price) : "\u2014"}
              </Text>
            )}
          </View>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
          {activity.txn_date || formatDate(activity.created_at)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[st.tableRow, { borderBottomColor: colors.borderColor }]}>
      <Text style={[st.tableCell, { flex: 1, color: colors.textMuted, fontSize: fonts.body }]}>
        {activity.txn_date || formatDate(activity.created_at)}
      </Text>
      <Text style={[st.tableCell, { flex: 0.8, color: colors.textSecondary, fontSize: fonts.body }]}>
        @{activity.username}
      </Text>
      <View style={[st.tableCell, { flex: 0.8, flexDirection: "row", alignItems: "center", gap: 6 }]}>
        <View style={[st.txnBadge, { backgroundColor: cfg.color + "18" }]}>
          <FontAwesome name={cfg.icon as any} size={10} color={cfg.color} />
          <Text style={[st.txnBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <Text style={[st.tableCell, { flex: 1, color: colors.textPrimary, fontSize: fonts.body, fontWeight: "600" }]}>
        {activity.stock_symbol}
      </Text>
      <Text style={[st.tableCell, { flex: 0.7, color: colors.textMuted, fontSize: fonts.body, textAlign: "right" }]}>
        {activity.shares > 0 ? activity.shares.toLocaleString() : "\u2014"}
      </Text>
      <Text style={[st.tableCell, { flex: 0.8, color: colors.textSecondary, fontSize: fonts.body, textAlign: "right" }]}>
        {activity.price > 0 ? formatCurrency(activity.price) : "\u2014"}
      </Text>
      <Text style={[st.tableCell, { flex: 1, color: colors.textPrimary, fontSize: fonts.body, textAlign: "right", fontWeight: "600" }]}>
        {formatCurrency(activity.value)}
      </Text>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

function AdminDashboardScreen() {
  const { colors } = useThemeStore();
  const { isPhone, fonts } = useResponsive();
  const isAdmin = useAuthStore((s) => s.isAdmin);

  const [activeSection, setActiveSection] = useState<"users" | "activities" | "manage">("users");
  const [activityPage, setActivityPage] = useState(1);
  const [filterUserId, setFilterUserId] = useState<number | undefined>();
  const [filterUserName, setFilterUserName] = useState<string | undefined>();
  const [filterTxnType, setFilterTxnType] = useState<string | undefined>();
  const [filterStock, setFilterStock] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Manage users state
  const [manageSearch, setManageSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editField, setEditField] = useState<"username" | "password" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [formValue, setFormValue] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [actionError, setActionError] = useState("");

  const {
    data: usersData,
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = useAdminUsers(isAdmin);

  const {
    data: activitiesData,
    isLoading: activitiesLoading,
    refetch: refetchActivities,
  } = useAdminActivities({
    page: activityPage,
    perPage: 50,
    userId: filterUserId,
    txnType: filterTxnType,
    stockSymbol: filterStock || undefined,
    dateFrom: filterDateFrom || undefined,
    dateTo: filterDateTo || undefined,
    enabled: isAdmin,
  });

  const createUser = useAdminCreateUser();
  const updateUsername = useAdminUpdateUsername();
  const updatePassword = useAdminUpdatePassword();
  const deleteUser = useAdminDeleteUser();

  const onRefresh = useCallback(() => {
    refetchUsers();
    refetchActivities();
  }, [refetchUsers, refetchActivities]);

  const handleUserPress = useCallback((user: AdminUser) => {
    if (filterUserId === user.id) {
      setFilterUserId(undefined);
      setFilterUserName(undefined);
    } else {
      setFilterUserId(user.id);
      setFilterUserName(user.name || user.username);
      setActiveSection("activities");
      setActivityPage(1);
    }
  }, [filterUserId]);

  const clearAllFilters = useCallback(() => {
    setFilterUserId(undefined);
    setFilterUserName(undefined);
    setFilterTxnType(undefined);
    setFilterStock("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setActivityPage(1);
  }, []);

  const newUsersToday = useMemo(() => {
    if (!usersData?.users) return 0;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEpoch = todayStart.getTime() / 1000;
    return usersData.users.filter((u) => u.created_at && u.created_at >= todayEpoch).length;
  }, [usersData]);

  const dailyRegistrations = useMemo(
    () => (usersData?.users ? getNewUsersPerDay(usersData.users) : []),
    [usersData],
  );

  if (!isAdmin) {
    return (
      <View style={[st.center, { backgroundColor: colors.bgPrimary, flex: 1 }]}>
        <FontAwesome name="lock" size={48} color={colors.textMuted} />
        <Text style={[st.noAccess, { color: colors.textMuted, fontSize: fonts.body }]}>
          Admin access required
        </Text>
      </View>
    );
  }

  const userCount = usersData?.count ?? 0;
  const activities = activitiesData?.activities ?? [];
  const totalActivities = activitiesData?.total ?? 0;
  const totalPages = Math.ceil(totalActivities / 50);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={[
        st.container,
        { maxWidth: isPhone ? undefined : 1100, alignSelf: "center", width: "100%" },
      ]}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.accentPrimary} />
      }
    >
      {/* Header */}
      <View style={st.header}>
        <View>
          <Text style={[st.pageTitle, { color: colors.textPrimary, fontSize: fonts.hero }]}>
            Admin Dashboard
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginTop: 2 }}>
            System overview and user management
          </Text>
        </View>
      </View>

      {/* Summary Cards */}
      <View style={[st.summaryRow, isPhone && st.summaryRowPhone]}>
        <SummaryCard
          icon="users"
          iconColor="#3498db"
          title="Registered Users"
          value={userCount}
          subtitle={newUsersToday > 0 ? `+${newUsersToday} today` : `${dailyRegistrations.length} registration days`}
          onPress={() => setActiveSection("users")}
          active={activeSection === "users"}
          colors={colors}
          fonts={fonts}
        />
        <SummaryCard
          icon="exchange"
          iconColor="#27ae60"
          title="Total Activities"
          value={totalActivities.toLocaleString()}
          subtitle={activities.length > 0 ? `Latest: ${activities[0]?.txn_date || "\u2014"}` : "No activity"}
          onPress={() => setActiveSection("activities")}
          active={activeSection === "activities"}
          colors={colors}
          fonts={fonts}
        />
        <SummaryCard
          icon="cog"
          iconColor="#8e44ad"
          title="Manage Users"
          value="Manage"
          subtitle="Add, edit & delete"
          onPress={() => setActiveSection("manage")}
          active={activeSection === "manage"}
          colors={colors}
          fonts={fonts}
        />
      </View>

      {/* Users Section */}
      {activeSection === "users" && (
        <View style={[st.section, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <View style={st.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <FontAwesome name="users" size={16} color="#3498db" />
              <Text style={[st.sectionTitle, { color: colors.textPrimary, fontSize: fonts.title }]}>
                Users
              </Text>
              <View style={[st.badge, { backgroundColor: "#3498db" }]}>
                <Text style={st.badgeText}>{userCount}</Text>
              </View>
            </View>
            {filterUserId != null && (
              <Pressable
                onPress={() => { setFilterUserId(undefined); setFilterUserName(undefined); }}
                style={[st.filterChip, { backgroundColor: "#3498db" + "18" }]}
              >
                <Text style={{ color: "#3498db", fontSize: fonts.caption, fontWeight: "600" }}>
                  {filterUserName} {"\u00D7"}
                </Text>
              </Pressable>
            )}
          </View>

          {/* New registrations per day */}
          {dailyRegistrations.length > 0 && (
            <View style={[st.dailyBar, { borderBottomColor: colors.borderColor }]}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 6 }}>
                RECENT REGISTRATIONS
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {dailyRegistrations.slice(0, 7).map((d) => (
                  <View key={d.date} style={[st.dayChip, { backgroundColor: colors.bgPrimary }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{d.date}</Text>
                    <Text style={{ color: "#3498db", fontSize: 12, fontWeight: "700" }}>+{d.count}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Table header (desktop) */}
          {!isPhone && (
            <TableHeader
              colors={colors}
              fonts={fonts}
              columns={[
                { label: "Registered", flex: 1.2 },
                { label: "Name", flex: 1.2 },
                { label: "Username", flex: 1 },
                { label: "Last Login", flex: 1.2, align: "center" },
                { label: "Stocks", flex: 1, align: "center" },
                { label: "Cash", flex: 0.8, align: "center" },
                { label: "Total", flex: 1, align: "center" },
                { label: "Growth", flex: 0.8, align: "center" },
              ]}
            />
          )}

          {usersLoading ? (
            <ActivityIndicator color={colors.accentPrimary} style={{ padding: 24 }} />
          ) : (
            (usersData?.users ?? []).map((user) => (
              <UserTableRow
                key={user.id}
                user={user}
                colors={colors}
                fonts={fonts}
                isPhone={isPhone}
                selected={filterUserId === user.id}
                onPress={() => handleUserPress(user)}
              />
            ))
          )}
        </View>
      )}

      {/* Activities Section */}
      {activeSection === "activities" && (
        <View style={[st.section, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <View style={st.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <FontAwesome name="exchange" size={16} color="#27ae60" />
              <Text style={[st.sectionTitle, { color: colors.textPrimary, fontSize: fonts.title }]}>
                User Activities
              </Text>
              <View style={[st.badge, { backgroundColor: "#27ae60" }]}>
                <Text style={st.badgeText}>{totalActivities.toLocaleString()}</Text>
              </View>
            </View>
            {(filterUserId != null || filterTxnType || filterStock || filterDateFrom || filterDateTo) && (
              <Pressable
                onPress={clearAllFilters}
                style={[st.filterChip, { backgroundColor: "#e74c3c" + "18" }]}
              >
                <Text style={{ color: "#e74c3c", fontSize: fonts.caption, fontWeight: "600" }}>
                  Clear All {"\u00D7"}
                </Text>
              </Pressable>
            )}
          </View>

          {/* ── Filter Bar ── */}
          <View style={[st.filterBar, { borderBottomColor: colors.borderColor }]}>
            {/* Row 1: Search inputs */}
            <View style={[st.filterRow, isPhone && { flexDirection: "column" }]}>
              <View style={[st.filterInputWrap, { flex: 1 }]}>
                <FontAwesome name="user" size={12} color={colors.textMuted} style={{ marginRight: 6 }} />
                <TextInput
                  style={[st.filterInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
                  placeholder="Filter by user..."
                  placeholderTextColor={colors.textMuted}
                  value={filterUserName ?? ""}
                  onChangeText={(txt) => {
                    if (!txt) {
                      setFilterUserId(undefined);
                      setFilterUserName(undefined);
                    } else {
                      setFilterUserName(txt);
                      // Find matching user
                      const match = usersData?.users.find(
                        (u) => u.username.toLowerCase() === txt.toLowerCase()
                          || (u.name && u.name.toLowerCase() === txt.toLowerCase()),
                      );
                      setFilterUserId(match?.id);
                    }
                    setActivityPage(1);
                  }}
                />
              </View>
              <View style={[st.filterInputWrap, { flex: 1 }]}>
                <FontAwesome name="line-chart" size={12} color={colors.textMuted} style={{ marginRight: 6 }} />
                <TextInput
                  style={[st.filterInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
                  placeholder="Filter by stock..."
                  placeholderTextColor={colors.textMuted}
                  value={filterStock}
                  onChangeText={(txt) => { setFilterStock(txt); setActivityPage(1); }}
                  autoCapitalize="characters"
                />
              </View>
            </View>

            {/* Row 2: Date range */}
            <View style={[st.filterRow, isPhone && { flexDirection: "column" }]}>
              <View style={[st.filterInputWrap, { flex: 1 }]}>
                <FontAwesome name="calendar" size={12} color={colors.textMuted} style={{ marginRight: 6 }} />
                <TextInput
                  style={[st.filterInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
                  placeholder="From (YYYY-MM-DD)"
                  placeholderTextColor={colors.textMuted}
                  value={filterDateFrom}
                  onChangeText={(txt) => { setFilterDateFrom(txt); setActivityPage(1); }}
                />
              </View>
              <View style={[st.filterInputWrap, { flex: 1 }]}>
                <FontAwesome name="calendar" size={12} color={colors.textMuted} style={{ marginRight: 6 }} />
                <TextInput
                  style={[st.filterInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
                  placeholder="To (YYYY-MM-DD)"
                  placeholderTextColor={colors.textMuted}
                  value={filterDateTo}
                  onChangeText={(txt) => { setFilterDateTo(txt); setActivityPage(1); }}
                />
              </View>
            </View>

            {/* Row 3: Type filter chips */}
            <View style={st.filterChipRow}>
              {[
                { key: undefined, label: "All" },
                { key: "buy", label: "Buy" },
                { key: "sell", label: "Sell" },
                { key: "dividend", label: "Dividend" },
                { key: "deposit", label: "Deposit" },
                { key: "bonus", label: "Bonus" },
              ].map((item) => {
                const active = filterTxnType === item.key;
                const cfg = item.key ? getTxnConfig(item.key) : { color: "#27ae60" };
                return (
                  <Pressable
                    key={item.label}
                    onPress={() => { setFilterTxnType(item.key); setActivityPage(1); }}
                    style={[
                      st.typeChip,
                      {
                        backgroundColor: active ? cfg.color : cfg.color + "15",
                        borderColor: active ? cfg.color : cfg.color + "40",
                      },
                    ]}
                  >
                    <Text style={{ color: active ? "#fff" : cfg.color, fontSize: 12, fontWeight: "600" }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Active filter chips */}
            {(filterUserId != null || filterStock || filterDateFrom || filterDateTo) && (
              <View style={st.filterChipRow}>
                {filterUserId != null && (
                  <Pressable
                    onPress={() => { setFilterUserId(undefined); setFilterUserName(undefined); setActivityPage(1); }}
                    style={[st.filterChip, { backgroundColor: "#3498db" + "18" }]}
                  >
                    <Text style={{ color: "#3498db", fontSize: 11, fontWeight: "600" }}>
                      User: {filterUserName} {"\u00D7"}
                    </Text>
                  </Pressable>
                )}
                {filterStock !== "" && (
                  <Pressable
                    onPress={() => { setFilterStock(""); setActivityPage(1); }}
                    style={[st.filterChip, { backgroundColor: "#f39c12" + "18" }]}
                  >
                    <Text style={{ color: "#f39c12", fontSize: 11, fontWeight: "600" }}>
                      Stock: {filterStock} {"\u00D7"}
                    </Text>
                  </Pressable>
                )}
                {filterDateFrom !== "" && (
                  <Pressable
                    onPress={() => { setFilterDateFrom(""); setActivityPage(1); }}
                    style={[st.filterChip, { backgroundColor: "#8e44ad" + "18" }]}
                  >
                    <Text style={{ color: "#8e44ad", fontSize: 11, fontWeight: "600" }}>
                      From: {filterDateFrom} {"\u00D7"}
                    </Text>
                  </Pressable>
                )}
                {filterDateTo !== "" && (
                  <Pressable
                    onPress={() => { setFilterDateTo(""); setActivityPage(1); }}
                    style={[st.filterChip, { backgroundColor: "#8e44ad" + "18" }]}
                  >
                    <Text style={{ color: "#8e44ad", fontSize: 11, fontWeight: "600" }}>
                      To: {filterDateTo} {"\u00D7"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* Table header (desktop) */}
          {!isPhone && (
            <TableHeader
              colors={colors}
              fonts={fonts}
              columns={[
                { label: "Date", flex: 1 },
                { label: "User", flex: 0.8 },
                { label: "Type", flex: 0.8 },
                { label: "Stock", flex: 1 },
                { label: "Shares", flex: 0.7, align: "right" },
                { label: "Price", flex: 0.8, align: "right" },
                { label: "Value", flex: 1, align: "right" },
              ]}
            />
          )}

          {activitiesLoading ? (
            <ActivityIndicator color={colors.accentPrimary} style={{ padding: 24 }} />
          ) : activities.length === 0 ? (
            <View style={st.emptyState}>
              <FontAwesome name="inbox" size={32} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: fonts.body, marginTop: 8 }}>
                No activities found
              </Text>
            </View>
          ) : (
            activities.map((act) => (
              <ActivityTableRow key={act.id} activity={act} colors={colors} fonts={fonts} isPhone={isPhone} />
            ))
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <View style={[st.pagination, { borderTopColor: colors.borderColor }]}>
              <Pressable
                onPress={() => setActivityPage((p) => Math.max(1, p - 1))}
                disabled={activityPage <= 1}
                style={[st.pageBtn, { backgroundColor: colors.bgPrimary, opacity: activityPage <= 1 ? 0.4 : 1 }]}
              >
                <FontAwesome name="chevron-left" size={12} color={colors.textSecondary} />
              </Pressable>
              <Text style={{ color: colors.textSecondary, fontSize: fonts.body, fontWeight: "600" }}>
                Page {activityPage} of {totalPages}
              </Text>
              <Pressable
                onPress={() => setActivityPage((p) => Math.min(totalPages, p + 1))}
                disabled={activityPage >= totalPages}
                style={[st.pageBtn, { backgroundColor: colors.bgPrimary, opacity: activityPage >= totalPages ? 0.4 : 1 }]}
              >
                <FontAwesome name="chevron-right" size={12} color={colors.textSecondary} />
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* ══════════════════ Manage Users Section ══════════════════ */}
      {activeSection === "manage" && (
        <View style={[st.section, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <View style={st.sectionHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <FontAwesome name="cog" size={16} color="#8e44ad" />
              <Text style={[st.sectionTitle, { color: colors.textPrimary, fontSize: fonts.title }]}>
                Manage Users
              </Text>
              <View style={[st.badge, { backgroundColor: "#8e44ad" }]}>
                <Text style={st.badgeText}>{userCount}</Text>
              </View>
            </View>
            <Pressable
              onPress={() => {
                setNewUsername("");
                setNewPassword("");
                setNewName("");
                setActionError("");
                setShowAddModal(true);
              }}
              style={[st.filterChip, { backgroundColor: "#27ae60" + "18" }]}
            >
              <Text style={{ color: "#27ae60", fontSize: fonts.caption, fontWeight: "600" }}>
                + Add User
              </Text>
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={[st.filterBar, { borderBottomColor: colors.borderColor }]}>
            <View style={st.filterInputWrap}>
              <FontAwesome name="search" size={12} color={colors.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={[st.filterInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
                placeholder="Search by username..."
                placeholderTextColor={colors.textMuted}
                value={manageSearch}
                onChangeText={setManageSearch}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* User list */}
          {usersLoading ? (
            <ActivityIndicator color={colors.accentPrimary} style={{ padding: 24 }} />
          ) : (
            (usersData?.users ?? [])
              .filter((u) =>
                !manageSearch ||
                u.username.toLowerCase().includes(manageSearch.toLowerCase()) ||
                (u.name && u.name.toLowerCase().includes(manageSearch.toLowerCase())),
              )
              .map((user) => (
                <View
                  key={user.id}
                  style={[
                    st.manageRow,
                    { borderBottomColor: colors.borderColor },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: fonts.body, fontWeight: "600" }}>
                      {user.name || user.username}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginTop: 2 }}>
                      @{user.username}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>
                      Last login: {timeAgo(user.last_login)} {"\u00B7"} Registered {formatDate(user.created_at)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <Pressable
                      onPress={() => {
                        setEditUser(user);
                        setEditField("username");
                        setFormValue(user.username);
                        setActionError("");
                      }}
                      style={[st.actionBtn, { backgroundColor: "#3498db" + "18" }]}
                    >
                      <FontAwesome name="pencil" size={12} color="#3498db" />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setEditUser(user);
                        setEditField("password");
                        setFormValue("");
                        setActionError("");
                      }}
                      style={[st.actionBtn, { backgroundColor: "#f39c12" + "18" }]}
                    >
                      <FontAwesome name="lock" size={12} color="#f39c12" />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setDeleteTarget(user);
                        setActionError("");
                      }}
                      style={[st.actionBtn, { backgroundColor: "#e74c3c" + "18" }]}
                    >
                      <FontAwesome name="trash" size={12} color="#e74c3c" />
                    </Pressable>
                  </View>
                </View>
              ))
          )}
        </View>
      )}

      {/* ══════════════════ Add User Modal ══════════════════ */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <Pressable style={st.modalOverlay} onPress={() => setShowAddModal(false)}>
          <Pressable style={[st.modalCard, { backgroundColor: colors.bgSecondary }]} onPress={() => {}}>
            <Text style={[st.modalTitle, { color: colors.textPrimary, fontSize: fonts.title }]}>
              Add New User
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginBottom: 12 }}>
              Username
            </Text>
            <TextInput
              style={[st.modalInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
              placeholder="Username"
              placeholderTextColor={colors.textMuted}
              value={newUsername}
              onChangeText={setNewUsername}
              autoCapitalize="none"
            />
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginBottom: 4, marginTop: 10 }}>
              Display Name (optional)
            </Text>
            <TextInput
              style={[st.modalInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginBottom: 4, marginTop: 10 }}>
              Password (min 8 chars)
            </Text>
            <TextInput
              style={[st.modalInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
            {actionError ? (
              <Text style={{ color: "#e74c3c", fontSize: 12, marginTop: 8 }}>{actionError}</Text>
            ) : null}
            <View style={st.modalActions}>
              <Pressable
                onPress={() => setShowAddModal(false)}
                style={[st.modalBtn, { backgroundColor: colors.bgPrimary }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!newUsername || !newPassword) {
                    setActionError("Username and password are required");
                    return;
                  }
                  try {
                    await createUser.mutateAsync({
                      username: newUsername,
                      password: newPassword,
                      name: newName || undefined,
                    });
                    setShowAddModal(false);
                  } catch (e: any) {
                    setActionError(e?.response?.data?.detail || e.message || "Failed to create user");
                  }
                }}
                disabled={createUser.isPending}
                style={[st.modalBtn, { backgroundColor: "#27ae60" }]}
              >
                {createUser.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Create</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══════════════════ Edit Username / Password Modal ══════════════════ */}
      <Modal visible={editField !== null && editUser !== null} transparent animationType="fade">
        <Pressable style={st.modalOverlay} onPress={() => { setEditField(null); setEditUser(null); }}>
          <Pressable style={[st.modalCard, { backgroundColor: colors.bgSecondary }]} onPress={() => {}}>
            <Text style={[st.modalTitle, { color: colors.textPrimary, fontSize: fonts.title }]}>
              {editField === "username" ? "Change Username" : "Reset Password"}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginBottom: 4 }}>
              User: @{editUser?.username}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fonts.caption, marginBottom: 8, marginTop: 8 }}>
              {editField === "username" ? "New Username" : "New Password (min 8 chars)"}
            </Text>
            <TextInput
              style={[st.modalInput, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput ?? colors.bgPrimary }]}
              placeholder={editField === "username" ? "New username" : "New password"}
              placeholderTextColor={colors.textMuted}
              value={formValue}
              onChangeText={setFormValue}
              autoCapitalize={editField === "username" ? "none" : "none"}
              secureTextEntry={editField === "password"}
            />
            {actionError ? (
              <Text style={{ color: "#e74c3c", fontSize: 12, marginTop: 8 }}>{actionError}</Text>
            ) : null}
            <View style={st.modalActions}>
              <Pressable
                onPress={() => { setEditField(null); setEditUser(null); }}
                style={[st.modalBtn, { backgroundColor: colors.bgPrimary }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!formValue) {
                    setActionError(editField === "username" ? "Username is required" : "Password is required");
                    return;
                  }
                  try {
                    if (editField === "username") {
                      await updateUsername.mutateAsync({ userId: editUser!.id, username: formValue });
                    } else {
                      await updatePassword.mutateAsync({ userId: editUser!.id, password: formValue });
                    }
                    setEditField(null);
                    setEditUser(null);
                  } catch (e: any) {
                    setActionError(e?.response?.data?.detail || e.message || "Operation failed");
                  }
                }}
                disabled={updateUsername.isPending || updatePassword.isPending}
                style={[st.modalBtn, { backgroundColor: editField === "username" ? "#3498db" : "#f39c12" }]}
              >
                {(updateUsername.isPending || updatePassword.isPending) ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══════════════════ Delete Confirmation Modal ══════════════════ */}
      <Modal visible={deleteTarget !== null} transparent animationType="fade">
        <Pressable style={st.modalOverlay} onPress={() => setDeleteTarget(null)}>
          <Pressable style={[st.modalCard, { backgroundColor: colors.bgSecondary }]} onPress={() => {}}>
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <View style={[st.summaryIconWrap, { backgroundColor: "#e74c3c" + "18" }]}>
                <FontAwesome name="exclamation-triangle" size={22} color="#e74c3c" />
              </View>
            </View>
            <Text style={[st.modalTitle, { color: colors.textPrimary, fontSize: fonts.title, textAlign: "center" }]}>
              Delete User
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: fonts.body, textAlign: "center", marginBottom: 4 }}>
              Are you sure you want to delete{"\n"}
              <Text style={{ fontWeight: "700", color: colors.textPrimary }}>
                @{deleteTarget?.username}
              </Text>
              ?
            </Text>
            <Text style={{ color: "#e74c3c", fontSize: fonts.caption, textAlign: "center", marginTop: 4 }}>
              This will permanently remove the user and all their data.
            </Text>
            {actionError ? (
              <Text style={{ color: "#e74c3c", fontSize: 12, marginTop: 8, textAlign: "center" }}>{actionError}</Text>
            ) : null}
            <View style={st.modalActions}>
              <Pressable
                onPress={() => setDeleteTarget(null)}
                style={[st.modalBtn, { backgroundColor: colors.bgPrimary, flex: 1 }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  try {
                    await deleteUser.mutateAsync(deleteTarget!.id);
                    setDeleteTarget(null);
                  } catch (e: any) {
                    setActionError(e?.response?.data?.detail || e.message || "Failed to delete user");
                  }
                }}
                disabled={deleteUser.isPending}
                style={[st.modalBtn, { backgroundColor: "#e74c3c", flex: 1 }]}
              >
                {deleteUser.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: "#fff", fontWeight: "600" }}>Delete</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

export default AdminDashboardScreen;

// ── Styles ──────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  center: { justifyContent: "center", alignItems: "center", gap: 12 },
  noAccess: { fontWeight: "600", marginTop: 8 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  pageTitle: { fontWeight: "800", letterSpacing: -0.5 },

  summaryRow: { flexDirection: "row", gap: 14, marginBottom: 20 },
  summaryRowPhone: { flexDirection: "column" },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    padding: 18,
    gap: 6,
    ...Platform.select({
      web: { cursor: "pointer", transition: "transform 0.15s ease, border-color 0.15s ease" } as any,
    }),
  },
  summaryIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    justifyContent: "center", alignItems: "center", marginBottom: 4,
  },
  summaryLabel: { fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryValue: { fontWeight: "800", letterSpacing: -0.5 },
  summarySub: { fontWeight: "500" },

  section: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginBottom: 16 },
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", padding: 16,
  },
  sectionTitle: { fontWeight: "700" },
  badge: {
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
    minWidth: 28, alignItems: "center",
  },
  badgeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  filterChip: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    ...Platform.select({ web: { cursor: "pointer" } as any }),
  },

  filterBar: {
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterRow: {
    flexDirection: "row", gap: 10,
  },
  filterInputWrap: {
    flexDirection: "row", alignItems: "center",
  },
  filterInput: {
    flex: 1, height: 36, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 10, fontSize: 13,
  },
  filterChipRow: {
    flexDirection: "row", flexWrap: "wrap", gap: 6,
  },
  typeChip: {
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1,
    ...Platform.select({ web: { cursor: "pointer" } as any }),
  },

  dailyBar: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dayChip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignItems: "center", gap: 2 },

  tableHeaderRow: {
    flexDirection: "row", paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableHeaderCell: { fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  tableRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    ...Platform.select({ web: { cursor: "pointer" } as any }),
  },
  tableCell: { paddingRight: 8 },

  userCardMobile: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  userCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  userCardMeta: { flexDirection: "row", gap: 12, marginTop: 6 },
  userName: { fontWeight: "600" },
  userValue: { fontWeight: "600" },

  actCardMobile: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actCardRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: 4,
  },
  actStock: { fontWeight: "600" },
  actValue: { fontWeight: "600" },
  txnIconBg: {
    width: 28, height: 28, borderRadius: 8,
    justifyContent: "center", alignItems: "center",
  },
  txnBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  txnBadgeText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },

  emptyState: { alignItems: "center", justifyContent: "center", padding: 40, gap: 4 },

  pagination: {
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth,
  },
  pageBtn: { width: 34, height: 34, borderRadius: 8, justifyContent: "center", alignItems: "center" },

  // Manage users
  manageRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    width: 34, height: 34, borderRadius: 8,
    justifyContent: "center", alignItems: "center",
    ...Platform.select({ web: { cursor: "pointer" } as any }),
  },

  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center",
  },
  modalCard: {
    borderRadius: 16, padding: 24,
    width: "90%", maxWidth: 420,
    ...Platform.select({ web: { boxShadow: "0 8px 32px rgba(0,0,0,0.3)" } as any }),
  },
  modalTitle: { fontWeight: "700", marginBottom: 12 },
  modalInput: {
    height: 42, borderRadius: 8, borderWidth: 1,
    paddingHorizontal: 12, fontSize: 14, marginBottom: 4,
  },
  modalActions: {
    flexDirection: "row", gap: 10, marginTop: 18,
  },
  modalBtn: {
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 20,
    alignItems: "center", justifyContent: "center",
    ...Platform.select({ web: { cursor: "pointer" } as any }),
  },
});
