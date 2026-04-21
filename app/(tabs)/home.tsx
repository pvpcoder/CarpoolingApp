import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../../lib/supabase";
import { getValidUser, handleLogout } from "../../lib/helpers";
import { deletedGroups } from "../../lib/deletedGroups";
import { Colors, Spacing, Radius, FontSizes, Shadows, Gradients } from "../../lib/theme";
import {
  FadeIn,
  ScaleIn,
  PressableScale,
  IconButton,
  LoadingScreen,
} from "../../components/UI";
import { SCHOOL } from "../../lib/config";

interface GroupInfo {
  id: string;
  name: string;
  status: string;
  memberCount: number;
  parentsJoined: number;
  isAdmin: boolean;
  hasAvailability?: boolean;
}

export default function HomeTab() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<"student" | "parent" | null>(null);
  const [userName, setUserName] = useState("");
  const [childName, setChildName] = useState<string | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [schedulesByGroup, setSchedulesByGroup] = useState<Record<string, any[]>>({});
  const [parentNames, setParentNames] = useState<Record<string, string>>({});
  const [todaySlot, setTodaySlot] = useState<any>(null);
  const [todayDriverName, setTodayDriverName] = useState<string | null>(null);

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

      // Check if student
      const { data: student } = await supabase
        .from("students")
        .select("id, name, saved_pickup_lat, saved_pickup_address")
        .eq("id", user.id)
        .single();

      if (student) {
        setRole("student");
        if (!student.saved_pickup_lat) {
          router.replace("/setup-location");
          return;
        }
        setUserName(student.name?.split(" ")[0] || "");
        setPickupAddress(student.saved_pickup_address || null);
        await loadStudentData(student);
      } else {
        // Check if parent
        const { data: parent } = await supabase
          .from("parents")
          .select("id, name, student_id")
          .eq("id", user.id)
          .single();

        if (parent) {
          setRole("parent");
          setUserName(parent.name?.split(" ")[0] || "");
          await loadParentData(parent);
        }
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
        Alert.alert("No Internet", "Please check your internet connection.", [
          { text: "Retry", onPress: () => loadData() },
        ]);
      } else {
        Alert.alert("Error", "Something went wrong.", [
          { text: "Retry", onPress: () => loadData() },
        ]);
      }
    }
  };

  const loadStudentData = async (student: any) => {
    const { data: memberships } = await supabase
      .from("group_members")
      .select(`group_id, role, carpool_groups ( id, name, status )`)
      .eq("student_id", student.id)
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

    const seen = new Set<string>();
    const uniqueGroups = groupList.filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    });
    setGroups(uniqueGroups);

    // Load schedules
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
    const weekStart = monday.toISOString().split("T")[0];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const todayName = dayNames[today.getDay()];

    const schedMap: Record<string, any[]> = {};
    const pNames: Record<string, string> = {};

    for (const g of uniqueGroups) {
      const { data: sched } = await supabase
        .from("weekly_schedules")
        .select("id")
        .eq("group_id", g.id)
        .eq("week_start_date", weekStart)
        .single();

      if (sched) {
        const { data: slots } = await supabase
          .from("schedule_slots")
          .select("day_of_week, slot_type, driver_parent_id, departure_time, status")
          .eq("schedule_id", sched.id)
          .order("day_of_week");
        schedMap[g.id] = slots || [];

        const parentIds = (slots || [])
          .map((s: any) => s.driver_parent_id)
          .filter(Boolean);
        if (parentIds.length > 0) {
          const { data: parents } = await supabase
            .from("parents")
            .select("id, name")
            .in("id", parentIds);
          (parents || []).forEach((p: any) => { pNames[p.id] = p.name; });
        }

        // Find today's ride
        const todaySlots = (slots || []).filter((s: any) => s.day_of_week === todayName);
        const morning = todaySlots.find((s: any) => s.slot_type === "morning");
        if (morning?.driver_parent_id && !todaySlot) {
          setTodaySlot(morning);
          setTodayDriverName(pNames[morning.driver_parent_id] || "Assigned");
        }
      }
    }
    setSchedulesByGroup(schedMap);
    setParentNames(pNames);

    // Load invites
    const { data: invites } = await supabase
      .from("group_invites")
      .select(
        `id, group_id, status, carpool_groups ( name ), invited_by_student:students!group_invites_invited_by_fkey ( name )`
      )
      .eq("invited_student_id", student.id)
      .eq("status", "pending");

    setPendingInvites(invites || []);
  };

  const loadParentData = async (parent: any) => {
    if (!parent.student_id) return;

    const { data: child } = await supabase
      .from("students")
      .select("name, saved_pickup_address")
      .eq("id", parent.student_id)
      .single();
    setChildName(child?.name || null);
    setPickupAddress(child?.saved_pickup_address || null);

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
        parentsJoined: (members || []).filter((m: any) => m.parent_id).length,
        isAdmin: false,
        hasAvailability: (availability || []).length > 0,
      });
    }

    const seen = new Set<string>();
    const uniqueGroups = groupList.filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    });
    setGroups(uniqueGroups);
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
        const { error: joinError } = await supabase.from("group_members").insert({
          group_id: groupId,
          student_id: user.id,
          role: "member",
          status: "active",
        });
        if (joinError) {
          Alert.alert("Error", "Couldn't join the group: " + joinError.message);
          return;
        }
        Alert.alert("Joined!", "You're now part of the carpool group.");
      }
      loadData();
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
          onRefresh={() => loadData(true)}
          tintColor={Colors.primary}
        />
      }
    >
      {/* ─── Hero Header ─── */}
      <LinearGradient
        colors={Gradients.hero as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <ScaleIn>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.heroName}>{userName || (role === "student" ? "Student" : "Parent")}</Text>
          {role === "parent" && childName && (
            <Text style={styles.heroSub}>Linked to {childName}</Text>
          )}
        </ScaleIn>
      </LinearGradient>

      <View style={styles.body}>
        {/* ─── Today's Ride (student) ─── */}
        {role === "student" && todaySlot && todayDriverName && (
          <FadeIn delay={80}>
            <View style={styles.todayCard}>
              <View style={styles.todayAccent} />
              <View style={styles.todayBody}>
                <View style={styles.todayTop}>
                  <Ionicons name="car" size={18} color={Colors.primary} />
                  <Text style={styles.todayLabel}>Today's Ride</Text>
                </View>
                <Text style={styles.todayDriver}>{todayDriverName}</Text>
                {todaySlot.departure_time && (
                  <Text style={styles.todayTime}>
                    {todaySlot.departure_time.slice(0, 5)} pickup
                  </Text>
                )}
              </View>
            </View>
          </FadeIn>
        )}

        {/* ─── No child linked (parent) ─── */}
        {role === "parent" && !childName && (
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

        {/* ─── Pending Invites ─── */}
        {pendingInvites.length > 0 &&
          pendingInvites.map((invite: any, i: number) => (
            <FadeIn key={invite.id} delay={100 + i * 60}>
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
                      from {(invite.invited_by_student as any)?.name || "a classmate"}
                    </Text>
                  </View>
                  <View style={styles.inviteBtns}>
                    <PressableScale
                      onPress={() => handleInviteResponse(invite.id, invite.group_id, true)}
                      style={styles.joinBtn}
                    >
                      <Text style={styles.joinText}>Join</Text>
                    </PressableScale>
                    <PressableScale
                      onPress={() => handleInviteResponse(invite.id, invite.group_id, false)}
                      style={styles.declineBtn}
                    >
                      <Text style={styles.declineText}>Decline</Text>
                    </PressableScale>
                  </View>
                </View>
              </View>
            </FadeIn>
          ))}

        {/* ─── Group Cards ─── */}
        {hasGroups ? (
          groups.map((g, idx) => (
            <FadeIn key={g.id} delay={140 + idx * 80}>
              <PressableScale
                onPress={() => router.push(`/my-group?groupId=${g.id}`)}
                style={styles.groupCard}
              >
                {/* Top row */}
                <View style={styles.groupTop}>
                  <View style={styles.groupAvatarWrap}>
                    <Ionicons name="people" size={18} color={g.status === "active" ? Colors.primary : Colors.warm} />
                  </View>
                  <View style={styles.groupMeta}>
                    <Text style={styles.groupName}>{g.name}</Text>
                    <Text style={styles.groupSub}>
                      {g.memberCount} {g.memberCount === 1 ? "family" : "families"}
                      {"  ·  "}
                      {g.parentsJoined} parent{g.parentsJoined !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      g.status === "active" ? styles.statusActive : styles.statusForming,
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: g.status === "active" ? Colors.primary : Colors.warm },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusText,
                        { color: g.status === "active" ? Colors.primary : Colors.warm },
                      ]}
                    >
                      {g.status === "forming" ? "Forming" : "Active"}
                    </Text>
                  </View>
                </View>

                {/* Info rows */}
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>School</Text>
                  <Text style={styles.infoValue}>{SCHOOL.name}</Text>
                </View>

                {pickupAddress && idx === 0 && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Pickup</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>{pickupAddress}</Text>
                  </View>
                )}

                {/* Availability CTA for parents */}
                {role === "parent" && !g.hasAvailability && (
                  <PressableScale
                    onPress={() => router.push(`/availability?groupId=${g.id}`)}
                    style={styles.availCta}
                  >
                    <Ionicons name="time-outline" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.availCtaText}>Set your availability</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </PressableScale>
                )}

                {/* Icon button actions */}
                <View style={styles.actionRow}>
                  <IconButton
                    icon="chatbubble-outline"
                    label="Chat"
                    onPress={() => router.push(`/group-chat?groupId=${g.id}`)}
                  />
                  <IconButton
                    icon="calendar-outline"
                    label={role === "parent" ? "Availability" : "Schedule"}
                    onPress={() =>
                      role === "parent"
                        ? router.push(`/availability?groupId=${g.id}`)
                        : router.push(`/student-schedule?groupId=${g.id}`)
                    }
                  />
                  {g.status === "active" && (
                    <IconButton
                      icon="today-outline"
                      label="This Week"
                      onPress={() => router.push(`/weekly-schedule?groupId=${g.id}`)}
                    />
                  )}
                  <IconButton
                    icon="people-outline"
                    label="Members"
                    onPress={() => router.push(`/my-group?groupId=${g.id}`)}
                  />
                </View>
              </PressableScale>
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
                {role === "student"
                  ? "Create a group and invite nearby students, or wait for an invite."
                  : "Your child hasn't joined a carpool group yet. They can create or join one from their app."}
              </Text>
              {role === "student" && (
                <PressableScale
                  onPress={() => router.push("/create-group")}
                  style={styles.emptyBtn}
                >
                  <Text style={styles.emptyBtnText}>Create Group</Text>
                </PressableScale>
              )}
            </View>
          </FadeIn>
        )}

        {/* ─── Quick Actions (student) ─── */}
        {role === "student" && (
          <FadeIn delay={hasGroups ? 220 + groups.length * 80 : 220}>
            <Text style={styles.sectionLabel}>Quick actions</Text>
            <View style={styles.quickGrid}>
              <PressableScale
                onPress={() => router.push("/create-group")}
                style={[styles.quickTile, !hasGroups && styles.quickTilePrimary]}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={26}
                  color={!hasGroups ? "#FFFFFF" : Colors.primary}
                  style={{ marginBottom: 8 }}
                />
                <Text style={[styles.quickTitle, !hasGroups && { color: "#FFFFFF" }]}>
                  {hasGroups ? "New Group" : "Create Group"}
                </Text>
                <Text style={[styles.quickSub, !hasGroups && { color: "rgba(255,255,255,0.6)" }]}>
                  Start a carpool
                </Text>
              </PressableScale>

              {hasGroups && (
                <PressableScale
                  onPress={() => router.push("/setup-location")}
                  style={styles.quickTile}
                >
                  <Ionicons
                    name="location-outline"
                    size={26}
                    color={Colors.info}
                    style={{ marginBottom: 8 }}
                  />
                  <Text style={styles.quickTitle}>Edit Pickup</Text>
                  <Text style={styles.quickSub}>Change your spot</Text>
                </PressableScale>
              )}
            </View>
          </FadeIn>
        )}

        {/* ─── Parent Status Overview ─── */}
        {role === "parent" && hasGroups && (
          <FadeIn delay={180 + groups.length * 80}>
            <Text style={styles.sectionLabel}>Status overview</Text>
            <View style={styles.statusCard}>
              {groups.map((g, idx) => (
                <View key={g.id}>
                  {idx > 0 && <View style={styles.statusDivider} />}
                  <Text style={styles.statusGroupName}>{g.name}</Text>
                  <View style={styles.statusRow}>
                    <Ionicons
                      name={g.hasAvailability ? "checkmark-circle" : "alert-circle-outline"}
                      size={16}
                      color={g.hasAvailability ? Colors.success : Colors.warm}
                      style={{ marginRight: Spacing.md }}
                    />
                    <Text style={styles.statusRowText}>
                      {g.hasAvailability ? "Availability set" : "Availability not set"}
                    </Text>
                  </View>
                  <View style={styles.statusRow}>
                    <Ionicons
                      name={g.parentsJoined >= g.memberCount ? "checkmark-circle" : "alert-circle-outline"}
                      size={16}
                      color={g.parentsJoined >= g.memberCount ? Colors.success : Colors.warm}
                      style={{ marginRight: Spacing.md }}
                    />
                    <Text style={styles.statusRowText}>
                      {g.parentsJoined >= g.memberCount
                        ? "All parents joined"
                        : `${g.memberCount - g.parentsJoined} still need a parent`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </FadeIn>
        )}

        {/* ─── Nudge (student, parents missing) ─── */}
        {role === "student" && hasGroups && groups.some((g) => g.parentsJoined < g.memberCount) && (
          <FadeIn delay={320}>
            <View style={styles.nudge}>
              <Ionicons name="alert-circle-outline" size={20} color={Colors.warm} style={{ marginTop: 1, marginRight: Spacing.md }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nudgeTitle}>Waiting on parents</Text>
                <Text style={styles.nudgeText}>
                  Some families still need a parent to join. Remind them to download the app!
                </Text>
              </View>
            </View>
          </FadeIn>
        )}

        {/* ─── How HopIn works (empty state) ─── */}
        {role === "student" && !hasGroups && (
          <FadeIn delay={320}>
            <Text style={styles.sectionLabel}>How HopIn works</Text>
            <View style={styles.stepsCard}>
              {([
                { icon: "people-outline" as const, title: "Create or join a carpool group", sub: "Open your group and tap Find Nearby Students" },
                { icon: "person-add-outline" as const, title: "Each student's parent signs up", sub: "They link to their child's account" },
                { icon: "sparkles" as const, title: "AI builds a fair weekly schedule", sub: "Parents set availability, the app does the rest" },
              ]).map((step, i) => (
                <View key={i} style={[styles.stepRow, i === 2 && { marginBottom: 0 }]}>
                  <View style={styles.stepNum}>
                    <Ionicons name={step.icon} size={14} color={Colors.primary} />
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

        {/* ─── Parent steps (no group, child linked) ─── */}
        {role === "parent" && !hasGroups && childName && (
          <FadeIn delay={200}>
            <Text style={styles.sectionLabel}>What happens next</Text>
            <View style={styles.stepsCard}>
              {([
                { icon: "people-outline" as const, title: "Your child creates or joins a group", sub: "They can find nearby students in the Discover tab" },
                { icon: "eye-outline" as const, title: "You'll see the group here", sub: "Once they join, your dashboard updates automatically" },
                { icon: "sparkles" as const, title: "Set availability & the app handles the rest", sub: "AI builds a fair weekly driving schedule" },
              ]).map((step, i) => (
                <View key={i} style={[styles.stepRow, i === 2 && { marginBottom: 0 }]}>
                  <View style={styles.stepNum}>
                    <Ionicons name={step.icon} size={14} color={Colors.primary} />
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

        {/* ─── Tip ─── */}
        <FadeIn delay={380}>
          <View style={styles.tipCard}>
            <Ionicons name="bulb-outline" size={16} color={Colors.textTertiary} style={{ marginRight: 8, marginTop: 1 }} />
            <Text style={styles.tipText}>
              {hasGroups
                ? "Pull down to refresh. You can be in multiple groups — each one gets its own schedule."
                : "Pull down to refresh. Once you create or join a group, more options appear here."}
            </Text>
          </View>
        </FadeIn>

        <View style={{ height: 24 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingBottom: 40,
  },

  /* Hero */
  hero: {
    paddingTop: 64,
    paddingBottom: 28,
    paddingHorizontal: Spacing.xl,
  },
  greeting: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    fontWeight: "500",
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  heroName: {
    fontSize: 30,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },

  /* Body */
  body: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },

  /* Today's Ride */
  todayCard: {
    flexDirection: "row",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    overflow: "hidden",
    ...Shadows?.md,
  } as any,
  todayAccent: {
    width: 4,
    backgroundColor: Colors.primary,
  },
  todayBody: {
    flex: 1,
    padding: Spacing.lg,
  },
  todayTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  todayLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  todayDriver: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  todayTime: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },

  /* Warning */
  warningCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.warmBorder,
    padding: Spacing.lg,
  },
  warningTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  warningText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  /* Invites */
  inviteCard: {
    flexDirection: "row",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    marginBottom: Spacing.md,
    overflow: "hidden",
    ...Shadows?.md,
  } as any,
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
    color: "#FFFFFF",
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

  /* Group Cards */
  groupCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    ...Shadows?.md,
  } as any,
  groupTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.base,
  },
  groupAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
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
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  groupSub: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    gap: 6,
  },
  statusActive: {
    backgroundColor: Colors.primaryFaded,
  },
  statusForming: {
    backgroundColor: Colors.warmFaded,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: Spacing.sm,
  },
  infoLabel: {
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    fontWeight: "500",
    width: 56,
  },
  infoValue: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontWeight: "500",
    flex: 1,
  },
  availCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  availCtaText: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: "#FFFFFF",
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: Spacing.base,
    paddingTop: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  /* Empty State */
  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xxl,
    marginBottom: Spacing.lg,
    alignItems: "center",
    ...Shadows?.md,
  } as any,
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.bgElevated,
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
    color: "#FFFFFF",
    fontSize: FontSizes.md,
    fontWeight: "600",
  },

  /* Section Labels */
  sectionLabel: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },

  /* Quick Actions */
  quickGrid: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  quickTile: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    minHeight: 110,
    ...Shadows?.sm,
  } as any,
  quickTilePrimary: {
    backgroundColor: Colors.primary,
  },
  quickTitle: {
    fontSize: FontSizes.md,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  quickSub: {
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },

  /* Status Overview (parent) */
  statusCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows?.md,
  } as any,
  statusGroupName: {
    fontSize: FontSizes.sm,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
  },
  statusDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  statusRowText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    flex: 1,
  },

  /* Nudge */
  nudge: {
    backgroundColor: Colors.warmFaded,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warmBorder,
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

  /* Steps */
  stepsCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows?.md,
  } as any,
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
    marginTop: 1,
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

  /* Tip */
  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    ...Shadows?.sm,
  } as any,
  tipText: {
    flex: 1,
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    lineHeight: 19,
  },
});
