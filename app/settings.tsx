import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { getValidUser, handleLogout } from "../lib/helpers";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import { FadeIn, PressableScale, LoadingScreen } from "../components/UI";

export default function Settings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<"student" | "parent" | null>(null);
  const [childName, setChildName] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const user = await getValidUser();
      if (!user) {
        handleLogout(router);
        return;
      }
      setUserEmail(user.email || "");

      const { data: student } = await supabase
        .from("students")
        .select("id, name")
        .eq("id", user.id)
        .single();

      if (student) {
        setUserRole("student");
        setUserName(student.name || "");

        const { data: membership } = await supabase
          .from("group_members")
          .select("group_id, carpool_groups ( id, name )")
          .eq("student_id", student.id)
          .eq("status", "active")
          .limit(1);
        if (membership && membership.length > 0) {
          const g = (membership[0] as any).carpool_groups;
          setGroupName(g.name);
          setGroupId(g.id);
        }
      } else {
        const { data: parent } = await supabase
          .from("parents")
          .select("id, name, student_id")
          .eq("id", user.id)
          .single();
        if (parent) {
          setUserRole("parent");
          setUserName(parent.name || "");

          if (parent.student_id) {
            const { data: child } = await supabase
              .from("students")
              .select("name")
              .eq("id", parent.student_id)
              .single();
            setChildName(child?.name || null);

            const { data: membership } = await supabase
              .from("group_members")
              .select("group_id, carpool_groups ( id, name )")
              .eq("student_id", parent.student_id)
              .eq("status", "active")
              .limit(1);
            if (membership && membership.length > 0) {
              const g = (membership[0] as any).carpool_groups;
              setGroupName(g.name);
              setGroupId(g.id);
            }
          }
        }
      }

      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      if (
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("Network request failed")
      ) {
        Alert.alert("No Internet", "Please check your connection.", [
          { text: "Retry", onPress: () => loadSettings() },
        ]);
      }
    }
  };

  const confirmLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => handleLogout(router),
      },
    ]);
  };

  const confirmLeaveGroup = () => {
    if (!groupId) return;
    Alert.alert(
      "Leave Group",
      "Are you sure you want to leave this carpool group? You'll need a new invite to rejoin.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              const user = await getValidUser();
              if (!user) return;
              if (userRole === "student") {
                await supabase
                  .from("group_members")
                  .update({ status: "left" })
                  .eq("group_id", groupId)
                  .eq("student_id", user.id);
              } else {
                await supabase
                  .from("group_members")
                  .update({ parent_id: null })
                  .eq("group_id", groupId)
                  .eq("parent_id", user.id);
              }
              Alert.alert("Done", "You've left the group.");
              setGroupName(null);
              setGroupId(null);
            } catch {
              Alert.alert("Error", "Couldn't leave group. Try again.");
            }
          },
        },
      ]
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all associated data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you absolutely sure?",
              "Your account, group memberships, and all data will be permanently removed.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, Delete Everything",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const user = await getValidUser();
                      if (!user) return;
                      if (userRole === "student") {
                        await supabase
                          .from("group_members")
                          .delete()
                          .eq("student_id", user.id);
                        await supabase
                          .from("students")
                          .delete()
                          .eq("id", user.id);
                      } else {
                        await supabase
                          .from("group_members")
                          .update({ parent_id: null })
                          .match({ parent_id: user.id });
                        await supabase
                          .from("parent_availability")
                          .delete()
                          .eq("parent_id", user.id);
                        await supabase
                          .from("parents")
                          .delete()
                          .eq("id", user.id);
                      }
                      await supabase.auth.signOut();
                      router.replace("/");
                    } catch {
                      Alert.alert(
                        "Error",
                        "Couldn't delete account. Please try again or contact support."
                      );
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleResetPassword = async () => {
    if (!userEmail) return;
    Alert.alert(
      "Reset Password",
      `We'll send a password reset link to ${userEmail}. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send Link",
          onPress: async () => {
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(
                userEmail
              );
              if (error) {
                Alert.alert("Error", error.message);
              } else {
                Alert.alert(
                  "Check Your Email",
                  "A password reset link has been sent."
                );
              }
            } catch {
              Alert.alert("Error", "Couldn't send reset email. Try again.");
            }
          },
        },
      ]
    );
  };

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <FadeIn>
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} style={styles.backArea}>
            <Text style={styles.backText}>← Back</Text>
          </PressableScale>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 50 }} />
        </View>
      </FadeIn>

      {/* Profile Card */}
      <FadeIn delay={80}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userName
                ? userName
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : "?"}
            </Text>
          </View>
          <Text style={styles.profileName}>{userName || "User"}</Text>
          <Text style={styles.profileEmail}>{userEmail}</Text>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>
              {userRole === "student" ? "Student" : "Parent"}
            </Text>
          </View>
        </View>
      </FadeIn>

      {/* Account */}
      <FadeIn delay={140}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.section}>
          {childName && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowIcon}>🎒</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Linked Child</Text>
                  <Text style={styles.rowValue}>{childName}</Text>
                </View>
              </View>
              <View style={styles.divider} />
            </>
          )}

          {groupName && (
            <>
              <PressableScale
                onPress={() => router.push(`/my-group?groupId=${groupId}`)}
                style={styles.row}
              >
                <Text style={styles.rowIcon}>👥</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Carpool Group</Text>
                  <Text style={styles.rowValue}>{groupName}</Text>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </PressableScale>
              <View style={styles.divider} />
            </>
          )}

          <PressableScale onPress={handleResetPassword} style={styles.row}>
            <Text style={styles.rowIcon}>🔑</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Change Password</Text>
              <Text style={styles.rowSub}>Send a reset link to your email</Text>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </PressableScale>

          {userRole === "student" && (
            <>
              <View style={styles.divider} />
              <PressableScale
                onPress={() => router.push("/setup-location")}
                style={styles.row}
              >
                <Text style={styles.rowIcon}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Pickup Location</Text>
                  <Text style={styles.rowSub}>Update your pickup spot</Text>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </PressableScale>
            </>
          )}
        </View>
      </FadeIn>

      {/* Group */}
      {groupName && (
        <FadeIn delay={200}>
          <Text style={styles.sectionLabel}>GROUP</Text>
          <View style={styles.section}>
            {userRole === "parent" && groupId && (
              <>
                <PressableScale
                  onPress={() =>
                    router.push(`/availability?groupId=${groupId}`)
                  }
                  style={styles.row}
                >
                  <Text style={styles.rowIcon}>🗓️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>My Availability</Text>
                    <Text style={styles.rowSub}>Edit when you can drive</Text>
                  </View>
                  <Text style={styles.rowChevron}>›</Text>
                </PressableScale>
                <View style={styles.divider} />
              </>
            )}

            <PressableScale onPress={confirmLeaveGroup} style={styles.row}>
              <Text style={styles.rowIcon}>🚪</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: Colors.accent }]}>
                  Leave Group
                </Text>
                <Text style={styles.rowSub}>
                  You'll need a new invite to rejoin
                </Text>
              </View>
            </PressableScale>
          </View>
        </FadeIn>
      )}

      {/* About */}
      <FadeIn delay={260}>
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.rowIcon}>📱</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>App Version</Text>
              <Text style={styles.rowValue}>1.0.0</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <PressableScale
            onPress={() => Linking.openURL("mailto:support@ridepool.app")}
            style={styles.row}
          >
            <Text style={styles.rowIcon}>✉️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Contact Support</Text>
              <Text style={styles.rowSub}>support@ridepool.app</Text>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </PressableScale>
        </View>
      </FadeIn>

      {/* Danger Zone */}
      <FadeIn delay={320}>
        <Text style={styles.sectionLabel}>DANGER ZONE</Text>
        <View style={styles.section}>
          <PressableScale onPress={confirmLogout} style={styles.row}>
            <Text style={styles.rowIcon}>↩️</Text>
            <Text style={[styles.rowLabel, { flex: 1 }]}>Sign Out</Text>
          </PressableScale>
          <View style={styles.divider} />
          <PressableScale onPress={confirmDeleteAccount} style={styles.row}>
            <Text style={styles.rowIcon}>🗑️</Text>
            <Text
              style={[styles.rowLabel, { flex: 1, color: Colors.accent }]}
            >
              Delete Account
            </Text>
          </PressableScale>
        </View>
      </FadeIn>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingBottom: 40 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: Spacing.xl,
  },
  backArea: {
    paddingVertical: 4,
    paddingRight: Spacing.md,
  },
  backText: {
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: "600",
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: "700",
  },

  profileCard: {
    alignItems: "center",
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryFaded,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  avatarText: {
    fontSize: FontSizes.xl,
    fontWeight: "800",
    color: Colors.primary,
  },
  profileName: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  rolePill: {
    backgroundColor: Colors.primaryFaded,
    borderRadius: Radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  rolePillText: {
    fontSize: FontSizes.sm,
    fontWeight: "700",
    color: Colors.primary,
  },

  sectionLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.textTertiary,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  section: {
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: Spacing.xl,
  },
  rowIcon: {
    fontSize: 18,
    marginRight: Spacing.md,
    width: 28,
    textAlign: "center",
  },
  rowLabel: {
    fontSize: FontSizes.base,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  rowValue: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  rowSub: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  rowChevron: {
    fontSize: 20,
    color: Colors.textTertiary,
    marginLeft: Spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.xl + 28 + Spacing.md,
  },
});
