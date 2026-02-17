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
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.name}>{studentName || "Student"}</Text>
          </View>
          <PressableScale
            onPress={() => router.push("/settings")}
            style={styles.settingsBtn}
          >
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </PressableScale>
        </View>
      </ScaleIn>

      {/* Pending Invites */}
      {pendingInvites.length > 0 &&
        pendingInvites.map((invite: any, i: number) => (
          <FadeIn key={invite.id} delay={80 + i * 60}>
            <View style={styles.inviteCard}>
              <View style={styles.inviteBadge}>
                <Text style={{ fontSize: 16 }}>✉️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteLabel}>GROUP INVITE</Text>
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
                  style={styles.skipBtn}
                >
                  <Text style={styles.skipText}>Decline</Text>
                </PressableScale>
              </View>
            </View>
          </FadeIn>
        ))}

      {/* Group Cards */}
      {hasGroups ? (
        groups.map((g, idx) => (
          <FadeIn key={g.id} delay={140 + idx * 80}>
            <View style={styles.groupCard}>
              <PressableScale
                onPress={() => router.push(`/my-group?groupId=${g.id}`)}
                style={styles.groupCardInner}
              >
                <View style={styles.groupRow}>
                  <View style={styles.groupIcon}>
                    <Text style={{ fontSize: 20 }}>👥</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupName}>{g.name}</Text>
                    <Text style={styles.groupSub}>
                      {g.memberCount}{" "}
                      {g.memberCount === 1 ? "family" : "families"} ·{" "}
                      {g.parentsJoined} parent
                      {g.parentsJoined !== 1 ? "s" : ""}
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
                    <PressableScale
                      onPress={() => router.push("/setup-location")}
                      style={{}}
                    >
                      <Text style={styles.pickupEdit}>Edit</Text>
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
                  style={styles.groupActionBtn}
                >
                  <Text style={{ fontSize: 14 }}>💬</Text>
                  <Text style={styles.groupActionText}>Chat</Text>
                </PressableScale>
                <PressableScale
                  onPress={() =>
                    router.push(`/student-schedule?groupId=${g.id}`)
                  }
                  style={styles.groupActionBtn}
                >
                  <Text style={{ fontSize: 14 }}>📅</Text>
                  <Text style={styles.groupActionText}>Schedule</Text>
                </PressableScale>
                {g.status === "active" && (
                  <PressableScale
                    onPress={() =>
                      router.push(`/weekly-schedule?groupId=${g.id}`)
                    }
                    style={styles.groupActionBtn}
                  >
                    <Text style={{ fontSize: 14 }}>🗓️</Text>
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
      ) : (
        <FadeIn delay={140}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Text style={{ fontSize: 28 }}>🚗</Text>
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
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.grid}>
          <PressableScale
            onPress={() => router.push("/create-group")}
            style={[styles.tile, !hasGroups ? styles.tilePrimary : {}]}
          >
            <View style={styles.tileIconWrap}>
              <Text style={{ fontSize: 22 }}>✨</Text>
            </View>
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
            <View style={styles.tileIconWrap}>
              <Text style={{ fontSize: 22 }}>🔍</Text>
            </View>
            <Text style={styles.tileTitle}>Discover</Text>
            <Text style={styles.tileSub}>Nearby students</Text>
          </PressableScale>
        </View>
      </FadeIn>

      {/* Nudge */}
      {hasGroups && groups.some((g) => g.parentsJoined < g.memberCount) && (
        <FadeIn delay={320}>
          <View style={styles.nudge}>
            <Text style={{ fontSize: 16, marginRight: Spacing.md }}>📢</Text>
            <View style={{ flex: 1 }}>
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
          <Text style={styles.sectionLabel}>HOW RIDEPOOL WORKS</Text>
          <View style={styles.stepsCard}>
            {[
              {
                title: "Create or join a carpool group",
                sub: "Find nearby students in the Discover tab",
              },
              {
                title: "Each student's parent signs up",
                sub: "They link to their child's account",
              },
              {
                title: "AI builds a fair weekly schedule",
                sub: "Parents set availability, the app does the rest",
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
      <FadeIn delay={380}>
        <View style={styles.tipCard}>
          <Text style={{ fontSize: 16, marginRight: Spacing.md }}>💡</Text>
          <Text style={styles.tipText}>
            {hasGroups
              ? "Pull down to refresh. You can be in multiple groups — each one gets its own schedule."
              : "Pull down to refresh. Once you create or join a group, more options appear here."}
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

  inviteCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    flexDirection: "row",
    alignItems: "center",
  },
  inviteBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  inviteLabel: {
    fontSize: FontSizes.xs,
    color: Colors.primary,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 1,
  },
  inviteName: {
    fontSize: FontSizes.base,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 1,
  },
  inviteFrom: { fontSize: FontSizes.sm, color: Colors.textSecondary },
  inviteBtns: { flexDirection: "column", gap: 6, marginLeft: Spacing.md },
  joinBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  joinText: { color: Colors.bg, fontSize: FontSizes.sm, fontWeight: "700" },
  skipBtn: { paddingVertical: 4, alignItems: "center" },
  skipText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    fontWeight: "600",
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
  groupRow: { flexDirection: "row", alignItems: "center" },
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
    marginBottom: Spacing.lg,
  },
  emptyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  emptyBtnText: {
    color: Colors.bg,
    fontSize: FontSizes.md,
    fontWeight: "700",
  },

  sectionLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.textTertiary,
    letterSpacing: 1,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  tile: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    width: TILE_W,
    minHeight: 130,
    justifyContent: "space-between",
  },
  tilePrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tileIconWrap: { marginBottom: Spacing.md },
  tileTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  tileSub: { fontSize: FontSizes.xs, color: Colors.textTertiary },

  nudge: {
    backgroundColor: Colors.warmFaded,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255,170,68,0.25)",
  },
  nudgeTitle: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.warm,
    marginBottom: 2,
  },
  nudgeText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
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
