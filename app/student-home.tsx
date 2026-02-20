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
  parentsJoined: number;
  isAdmin: boolean;
}

export default function StudentHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentName, setStudentName] = useState("");
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      checkProfile();
    }, [])
  );

  const checkProfile = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const user = await getValidUser();
      if (!user) {
        handleLogout(router);
        return;
      }

      const { data: student } = await supabase
        .from("students")
        .select("id, name, saved_pickup_lat, saved_pickup_address")
        .eq("id", user.id)
        .single();

      if (student && !student.saved_pickup_lat) {
        router.replace("/setup-location");
        return;
      }

      setStudentName(student?.name?.split(" ")[0] || "");
      setPickupAddress(student?.saved_pickup_address || null);

      const { data: memberships } = await supabase
        .from("group_members")
        .select(`group_id, role, carpool_groups ( id, name, status )`)
        .eq("student_id", student?.id)
        .eq("status", "active");

      const localDeleted = deletedGroups.getAll();

      const groupList: GroupInfo[] = [];
      for (const membership of memberships || []) {
        const group = (membership as any).carpool_groups;
        if (!group || group.status === "deleted") continue;
        if (localDeleted.includes(group.id)) continue;

        const { data: members } = await supabase
          .from("group_members")
          .select("id, parent_id")
          .eq("group_id", group.id)
          .eq("status", "active");

        groupList.push({
          id: group.id,
          name: group.name,
          status: group.status,
          memberCount: (members || []).length,
          parentsJoined: (members || []).filter((m: any) => m.parent_id).length,
          isAdmin: membership.role === "admin",
        });
      }
      setGroups(groupList);

      const { data: invites } = await supabase
        .from("group_invites")
        .select(
          `id, group_id, status, carpool_groups ( name ), invited_by_student:students!group_invites_invited_by_fkey ( name )`
        )
        .eq("invited_student_id", student?.id)
        .eq("status", "pending");

      setPendingInvites(invites || []);
      setLoading(false);
      setRefreshing(false);
    } catch (err: any) {
      setLoading(false);
      setRefreshing(false);
      if (
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("Network request failed")
      ) {
        Alert.alert("No Internet", "Please check your internet connection.", [
          { text: "Retry", onPress: () => checkProfile() },
        ]);
      } else {
        Alert.alert("Error", "Something went wrong.", [
          { text: "Retry", onPress: () => checkProfile() },
        ]);
      }
    }
  };

  const handleInviteResponse = async (
    inviteId: string,
    groupId: string,
    accept: boolean
  ) => {
    try {
      const user = await getValidUser();
      if (!user) {
        handleLogout(router);
        return;
      }
      await supabase
        .from("group_invites")
        .update({ status: accept ? "accepted" : "declined" })
        .eq("id", inviteId);
      if (accept) {
        await supabase.from("group_members").insert({
          group_id: groupId,
          student_id: user.id,
          role: "member",
          status: "active",
        });
        Alert.alert("Joined!", "You're now part of the carpool group.");
      }
      checkProfile();
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
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
          onRefresh={() => checkProfile(true)}
          tintColor={Colors.primary}
        />
      }
    >
      {/* Header */}
      <ScaleIn>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.name}>{studentName || "Student"}</Text>
          </View>
          <PressableScale
            onPress={() => router.push("/settings")}
            style={styles.settingsBtn}
          >
            <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
          </PressableScale>
        </View>
      </ScaleIn>

      {/* Pending Invites */}
      {pendingInvites.length > 0 &&
        pendingInvites.map((invite: any, i: number) => (
          <FadeIn key={invite.id} delay={80 + i * 60}>
            <View style={styles.inviteCard}>
              <View style={styles.inviteAccent} />
              <View style={styles.inviteBody}>
                <View style={styles.inviteContent}>
                  <Ionicons name="mail-outline" size={18} color={Colors.primary} style={{ marginBottom: 4 }} />
                  <Text style={styles.inviteLabel}>Invite</Text>
                  <Text style={styles.inviteName}>
                    {invite.carpool_groups?.name || "Carpool Group"}
                  </Text>
                  <Text style={styles.inviteFrom}>
                    from{" "}
                    {(invite.invited_by_student as any)?.name || "a classmate"}
                  </Text>
                </View>
                <View style={styles.inviteBtns}>
                  <PressableScale
                    onPress={() =>
                      handleInviteResponse(invite.id, invite.group_id, true)
                    }
                    style={styles.joinBtn}
                  >
                    <Text style={styles.joinText}>Join</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() =>
                      handleInviteResponse(invite.id, invite.group_id, false)
                    }
                    style={styles.declineBtn}
                  >
                    <Text style={styles.declineText}>Decline</Text>
                  </PressableScale>
                </View>
              </View>
            </View>
          </FadeIn>
        ))}

      {/* Group Cards */}
      {hasGroups ? (
        groups.map((g, idx) => (
          <FadeIn key={g.id} delay={140 + idx * 80}>
            <View style={styles.groupCard}>
              <View style={styles.groupBody}>
                <PressableScale
                  onPress={() => router.push(`/my-group?groupId=${g.id}`)}
                  style={styles.groupCardInner}
                >
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
                        {g.parentsJoined} parent
                        {g.parentsJoined !== 1 ? "s" : ""}
                      </Text>
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
                      <PressableScale
                        onPress={() => router.push("/setup-location")}
                        style={styles.pickupEditBtn}
                      >
                        <Text style={styles.pickupEditText}>Edit</Text>
                      </PressableScale>
                    </View>
                  )}
                </PressableScale>

                {/* Inline actions */}
                <View style={styles.groupActions}>
                  <PressableScale
                    onPress={() =>
                      router.push(`/group-chat?groupId=${g.id}`)
                    }
                    style={styles.actionPill}
                  >
                    <Ionicons name="chatbubble-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.actionPillText}>Chat</Text>
                  </PressableScale>
                  <PressableScale
                    onPress={() =>
                      router.push(`/student-schedule?groupId=${g.id}`)
                    }
                    style={styles.actionPill}
                  >
                    <Ionicons name="calendar-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.actionPillText}>Schedule</Text>
                  </PressableScale>
                  {g.status === "active" && (
                    <PressableScale
                      onPress={() =>
                        router.push(`/weekly-schedule?groupId=${g.id}`)
                      }
                      style={styles.actionPill}
                    >
                      <Ionicons name="today-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 4 }} />
                      <Text style={styles.actionPillText}>This Week</Text>
                    </PressableScale>
                  )}
                  <PressableScale
                    onPress={() =>
                      router.push(`/my-group?groupId=${g.id}`)
                    }
                    style={styles.actionPill}
                  >
                    <Ionicons name="people-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.actionPillText}>Members</Text>
                  </PressableScale>
                </View>
              </View>
            </View>
          </FadeIn>
        ))
      ) : (
        <FadeIn delay={140}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="people-outline" size={32} color={Colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No carpool group yet</Text>
            <Text style={styles.emptyText}>
              Create a group and invite nearby students, or wait for an invite.
            </Text>
            <PressableScale
              onPress={() => router.push("/create-group")}
              style={styles.emptyBtn}
            >
              <Text style={styles.emptyBtnText}>Create Group</Text>
            </PressableScale>
          </View>
        </FadeIn>
      )}

      {/* Quick Actions */}
      <FadeIn delay={hasGroups ? 220 + groups.length * 80 : 220}>
        <Text style={styles.sectionLabel}>Quick actions</Text>
        <View style={styles.grid}>
          <PressableScale
            onPress={() => router.push("/create-group")}
            style={[styles.tile, !hasGroups ? styles.tilePrimary : {}]}
          >
            <Ionicons name="add-circle-outline" size={28} color={!hasGroups ? Colors.bg : Colors.primary} style={{ marginBottom: 8 }} />
            <Text
              style={[
                styles.tileTitle,
                !hasGroups ? { color: Colors.bg } : {},
              ]}
            >
              {hasGroups ? "New Group" : "Create Group"}
            </Text>
            <Text
              style={[
                styles.tileSub,
                !hasGroups ? { color: "rgba(15,17,32,0.5)" } : {},
              ]}
            >
              Start a carpool
            </Text>
          </PressableScale>

          <PressableScale
            onPress={() => router.push("/discover")}
            style={styles.tile}
          >
            <Ionicons name="compass-outline" size={28} color={Colors.primary} style={{ marginBottom: 8 }} />
            <Text style={styles.tileTitle}>Discover</Text>
            <Text style={styles.tileSub}>Nearby students</Text>
          </PressableScale>
        </View>
      </FadeIn>

      {/* Nudge */}
      {hasGroups && groups.some((g) => g.parentsJoined < g.memberCount) && (
        <FadeIn delay={320}>
          <View style={styles.nudge}>
            <Ionicons name="alert-circle-outline" size={20} color={Colors.warm} style={{ marginTop: 1, marginRight: Spacing.md }} />
            <View style={styles.nudgeContent}>
              <Text style={styles.nudgeTitle}>Waiting on parents</Text>
              <Text style={styles.nudgeText}>
                Some families still need a parent to join. Remind them to
                download the app!
              </Text>
            </View>
          </View>
        </FadeIn>
      )}

      {/* How it works (no groups) */}
      {!hasGroups && (
        <FadeIn delay={320}>
          <Text style={styles.sectionLabel}>How RidePool works</Text>
          <View style={styles.stepsCard}>
            {([
              {
                icon: "people-outline" as const,
                title: "Create or join a carpool group",
                sub: "Find nearby students in the Discover tab",
              },
              {
                icon: "person-add-outline" as const,
                title: "Each student's parent signs up",
                sub: "They link to their child's account",
              },
              {
                icon: "sparkles" as const,
                title: "AI builds a fair weekly schedule",
                sub: "Parents set availability, the app does the rest",
              },
            ] as const).map((step, i) => (
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
      <FadeIn delay={380}>
        <View style={styles.tipCard}>
          <Ionicons name="bulb-outline" size={16} color={Colors.textTertiary} style={{ marginRight: 8, marginTop: 1 }} />
          <Text style={[styles.tipText, { flex: 1 }]}>
            {hasGroups
              ? "Pull down to refresh. You can be in multiple groups -- each one gets its own schedule."
              : "Pull down to refresh. Once you create or join a group, more options appear here."}
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
  /* ---- Invites ---- */
  inviteCard: {
    flexDirection: "row",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    overflow: "hidden",
  },
  inviteAccent: {
    width: 3,
    backgroundColor: Colors.primary,
  },
  inviteBody: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.base,
    paddingLeft: Spacing.lg,
  },
  inviteContent: {
    flex: 1,
  },
  inviteLabel: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  inviteName: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  inviteFrom: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  inviteBtns: {
    flexDirection: "column",
    gap: 6,
    marginLeft: Spacing.base,
  },
  joinBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  joinText: {
    color: Colors.bg,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  declineBtn: {
    paddingVertical: 4,
    alignItems: "center",
  },
  declineText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    fontWeight: "500",
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
  groupRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
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
    marginRight: Spacing.md,
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
  pickupEditBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  pickupEditText: {
    fontSize: FontSizes.sm,
    color: Colors.primary,
    fontWeight: "600",
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
    marginBottom: Spacing.lg,
  },
  emptyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  emptyBtnText: {
    color: Colors.bg,
    fontSize: FontSizes.md,
    fontWeight: "600",
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

  /* ---- Quick Action Tiles ---- */
  grid: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  tile: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    paddingTop: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    width: TILE_W,
    justifyContent: "flex-start",
    minHeight: 110,
  },
  tilePrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tileTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  tileSub: {
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },

  /* ---- Nudge ---- */
  nudge: {
    backgroundColor: Colors.warmFaded,
    borderRadius: Radius.md,
    padding: Spacing.base,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warmBorder,
  },
  nudgeContent: {
    flex: 1,
  },
  nudgeTitle: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.warm,
    marginBottom: 3,
  },
  nudgeText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
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
