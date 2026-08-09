import { useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  Pressable,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { getValidUser, handleLogout } from "../../lib/helpers";
import { deletedGroups } from "../../lib/deletedGroups";
import { SCHOOL } from "../../lib/config";
import { useTheme, Fonts } from "../../lib/theme";
import { LoadingScreen, PressableScale, FadeIn, EmptyState } from "../../components/UI";

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
  const c = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<"student" | "parent" | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [childName, setChildName] = useState<string | null>(null);
  const bodyOpacity = useRef(new Animated.Value(0)).current;
  const bodySlide = useRef(new Animated.Value(16)).current;

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
      if (!isRefresh) {
        Animated.parallel([
          Animated.timing(bodyOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(bodySlide, { toValue: 0, duration: 380, useNativeDriver: true }),
        ]).start();
      }
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

  if (loading) {
    return <LoadingScreen />;
  }

  const hasGroups = groups.length > 0;
  const groupsNeedingAvailability = groups.filter((g) => !g.hasAvailability);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.paper }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadGroups(true)}
          tintColor={c.dawn}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: c.textPrimary, fontFamily: Fonts.display }]}>
          {role === "parent" && childName ? `${childName}'s Groups` : "My Groups"}
        </Text>
        <Text style={[styles.subtitle, { color: c.textSecondary, fontFamily: Fonts.body }]}>
          {role === "student"
            ? "Manage your carpool groups"
            : "Your child's carpool groups"}
        </Text>
      </View>

      <Animated.View style={[styles.body, { opacity: bodyOpacity, transform: [{ translateY: bodySlide }] }]}>
        {hasGroups ? (
          <View style={[styles.groupList, { borderColor: c.line }]}>
            {groups.map((g, idx) => (
              <FadeIn key={g.id} delay={Math.min(idx, 6) * 40}>
                {idx > 0 && <View style={[styles.rowDivider, { backgroundColor: c.line }]} />}
                <PressableScale
                  onPress={() => router.push(`/my-group?groupId=${g.id}`)}
                  style={styles.groupRow}
                >
                  <View style={styles.groupInfo}>
                    <Text style={[styles.groupName, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{g.name}</Text>
                    <Text style={[styles.groupMeta, { color: c.textSecondary, fontFamily: Fonts.body }]}>
                      {g.memberCount} {g.memberCount === 1 ? "family" : "families"}
                      {"  ·  "}
                      {g.parentCount} parent{g.parentCount !== 1 ? "s" : ""}
                      {"  ·  "}
                      {SCHOOL.name}
                    </Text>
                    {role === "parent" && (
                      <Text style={[styles.availLine, { color: g.hasAvailability ? c.dawn : c.rust, fontFamily: Fonts.bodySemiBold }]}>
                        {g.hasAvailability ? "Availability set" : "Availability not set"}
                      </Text>
                    )}
                  </View>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: g.status === "active" ? c.dawnFaded : c.rustFaded },
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: g.status === "active" ? c.dawn : c.rust, fontFamily: Fonts.bodyBold },
                    ]}>
                      {g.status === "forming" ? "Forming" : "Active"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.textMuted} style={{ marginLeft: 10 }} />
                </PressableScale>
              </FadeIn>
            ))}
          </View>
        ) : (
          <View style={{ marginBottom: 24 }}>
            <EmptyState
              icon="people-outline"
              title="No groups yet"
              message={
                role === "student"
                  ? "Create a carpool group or wait for an invite from a classmate."
                  : "Your child hasn't joined any carpool groups yet."
              }
            />
          </View>
        )}

        {/* Student actions */}
        {role === "student" && (
          <View style={styles.actions}>
            <Text style={[styles.actionsLabel, { color: c.textMuted, fontFamily: Fonts.bodyBold }]}>ACTIONS</Text>
            {hasGroups && groups[0]?.id && (
              <PressableScale
                onPress={() => router.push(`/discover?groupId=${groups[0].id}`)}
                style={[styles.linkRow, { backgroundColor: c.paperElevated, borderColor: c.line }]}
              >
                <Text style={[styles.linkText, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>Find nearby students</Text>
                <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
              </PressableScale>
            )}
            <PressableScale
              onPress={() => router.push("/create-group")}
              style={[styles.linkRow, { backgroundColor: c.paperElevated, borderColor: c.line }]}
            >
              <Text style={[styles.linkText, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>
                {hasGroups ? "Create another group" : "Create a group"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
            </PressableScale>
          </View>
        )}

        {/* Parent availability CTAs */}
        {role === "parent" && groupsNeedingAvailability.length > 0 && (
          <View style={styles.actions}>
            <Text style={[styles.actionsLabel, { color: c.textMuted, fontFamily: Fonts.bodyBold }]}>ACTIONS NEEDED</Text>
            {groupsNeedingAvailability.map((g, idx) => (
              <FadeIn key={g.id} delay={Math.min(idx, 6) * 40}>
                <PressableScale
                  onPress={() => router.push(`/availability?groupId=${g.id}`)}
                  style={[styles.linkRow, { backgroundColor: c.paperElevated, borderColor: c.line }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.linkSubLabel, { color: c.rust, fontFamily: Fonts.bodyBold }]}>AVAILABILITY NEEDED</Text>
                    <Text style={[styles.linkText, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>{g.name}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
                </PressableScale>
              </FadeIn>
            ))}
          </View>
        )}
      </Animated.View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: { flex: 1 },
  content: { paddingBottom: 40 },

  header: {
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 28,
  },
  title: {
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1.8,
    lineHeight: 44,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  },

  body: {
    paddingHorizontal: 20,
  },

  groupList: {
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 24,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  groupInfo: {
    flex: 1,
    marginRight: 12,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  groupMeta: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  availLine: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 5,
  },
  statusBadge: {
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },

  emptyCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  },

  actions: {
    marginBottom: 16,
  },
  actionsLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 2,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  linkSubLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  linkText: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
});
