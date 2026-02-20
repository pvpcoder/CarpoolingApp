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
import { Ionicons } from "@expo/vector-icons";
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
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.name}>{parentName || "Parent"}</Text>
          </View>
          <PressableScale
            onPress={() => router.push("/settings")}
            style={styles.settingsBtn}
          >
            <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
          </PressableScale>
        </View>
      </ScaleIn>

      {/* No child linked */}
      {!childName && (
        <FadeIn delay={80}>
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={20} color={Colors.warm} style={{ marginBottom: 8 }} />
            <Text style={styles.warningTitle}>No child linked</Text>
            <Text style={styles.warningText}>
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
                <View style={styles.groupBody}>
                  <PressableScale
                    onPress={() => router.push(`/my-group?groupId=${g.id}`)}
                    style={styles.groupCardInner}
                  >
                    <View style={styles.groupTop}>
                      <View style={styles.groupRow}>
                        <View style={styles.groupAvatarWrap}>
                          <Ionicons name="people" size={18} color={g.status === "active" ? Colors.primary : Colors.warm} />
                        </View>
                        <View style={styles.groupMeta}>
                          <Text style={styles.groupName}>{g.name}</Text>
                          <Text style={styles.groupSub}>
                            {g.memberCount}{" "}
                            {g.memberCount === 1 ? "family" : "families"}
                            {"  "}
                            <Text style={styles.groupSubDivider}>/</Text>
                            {"  "}
                            {g.parentCount} parent{g.parentCount !== 1 ? "s" : ""}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          g.status === "active"
                            ? styles.statusBadgeActive
                            : styles.statusBadgeForming,
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor:
                                g.status === "active"
                                  ? Colors.primary
                                  : Colors.warm,
                            },
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusBadgeText,
                            {
                              color:
                                g.status === "active"
                                  ? Colors.primary
                                  : Colors.warm,
                            },
                          ]}
                        >
                          {g.status === "forming" ? "Forming" : "Active"}
                        </Text>
                      </View>
                    </View>

                    {/* School destination */}
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Destination</Text>
                      <Text style={styles.detailValue}>{SCHOOL.name}</Text>
                    </View>

                    {pickupAddress && idx === 0 && (
                      <View style={styles.pickupRow}>
                        <View style={styles.pickupInfo}>
                          <Text style={styles.detailLabel}>Pickup</Text>
                          <Text style={styles.pickupValue} numberOfLines={1}>
                            {pickupAddress}
                          </Text>
                        </View>
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
                      <Ionicons name="time-outline" size={16} color={Colors.bg} style={{ marginRight: 8 }} />
                      <Text style={styles.ctaStripText}>
                        Set your availability
                      </Text>
                      <Ionicons name="arrow-forward" size={18} color={Colors.bg} />
                    </PressableScale>
                  )}

                  {/* Inline quick actions */}
                  <View style={styles.groupActions}>
                    <PressableScale
                      onPress={() =>
                        router.push(`/availability?groupId=${g.id}`)
                      }
                      style={styles.actionPill}
                    >
                      <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} style={{marginRight: 4}} />
                      <Text style={styles.actionPillText}>
                        {g.hasAvailability ? "Edit" : "Availability"}
                      </Text>
                    </PressableScale>

                    <PressableScale
                      onPress={() =>
                        router.push(`/group-chat?groupId=${g.id}`)
                      }
                      style={styles.actionPill}
                    >
                      <Ionicons name="chatbubble-outline" size={14} color={Colors.textSecondary} style={{marginRight: 4}} />
                      <Text style={styles.actionPillText}>Chat</Text>
                    </PressableScale>

                    {g.hasAvailability && (
                      <PressableScale
                        onPress={() =>
                          router.push(`/weekly-schedule?groupId=${g.id}`)
                        }
                        style={styles.actionPill}
                      >
                        <Ionicons name="today-outline" size={14} color={Colors.textSecondary} style={{marginRight: 4}} />
                        <Text style={styles.actionPillText}>This Week</Text>
                      </PressableScale>
                    )}

                    <PressableScale
                      onPress={() =>
                        router.push(`/my-group?groupId=${g.id}`)
                      }
                      style={styles.actionPill}
                    >
                      <Ionicons name="people-outline" size={14} color={Colors.textSecondary} style={{marginRight: 4}} />
                      <Text style={styles.actionPillText}>Members</Text>
                    </PressableScale>
                  </View>
                </View>
              </View>
            </FadeIn>
          ))
        : childName && (
            <FadeIn delay={80}>
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="people-outline" size={32} color={Colors.textTertiary} />
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
          <Text style={styles.sectionLabel}>Status overview</Text>
          <View style={styles.statusCard}>
            {groups.map((g, idx) => (
              <View key={g.id}>
                {idx > 0 && <View style={styles.statusDivider} />}
                <View style={styles.statusGroupHeader}>
                  <Text style={styles.statusGroupName}>{g.name}</Text>
                </View>
                <View style={styles.statusRow}>
                  <Ionicons
                    name={g.hasAvailability ? "checkmark-circle" : "alert-circle-outline"}
                    size={16}
                    color={g.hasAvailability ? Colors.success : Colors.warm}
                    style={{ marginRight: Spacing.md }}
                  />
                  <Text style={styles.statusText}>
                    {g.hasAvailability
                      ? "Availability set"
                      : "Availability not set"}
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <Ionicons
                    name={g.parentCount >= g.memberCount ? "checkmark-circle" : "alert-circle-outline"}
                    size={16}
                    color={g.parentCount >= g.memberCount ? Colors.success : Colors.warm}
                    style={{ marginRight: Spacing.md }}
                  />
                  <Text style={styles.statusText}>
                    {g.parentCount >= g.memberCount
                      ? "All parents joined"
                      : `${g.memberCount - g.parentCount} still need a parent`}
                  </Text>
                </View>
                <View style={styles.statusRow}>
                  <Ionicons
                    name={g.status === "active" ? "checkmark-circle" : "information-circle-outline"}
                    size={16}
                    color={g.status === "active" ? Colors.success : Colors.info}
                    style={{ marginRight: Spacing.md }}
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
          <Text style={styles.sectionLabel}>What happens next</Text>
          <View style={styles.stepsCard}>
            {([
              {
                icon: "people-outline" as const,
                title: "Your child creates or joins a group",
                sub: "They can find nearby students in the Discover tab",
              },
              {
                icon: "eye-outline" as const,
                title: "You'll see the group here",
                sub: "Once they join, your dashboard updates automatically",
              },
              {
                icon: "sparkles" as const,
                title: "Set availability & the app handles the rest",
                sub: "AI builds a fair weekly driving schedule",
              },
            ]).map((step, i) => (
              <View
                key={i}
                style={[styles.stepRow, i === 2 ? { marginBottom: 0 } : {}]}
              >
                <View style={styles.stepNum}>
                  <Ionicons name={step.icon} size={14} color={Colors.primary} />
                </View>
                <View style={styles.stepContent}>
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
          <Ionicons name="bulb-outline" size={16} color={Colors.textTertiary} style={{ marginRight: 8, marginTop: 1 }} />
          <Text style={[styles.tipText, { flex: 1 }]}>
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
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    padding: Spacing.xl,
    paddingTop: 60,
    paddingBottom: 40,
  },

  /* ---- Header ---- */
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xxl,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    fontWeight: "500",
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  name: {
    fontSize: FontSizes.xxl,
    fontWeight: "700",
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  /* ---- Warning (no child) ---- */
  warningCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.warmBorder,
    padding: Spacing.lg,
  },
  warningTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  warningText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  /* ---- Group Cards ---- */
  groupCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupBody: {
    flex: 1,
  },
  groupCardInner: {
    padding: Spacing.base,
    paddingBottom: Spacing.md,
  },
  groupTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: Spacing.md,
  },
  groupAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  groupMeta: {
    flex: 1,
  },
  groupName: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  groupSub: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  groupSubDivider: {
    color: Colors.textTertiary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    gap: 6,
  },
  statusBadgeActive: {
    backgroundColor: Colors.primaryFaded,
  },
  statusBadgeForming: {
    backgroundColor: Colors.warmFaded,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  detailLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    width: 80,
  },
  detailValue: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: "500",
    flex: 1,
  },
  pickupRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  pickupInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: Spacing.sm,
  },
  pickupValue: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: "500",
    flex: 1,
  },
  pickupEdit: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: "600",
  },

  /* ---- Availability CTA ---- */
  ctaStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    paddingVertical: 11,
    paddingHorizontal: Spacing.base,
  },
  ctaStripText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.bg,
    flex: 1,
  },

  /* ---- Group Actions ---- */
  groupActions: {
    flexDirection: "row",
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionPillText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: "500",
  },

  /* ---- Empty State ---- */
  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.xxl,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  /* ---- Section Labels ---- */
  sectionLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.textTertiary,
    letterSpacing: 0.3,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
    textTransform: "uppercase",
  },

  /* ---- Status Overview ---- */
  statusCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  statusGroupHeader: {
    marginBottom: Spacing.sm,
  },
  statusGroupName: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
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
  statusText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    flex: 1,
  },

  /* ---- Steps ---- */
  stepsCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
    marginTop: 1,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  stepSub: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
  },

  /* ---- Tip ---- */
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.sm,
  },
  tipText: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    lineHeight: 19,
  },
});
