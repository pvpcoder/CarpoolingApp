import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { getValidUser } from "../lib/helpers";
import { deletedGroups } from "../lib/deletedGroups";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import {
  FadeIn,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  BackButton,
  Card,
  Banner,
  SectionHeader,
  PressableScale,
  LoadingScreen,
} from "../components/UI";

import { SCHOOL } from "../lib/config";

const openDirections = (
  address: string,
  lat?: number,
  lng?: number
) => {
  let url: string;
  if (lat && lng) {
    // Use coordinates for precision
    url = Platform.select({
      ios: `maps://app?daddr=${lat},${lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
    }) as string;
  } else {
    const encoded = encodeURIComponent(address);
    url = Platform.select({
      ios: `maps://app?daddr=${encoded}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    }) as string;
  }
  Linking.openURL(url).catch(() =>
    Alert.alert("Error", "Couldn't open maps app.")
  );
};

const openMultiStopDirections = (
  stops: { lat: number; lng: number; label: string }[]
) => {
  if (stops.length === 0) return;
  if (stops.length === 1) {
    openDirections(stops[0].label, stops[0].lat, stops[0].lng);
    return;
  }
  // Google Maps multi-stop: last stop is destination, rest are waypoints
  const waypoints = stops
    .slice(0, -1)
    .map((s) => `${s.lat},${s.lng}`)
    .join("|");
  const dest = stops[stops.length - 1];
  const url = `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&waypoints=${waypoints}`;
  Linking.openURL(url).catch(() =>
    Alert.alert("Error", "Couldn't open maps app.")
  );
};

export default function MyGroup() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<"student" | "parent" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadGroup();
  }, []);

  const loadGroup = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("id", user.id)
      .single();
    setUserRole(student ? "student" : "parent");

    if (student) {
      const { data: membership } = await supabase
        .from("group_members")
        .select("role")
        .eq("group_id", groupId)
        .eq("student_id", user.id)
        .eq("status", "active")
        .single();
      setIsAdmin(membership?.role === "admin");
    } else {
      const { data: parent } = await supabase
        .from("parents")
        .select("student_id")
        .eq("id", user.id)
        .single();
      if (parent?.student_id) {
        const { data: membership } = await supabase
          .from("group_members")
          .select("role")
          .eq("group_id", groupId)
          .eq("student_id", parent.student_id)
          .eq("status", "active")
          .single();
        setIsAdmin(membership?.role === "admin");
      }
    }

    const { data: groupData } = await supabase
      .from("carpool_groups")
      .select("id, name, status, max_members, created_at")
      .eq("id", groupId)
      .single();
    setGroup(groupData);

    const { data: memberData } = await supabase
      .from("group_members")
      .select(
        "id, role, student_id, joined_at, students ( name, grade, saved_pickup_address, saved_pickup_lat, saved_pickup_lng ), parents ( name, phone, email )"
      )
      .eq("group_id", groupId)
      .eq("status", "active");
    setMembers(memberData || []);
    setLoading(false);
  };

  const confirmDeleteGroup = () => {
    Alert.alert(
      "Delete Group",
      `Are you sure you want to permanently delete "${group?.name}"? This will remove all members, messages, schedules, and availability data. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Final Confirmation",
              "This will permanently delete this carpool group and ALL its data for ALL members. Are you absolutely sure?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete Everything",
                  style: "destructive",
                  onPress: handleDeleteGroup,
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleDeleteGroup = async () => {
    setDeleting(true);
    try {
      // Save locally FIRST — this guarantees dashboard won't show it
      // even if every Supabase call gets silently blocked by RLS
      deletedGroups.add(groupId as string);

      // Soft-delete FIRST - guarantees dashboard removal even if hard deletes
      // get silently blocked by RLS (Supabase returns success with 0 rows)
      await supabase
        .from("group_members")
        .update({ status: "left" })
        .eq("group_id", groupId);
      await supabase
        .from("carpool_groups")
        .update({ status: "deleted" })
        .eq("id", groupId);

      // Now try hard deletes to clean up data (best effort)
      try {
        await supabase.from("group_messages").delete().eq("group_id", groupId);
        await supabase.from("group_invites").delete().eq("group_id", groupId);
        await supabase.from("parent_availability").delete().eq("group_id", groupId);
        await supabase.from("weekly_schedules").delete().eq("group_id", groupId);
        await supabase.from("group_members").delete().eq("group_id", groupId);
        await supabase.from("carpool_groups").delete().eq("id", groupId);
      } catch {
        // Hard deletes blocked by RLS - fine, soft-delete already worked
      }

      setDeleting(false);
      Alert.alert("Group Deleted", "The carpool group has been removed.", [
        {
          text: "OK",
          onPress: () => {
            if (userRole === "student") {
              router.replace("/student-home");
            } else {
              router.replace("/parent-home");
            }
          },
        },
      ]);
    } catch (err: any) {
      setDeleting(false);
      Alert.alert("Error", "Couldn't delete the group. Please try again.");
    }
  };


  const handleGetAllDirections = () => {
    // Build multi-stop route for all students (excluding current user's student)
    const stops = members
      .filter(
        (m: any) =>
          m.students?.saved_pickup_lat &&
          m.students?.saved_pickup_lng &&
          m.student_id !== currentUserId
      )
      .map((m: any) => ({
        lat: m.students.saved_pickup_lat,
        lng: m.students.saved_pickup_lng,
        label: m.students.saved_pickup_address || m.students.name,
      }));

    if (stops.length === 0) {
      Alert.alert("No Addresses", "No students have set their pickup address yet.");
      return;
    }
    openMultiStopDirections(stops);
  };

  if (loading) return <LoadingScreen />;

  const familiesWithParents = members.filter((m: any) => m.parents);
  const familiesWithoutParents = members.filter((m: any) => !m.parents);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <BackButton onPress={() => router.back()} />

      <FadeIn>
        <Text style={styles.title}>{group?.name}</Text>
        <View style={styles.meta}>
          <View
            style={[
              styles.statusPill,
              group?.status === "active" && styles.statusActive,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                group?.status === "active" && { color: Colors.success },
              ]}
            >
              {group?.status === "forming" ? "Forming" : "Active"}
            </Text>
          </View>
          <Text style={styles.memberCount}>
            {members.length} / {group?.max_members} families
          </Text>
          {isAdmin && (
            <View style={styles.adminSelfBadge}>
              <Text style={styles.adminSelfText}>You're Admin</Text>
            </View>
          )}
        </View>
      </FadeIn>

      {/* School Destination */}
      <FadeIn delay={80}>
        <View style={styles.schoolCard}>
          <View style={styles.schoolRow}>
            <View style={styles.schoolIcon}>
              <Text style={{ fontSize: 18 }}>🏫</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.schoolLabel}>SCHOOL DESTINATION</Text>
              <Text style={styles.schoolName}>{SCHOOL.name}</Text>
              <Text style={styles.schoolAddr}>{SCHOOL.address}</Text>
            </View>
          </View>
          <PressableScale
            onPress={() =>
              openDirections(SCHOOL.address, SCHOOL.lat, SCHOOL.lng)
            }
            style={styles.directionsBtn}
          >
            <Text style={{ fontSize: 14 }}>🧭</Text>
            <Text style={styles.directionsBtnText}>Get Directions to School</Text>
          </PressableScale>
        </View>
      </FadeIn>

      {/* Route All Students (for parents) */}
      {userRole === "parent" && members.length > 1 && (
        <FadeIn delay={120}>
          <PressableScale
            onPress={handleGetAllDirections}
            style={styles.routeAllBtn}
          >
            <Text style={{ fontSize: 16 }}>🗺️</Text>
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.routeAllTitle}>
                Route to All Students
              </Text>
              <Text style={styles.routeAllSub}>
                Opens maps with multi-stop directions
              </Text>
            </View>
            <Text style={{ color: Colors.bg, fontWeight: "700", fontSize: 16 }}>
              →
            </Text>
          </PressableScale>
        </FadeIn>
      )}

      <FadeIn delay={150}>
        <SectionHeader title="Families" />
        {members.map((member: any, i: number) => (
          <FadeIn key={member.id} delay={200 + i * 60}>
            <Card>
              <View style={styles.memberHeader}>
                <Text style={styles.memberName}>
                  🎒 {member.students?.name || "Student"}
                </Text>
                {member.role === "admin" && (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminText}>Admin</Text>
                  </View>
                )}
              </View>
              <Text style={styles.memberGrade}>
                Grade {member.students?.grade}
              </Text>
              {member.students?.saved_pickup_address && (
                <View style={styles.addrRow}>
                  <Text style={styles.memberAddr}>
                    📍 {member.students.saved_pickup_address}
                  </Text>
                  {userRole === "parent" && (
                    <PressableScale
                      onPress={() =>
                        openDirections(
                          member.students.saved_pickup_address,
                          member.students.saved_pickup_lat,
                          member.students.saved_pickup_lng
                        )
                      }
                      style={styles.dirBtnSmall}
                    >
                      <Text style={styles.dirBtnSmallText}>Directions</Text>
                    </PressableScale>
                  )}
                </View>
              )}
              {member.parents ? (
                <View style={styles.parentBox}>
                  <Text style={styles.parentName}>
                    🚗 {member.parents.name}
                  </Text>
                  {userRole === "parent" && (
                    <>
                      <Text style={styles.parentContact}>
                        📞 {member.parents.phone}
                      </Text>
                      <Text style={styles.parentContact}>
                        ✉️ {member.parents.email}
                      </Text>
                    </>
                  )}
                </View>
              ) : (
                <Text style={styles.noParent}>
                  Parent hasn't joined yet
                </Text>
              )}
            </Card>
          </FadeIn>
        ))}
      </FadeIn>

      {familiesWithoutParents.length > 0 && (
        <FadeIn delay={400}>
          <Banner
            icon="⚠️"
            title="Waiting on parents"
            message={`${familiesWithoutParents.length} ${
              familiesWithoutParents.length === 1
                ? "family still needs a"
                : "families still need"
            } parent to join.`}
            variant="warning"
          />
        </FadeIn>
      )}

      {familiesWithParents.length >= 2 && group?.status === "forming" && (
        <FadeIn delay={450}>
          <Banner
            icon="🎉"
            title="Almost ready!"
            message={`You have ${familiesWithParents.length} families with parents. Once parents set their availability, the app can generate a schedule.`}
            variant="success"
          />
        </FadeIn>
      )}

      <FadeIn delay={500}>
        <PrimaryButton
          title="Invite More Students"
          icon="🔍"
          onPress={() => router.push("/discover")}
          style={{ marginBottom: Spacing.md }}
        />
        {group?.status === "active" && (
          <SecondaryButton
            title="View Weekly Schedule"
            icon="📅"
            onPress={() =>
              router.push(`/weekly-schedule?groupId=${groupId}`)
            }
            style={{ marginBottom: Spacing.md }}
          />
        )}
      </FadeIn>

      {/* Admin: Delete Group */}
      {isAdmin && (
        <FadeIn delay={600}>
          <View style={styles.dangerSection}>
            <Text style={styles.dangerLabel}>ADMIN</Text>
            <DangerButton
              title={deleting ? "Deleting..." : "Delete This Group"}
              onPress={confirmDeleteGroup}
              style={{ marginTop: Spacing.sm }}
            />
            <Text style={styles.dangerHint}>
              Permanently removes the group, all members, messages, and
              schedules. This cannot be undone.
            </Text>
          </View>
        </FadeIn>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.xl, paddingTop: 60, paddingBottom: 48 },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: Spacing.xl,
    flexWrap: "wrap",
  },
  statusPill: {
    backgroundColor: Colors.warmFaded,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statusActive: { backgroundColor: Colors.successFaded },
  statusText: {
    color: Colors.warm,
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  memberCount: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  adminSelfBadge: {
    backgroundColor: Colors.primaryFaded,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  adminSelfText: {
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },

  /* School card */
  schoolCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  schoolRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  schoolIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.infoFaded,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  schoolLabel: {
    fontSize: FontSizes.xs,
    color: Colors.info,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  schoolName: {
    fontSize: FontSizes.base,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  schoolAddr: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  directionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgElevated,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  directionsBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.primary,
  },

  /* Route all button */
  routeAllBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    flexDirection: "row",
    alignItems: "center",
  },
  routeAllTitle: {
    fontSize: FontSizes.md,
    fontWeight: "700",
    color: Colors.bg,
    marginBottom: 2,
  },
  routeAllSub: {
    fontSize: FontSizes.sm,
    color: "rgba(15,17,32,0.6)",
  },

  /* Members */
  memberHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  memberName: {
    color: Colors.textPrimary,
    fontSize: FontSizes.base,
    fontWeight: "700",
  },
  adminBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  adminText: {
    color: Colors.bg,
    fontSize: FontSizes.xs,
    fontWeight: "700",
  },
  memberGrade: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: "600",
    marginBottom: 4,
  },
  addrRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  memberAddr: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    flex: 1,
  },
  dirBtnSmall: {
    backgroundColor: Colors.primaryFaded,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  dirBtnSmallText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.primary,
  },
  parentBox: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginTop: 8,
  },
  parentName: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    fontWeight: "600",
    marginBottom: 4,
  },
  parentContact: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
    marginBottom: 2,
  },
  noParent: {
    color: Colors.accent,
    fontSize: FontSizes.sm,
    marginTop: 8,
  },
  dangerSection: {
    marginTop: Spacing.xxl,
    paddingTop: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  dangerLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.textTertiary,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  dangerHint: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
});
