import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { getValidUser, handleLogout } from "../lib/helpers";
import { deletedGroups } from "../lib/deletedGroups";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import {
  FadeIn,
  ScaleIn,
  PressableScale,
  LoadingScreen,
} from "../components/UI";

import { SCHOOL } from "../lib/config";

const { width: SCREEN_W } = Dimensions.get("window");
const TILE_W = (SCREEN_W - Spacing.xl * 2 - Spacing.md) / 2;

interface GroupInfo {
  id: string;
  name: string;
  status: string;
  memberCount: number;
  parentCount: number;
  hasAvailability: boolean;
}

export default function ParentHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [parentName, setParentName] = useState("");
  const [childName, setChildName] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const user = await getValidUser();
      if (!user) {
        handleLogout(router);
        return;
      }

      const { data: parent } = await supabase
        .from("parents")
        .select("id, name, student_id")
        .eq("id", user.id)
        .single();
      if (!parent) {
        setLoading(false);
        setRefreshing(false);
        return;
      }
      setParentId(parent.id);
      setParentName(parent.name?.split(" ")[0] || "");

      if (parent.student_id) {
        const { data: student } = await supabase
          .from("students")
          .select("name, saved_pickup_address")
          .eq("id", parent.student_id)
          .single();
        setChildName(student?.name || null);
        setPickupAddress(student?.saved_pickup_address || null);

        // Fetch ALL active group memberships for this student
        const { data: memberships } = await supabase
          .from("group_members")
          .select(`group_id, carpool_groups ( id, name, status )`)
          .eq("student_id", parent.student_id)
          .eq("status", "active");

        const localDeleted = deletedGroups.getAll();

        const groupList: GroupInfo[] = [];
        for (const membership of memberships || []) {
          const group = (membership as any).carpool_groups;
          if (!group || group.status === "deleted") continue;
          if (localDeleted.includes(group.id)) continue;

          // Link parent to this membership
          const { data: existingMember } = await supabase
            .from("group_members")
            .select("id")
            .eq("group_id", group.id)
            .eq("student_id", parent.student_id)
            .single();

          if (existingMember) {
            await supabase
              .from("group_members")
              .update({ parent_id: parent.id })
              .eq("id", existingMember.id);
          }

          const { data: members } = await supabase
            .from("group_members")
            .select("id, parent_id")
            .eq("group_id", group.id)
            .eq("status", "active");

          const { data: availability } = await supabase
            .from("parent_availability")
            .select("id")
            .eq("parent_id", parent.id)
            .eq("group_id", group.id)
            .limit(1);

          groupList.push({
            id: group.id,
            name: group.name,
            status: group.status,
            memberCount: (members || []).length,
            parentCount: (members || []).filter((m: any) => m.parent_id).length,
            hasAvailability: (availability || []).length > 0,
          });
        }
        setGroups(groupList);
      }

      setLoading(false);
      setRefreshing(false);
    } catch (err: any) {
      setLoading(false);
      setRefreshing(false);
      if (
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("Network request failed")
      ) {
        Alert.alert("No Internet", "Please check your connection.", [
          { text: "Retry", onPress: () => loadData() },
        ]);
      } else {
        Alert.alert("Error", "Something went wrong.", [
          { text: "Retry", onPress: () => loadData() },
        ]);
      }
    }
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  if (loading) return <LoadingScreen message="Loading your dashboard..." />;

  const hasGroups = groups.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadData(true)}
          tintColor={Colors.primary}
        />
      }
    >
      {/* Header */}
      <ScaleIn>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.name}>{parentName || "Parent"}</Text>
          </View>
          <PressableScale
            onPress={() => router.push("/settings")}
            style={styles.settingsBtn}
          >
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </PressableScale>
        </View>
      </ScaleIn>

      {/* No child linked */}
      {!childName && (
        <FadeIn delay={80}>
          <View style={[styles.emptyCard, { borderColor: Colors.warm + "40" }]}>
            <View
              style={[styles.emptyIcon, { backgroundColor: Colors.warmFaded }]}
            >
              <Text style={{ fontSize: 28 }}>⚠️</Text>
            </View>
            <Text style={styles.emptyTitle}>No child linked</Text>
            <Text style={styles.emptyText}>
              Your account isn't linked to a student yet. Make sure your child
              signs up first with their school email.
            </Text>
          </View>
        </FadeIn>
      )}

      {/* Group Cards */}
      {hasGroups
        ? groups.map((g, idx) => (
            <FadeIn key={g.id} delay={80 + idx * 80}>
              <View style={styles.groupCard}>
                <PressableScale
                  onPress={() => router.push(`/my-group?groupId=${g.id}`)}
                  style={styles.groupCardInner}
                >
                  <View style={styles.groupTop}>
                    <View style={styles.groupIcon}>
                      <Text style={{ fontSize: 20 }}>👥</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupName}>{g.name}</Text>
                      <Text style={styles.groupSub}>
                        {g.memberCount}{" "}
                        {g.memberCount === 1 ? "family" : "families"} ·{" "}
                        {g.parentCount} parent{g.parentCount !== 1 ? "s" : ""}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.pill,
                        g.status === "active" ? styles.pillActive : {},
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          g.status === "active" ? styles.pillActiveText : {},
                        ]}
                      >
                        {g.status === "forming" ? "Forming" : "Active"}
                      </Text>
                    </View>
                  </View>

                  {/* School destination */}
                  <View style={styles.schoolStrip}>
                    <Text style={{ fontSize: 13 }}>🏫</Text>
                    <Text style={styles.schoolText}>{SCHOOL.name}</Text>
                  </View>

                  {pickupAddress && idx === 0 && (
                    <View style={styles.pickupStrip}>
                      <Text style={{ fontSize: 13 }}>📍</Text>
                      <Text style={styles.pickupText} numberOfLines={1}>
                        {pickupAddress}
                      </Text>
                      <Text style={styles.pickupEdit}>Edit</Text>
                    </View>
                  )}
                </PressableScale>

                {/* Availability CTA */}
                {!g.hasAvailability && (
                  <PressableScale
                    onPress={() =>
                      router.push(`/availability?groupId=${g.id}`)
                    }
                    style={styles.ctaStrip}
                  >
                    <Text style={{ fontSize: 14 }}>🗓️</Text>
                    <Text style={styles.ctaStripText}>
                      Set your availability
                    </Text>
                    <Text style={styles.ctaStripArrow}>→</Text>
                  </PressableScale>
                )}

                {/* Inline quick actions */}
                <View style={styles.groupActions}>
                  <PressableScale
                    onPress={() =>
                      router.push(`/availability?groupId=${g.id}`)
                    }
                    style={styles.groupActionBtn}
                  >
                    <Text style={{ fontSize: 14 }}>
                      {g.hasAvailability ? "✏️" : "🗓️"}
                    </Text>
                    <Text style={styles.groupActionText}>
                      {g.hasAvailability ? "Edit" : "Availability"}
                    </Text>
                  </PressableScale>

                  <PressableScale
                    onPress={() =>
                      router.push(`/group-chat?groupId=${g.id}`)
                    }
                    style={styles.groupActionBtn}
                  >
                    <Text style={{ fontSize: 14 }}>💬</Text>
                    <Text style={styles.groupActionText}>Chat</Text>
                  </PressableScale>

                  {g.hasAvailability && (
                    <PressableScale
                      onPress={() =>
                        router.push(`/weekly-schedule?groupId=${g.id}`)
                      }
                      style={styles.groupActionBtn}
                    >
                      <Text style={{ fontSize: 14 }}>📅</Text>
                      <Text style={styles.groupActionText}>This Week</Text>
                    </PressableScale>
                  )}

                  <PressableScale
                    onPress={() =>
                      router.push(`/my-group?groupId=${g.id}`)
                    }
                    style={styles.groupActionBtn}
                  >
                    <Text style={{ fontSize: 14 }}>👥</Text>
                    <Text style={styles.groupActionText}>Members</Text>
                  </PressableScale>
                </View>
              </View>
            </FadeIn>
          ))
        : childName && (
            <FadeIn delay={80}>
              <View style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Text style={{ fontSize: 28 }}>📋</Text>
                </View>
                <Text style={styles.emptyTitle}>No carpool group yet</Text>
                <Text style={styles.emptyText}>
                  Your child hasn't joined a carpool group yet. They can create
                  or join one from their app.
                </Text>
              </View>
            </FadeIn>
          )}

      {/* Status Overview */}
      {hasGroups && (
        <FadeIn delay={180 + groups.length * 80}>
          <Text style={styles.sectionLabel}>STATUS OVERVIEW</Text>
          <View style={styles.statusCard}>
            {groups.map((g, idx) => (
              <View key={g.id}>
                {idx > 0 && <View style={styles.statusDivider} />}
                <View style={styles.statusGroupHeader}>
                  <Text style={styles.statusGroupName}>{g.name}</Text>
                </View>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: g.hasAvailability
                          ? Colors.success
                          : Colors.warm,
                      },
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {g.hasAvailability
                      ? "Availability set"
                      : "Availability not set"}
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          g.parentCount >= g.memberCount
                            ? Colors.success
                            : Colors.warm,
                      },
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {g.parentCount >= g.memberCount
                      ? "All parents joined"
                      : `${g.memberCount - g.parentCount} still need a parent`}
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          g.status === "active" ? Colors.success : Colors.info,
                      },
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {g.status === "active"
                      ? "Schedules running"
                      : "Group forming"}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </FadeIn>
      )}

      {/* Steps (no group, child linked) */}
      {!hasGroups && childName && (
        <FadeIn delay={200}>
          <Text style={styles.sectionLabel}>WHAT HAPPENS NEXT</Text>
          <View style={styles.stepsCard}>
            {[
              {
                title: "Your child creates or joins a group",
                sub: "They can find nearby students in the Discover tab",
              },
              {
                title: "You'll see the group here",
                sub: "Once they join, your dashboard updates automatically",
              },
              {
                title: "Set availability & the app handles the rest",
                sub: "AI builds a fair weekly driving schedule",
              },
            ].map((step, i) => (
              <View
                key={i}
                style={[styles.stepRow, i === 2 ? { marginBottom: 0 } : {}]}
              >
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepSub}>{step.sub}</Text>
                </View>
              </View>
            ))}
          </View>
        </FadeIn>
      )}

      {/* Tip */}
      <FadeIn delay={340}>
        <View style={styles.tipCard}>
          <Text style={{ fontSize: 16, marginRight: Spacing.md }}>💡</Text>
          <Text style={styles.tipText}>
            {hasGroups
              ? "Pull down to refresh. Tap any group card to see member details, addresses, and get directions."
              : "Pull down to refresh. Your child's groups will appear here once they join."}
          </Text>
        </View>
      </FadeIn>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.xl, paddingTop: 60, paddingBottom: 40 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  greeting: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: "600",
    marginBottom: 2,
  },
  name: {
    fontSize: FontSizes.xxl,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  groupCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  groupCardInner: { padding: Spacing.lg },
  groupTop: { flexDirection: "row", alignItems: "center" },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  groupName: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  groupSub: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  pill: {
    backgroundColor: Colors.warmFaded,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  pillActive: { backgroundColor: Colors.successFaded },
  pillText: { color: Colors.warm, fontSize: FontSizes.xs, fontWeight: "700" },
  pillActiveText: { color: Colors.success },
  schoolStrip: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    gap: 8,
  },
  schoolText: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    fontWeight: "500",
  },
  pickupStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgElevated,
    borderRadius: 10,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  pickupText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    flex: 1,
    marginLeft: 8,
  },
  pickupEdit: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: "600",
  },
  ctaStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  ctaStripText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.bg,
    flex: 1,
  },
  ctaStripArrow: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.bg,
  },
  groupActions: {
    flexDirection: "row",
    padding: Spacing.md,
    paddingTop: 0,
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  groupActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgElevated,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  groupActionText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: "600",
  },

  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xxl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  sectionLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.textTertiary,
    letterSpacing: 1,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },

  statusCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  statusGroupHeader: { marginBottom: Spacing.sm },
  statusGroupName: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  statusDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.md,
  },
  statusText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    flex: 1,
  },

  stepsCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
    marginTop: 1,
  },
  stepNumText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.primary,
  },
  stepTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  stepSub: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  tipCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.sm,
  },
  tipText: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    flex: 1,
    lineHeight: 19,
  },
});
