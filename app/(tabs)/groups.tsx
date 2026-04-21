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
import { supabase } from "../../lib/supabase";
import { getValidUser, handleLogout } from "../../lib/helpers";
import { deletedGroups } from "../../lib/deletedGroups";
import { Colors, Spacing, Radius, FontSizes, Shadows } from "../../lib/theme";
import {
  FadeIn,
  PressableScale,
  PrimaryButton,
  SecondaryButton,
  LoadingScreen,
} from "../../components/UI";
import { SCHOOL } from "../../lib/config";

interface GroupInfo {
  id: string;
  name: string;
  status: string;
  memberCount: number;
  parentCount: number;
  hasAvailability?: boolean;
}

export default function GroupsTab() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<"student" | "parent" | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [childName, setChildName] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadGroups();
    }, [])
  );

  const loadGroups = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const user = await getValidUser();
      if (!user) {
        handleLogout(router);
        return;
      }

      const { data: student } = await supabase
        .from("students")
        .select("id, school_id")
        .eq("id", user.id)
        .single();

      if (student) {
        setRole("student");
        await loadStudentGroups(student);
      } else {
        const { data: parent } = await supabase
          .from("parents")
          .select("id, name, student_id")
          .eq("id", user.id)
          .single();

        if (parent) {
          setRole("parent");
          await loadParentGroups(parent);
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
        Alert.alert("No Internet", "Please check your connection.", [
          { text: "Retry", onPress: () => loadGroups() },
        ]);
      }
    }
  };

  const loadStudentGroups = async (student: any) => {
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
        parentCount: (members || []).filter((m: any) => m.parent_id).length,
      });
    }

    const seen = new Set<string>();
    setGroups(groupList.filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    }));
  };

  const loadParentGroups = async (parent: any) => {
    if (!parent.student_id) return;

    const { data: child } = await supabase
      .from("students")
      .select("name")
      .eq("id", parent.student_id)
      .single();
    setChildName(child?.name || null);

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

    const seen = new Set<string>();
    setGroups(groupList.filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    }));
  };

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadGroups(true)}
          tintColor={Colors.primary}
        />
      }
    >
      {/* Header */}
      <FadeIn>
        <Text style={styles.title}>
          {role === "parent" && childName ? `${childName}'s Groups` : "My Groups"}
        </Text>
        <Text style={styles.subtitle}>
          {role === "student"
            ? "Manage your carpool groups and find nearby students"
            : "Your child's carpool groups"}
        </Text>
      </FadeIn>

      {/* Group List */}
      {groups.length > 0 ? (
        groups.map((g, idx) => (
          <FadeIn key={g.id} delay={100 + idx * 60}>
            <PressableScale
              onPress={() => router.push(`/my-group?groupId=${g.id}`)}
              style={styles.groupCard}
            >
              <View style={styles.groupTop}>
                <View style={styles.groupIcon}>
                  <Ionicons
                    name="people"
                    size={20}
                    color={g.status === "active" ? Colors.primary : Colors.warm}
                  />
                </View>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupMeta}>
                    {g.memberCount} {g.memberCount === 1 ? "family" : "families"}
                    {"  ·  "}
                    {g.parentCount} parent{g.parentCount !== 1 ? "s" : ""}
                  </Text>
                </View>
                <View style={[styles.badge, g.status === "active" ? styles.badgeActive : styles.badgeForming]}>
                  <Text style={[styles.badgeText, { color: g.status === "active" ? Colors.primary : Colors.warm }]}>
                    {g.status === "forming" ? "Forming" : "Active"}
                  </Text>
                </View>
              </View>

              <View style={styles.groupBottom}>
                <View style={styles.detailChip}>
                  <Ionicons name="school-outline" size={12} color={Colors.textTertiary} />
                  <Text style={styles.detailChipText}>{SCHOOL.name}</Text>
                </View>

                {role === "parent" && (
                  <View style={[styles.detailChip, g.hasAvailability ? styles.chipSuccess : styles.chipWarn]}>
                    <Ionicons
                      name={g.hasAvailability ? "checkmark-circle" : "alert-circle"}
                      size={12}
                      color={g.hasAvailability ? Colors.success : Colors.warm}
                    />
                    <Text style={[styles.detailChipText, { color: g.hasAvailability ? Colors.success : Colors.warm }]}>
                      {g.hasAvailability ? "Availability set" : "Set availability"}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.groupArrow}>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </View>
            </PressableScale>
          </FadeIn>
        ))
      ) : (
        <FadeIn delay={100}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="people-outline" size={32} color={Colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyText}>
              {role === "student"
                ? "Create a carpool group or wait for an invite from a classmate."
                : "Your child hasn't joined any carpool groups yet."}
            </Text>
          </View>
        </FadeIn>
      )}

      {/* Student Actions */}
      {role === "student" && (
        <FadeIn delay={200 + groups.length * 60}>
          <View style={styles.actionsSection}>
            {groups.length > 0 && groups[0]?.id && (
              <SecondaryButton
                title="Find Nearby Students"
                icon="search-outline"
                onPress={() => router.push(`/discover?groupId=${groups[0].id}`)}
                style={{ marginBottom: Spacing.md }}
              />
            )}

            <PrimaryButton
              title={groups.length > 0 ? "Create Another Group" : "Create a Group"}
              icon="add-circle-outline"
              onPress={() => router.push("/create-group")}
            />
          </View>
        </FadeIn>
      )}

      {/* Parent Actions */}
      {role === "parent" && groups.length > 0 && (
        <FadeIn delay={200 + groups.length * 60}>
          <View style={styles.actionsSection}>
            {groups.map((g) =>
              !g.hasAvailability ? (
                <PrimaryButton
                  key={g.id}
                  title={`Set Availability — ${g.name}`}
                  icon="calendar-outline"
                  onPress={() => router.push(`/availability?groupId=${g.id}`)}
                  style={{ marginBottom: Spacing.md }}
                />
              ) : null
            )}
          </View>
        </FadeIn>
      )}

      <View style={{ height: 24 }} />
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
    paddingTop: 64,
    paddingBottom: 40,
  },

  /* Header */
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },

  /* Group Cards */
  groupCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    position: "relative",
    ...Shadows?.md,
  } as any,
  groupTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  groupInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  groupName: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  groupMeta: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  badge: {
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeActive: {
    backgroundColor: Colors.primaryFaded,
  },
  badgeForming: {
    backgroundColor: Colors.warmFaded,
  },
  badgeText: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  groupBottom: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  detailChipText: {
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    fontWeight: "500",
  },
  chipSuccess: {
    backgroundColor: Colors.successFaded,
  },
  chipWarn: {
    backgroundColor: Colors.warmFaded,
  },
  groupArrow: {
    position: "absolute",
    right: Spacing.lg,
    top: "50%",
    marginTop: -9,
  },

  /* Empty */
  emptyCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.xxl,
    alignItems: "center",
    marginBottom: Spacing.lg,
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
  },

  /* Actions */
  actionsSection: {
    marginTop: Spacing.lg,
  },
});
