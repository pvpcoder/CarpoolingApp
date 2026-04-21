import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../../lib/supabase";
import { getValidUser, handleLogout } from "../../lib/helpers";
import { Colors, Spacing, Radius, FontSizes, Shadows, Gradients } from "../../lib/theme";
import { FadeIn, PressableScale, LoadingScreen, SecondaryButton } from "../../components/UI";

export default function ProfileTab() {
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
              if (groupId) {
                const { deletedGroups } = require("../../lib/deletedGroups");
                deletedGroups.add(groupId);
              }
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
              const { error } = await supabase.auth.resetPasswordForEmail(userEmail);
              if (error) {
                Alert.alert("Error", error.message);
              } else {
                Alert.alert("Check Your Email", "A password reset link has been sent.");
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

  const initials = userName
    ? userName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Gradient Header with Avatar */}
      <LinearGradient
        colors={Gradients.hero as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroHeader}
      >
        <FadeIn>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.profileName}>{userName || "User"}</Text>
            <Text style={styles.profileEmail}>{userEmail}</Text>
            <View style={styles.roleTag}>
              <Text style={styles.roleTagText}>
                {userRole === "student" ? "Student" : "Parent"}
              </Text>
            </View>
          </View>
        </FadeIn>
      </LinearGradient>

      {/* Account Section */}
      <FadeIn delay={100}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.section}>
          {childName && (
            <>
              <View style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: Colors.infoFaded }]}>
                  <Ionicons name="person-outline" size={16} color={Colors.info} />
                </View>
                <View style={styles.rowContent}>
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
                <View style={[styles.rowIcon, { backgroundColor: Colors.primaryFaded }]}>
                  <Ionicons name="people-outline" size={16} color={Colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Carpool Group</Text>
                  <Text style={styles.rowValue}>{groupName}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </PressableScale>
              <View style={styles.divider} />
            </>
          )}

          <PressableScale onPress={handleResetPassword} style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.warmFaded }]}>
              <Ionicons name="lock-closed-outline" size={16} color={Colors.warm} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Change Password</Text>
              <Text style={styles.rowSub}>Send a reset link to your email</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </PressableScale>

          {userRole === "student" && (
            <>
              <View style={styles.divider} />
              <PressableScale
                onPress={() => router.push("/setup-location")}
                style={styles.row}
              >
                <View style={[styles.rowIcon, { backgroundColor: Colors.primaryFaded }]}>
                  <Ionicons name="location-outline" size={16} color={Colors.primary} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>Pickup Location</Text>
                  <Text style={styles.rowSub}>Update your pickup spot</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </PressableScale>
            </>
          )}
        </View>
      </FadeIn>

      {/* Group Section */}
      {groupName && (
        <FadeIn delay={160}>
          <Text style={styles.sectionLabel}>GROUP</Text>
          <View style={styles.section}>
            {userRole === "parent" && groupId && (
              <>
                <PressableScale
                  onPress={() => router.push(`/availability?groupId=${groupId}`)}
                  style={styles.row}
                >
                  <View style={[styles.rowIcon, { backgroundColor: Colors.infoFaded }]}>
                    <Ionicons name="calendar-outline" size={16} color={Colors.info} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowLabel}>My Availability</Text>
                    <Text style={styles.rowSub}>Edit when you can drive</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </PressableScale>
                <View style={styles.divider} />
              </>
            )}

            <PressableScale onPress={confirmLeaveGroup} style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: Colors.accentFaded }]}>
                <Ionicons name="exit-outline" size={16} color={Colors.accent} />
              </View>
              <View style={styles.rowContent}>
                <Text style={[styles.rowLabel, { color: Colors.accent }]}>Leave Group</Text>
                <Text style={styles.rowSub}>You'll need a new invite to rejoin</Text>
              </View>
            </PressableScale>
          </View>
        </FadeIn>
      )}

      {/* About Section */}
      <FadeIn delay={220}>
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: Colors.bgElevated }]}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.textTertiary} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>App Version</Text>
              <Text style={styles.rowValue}>1.0.0</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <PressableScale
            onPress={() => Linking.openURL("mailto:support@hopin.app")}
            style={styles.row}
          >
            <View style={[styles.rowIcon, { backgroundColor: Colors.infoFaded }]}>
              <Ionicons name="mail-outline" size={16} color={Colors.info} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Contact Support</Text>
              <Text style={styles.rowSub}>support@hopin.app</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </PressableScale>
        </View>
      </FadeIn>

      {/* Sign Out */}
      <FadeIn delay={280}>
        <SecondaryButton
          title="Sign Out"
          icon="log-out-outline"
          onPress={confirmLogout}
          style={styles.signOutBtn}
        />
      </FadeIn>

      {/* Delete Account */}
      <FadeIn delay={340}>
        <PressableScale onPress={confirmDeleteAccount} style={styles.deleteLink}>
          <Text style={styles.deleteLinkText}>Delete Account</Text>
        </PressableScale>
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
    paddingBottom: 40,
  },

  /* Hero Header */
  heroHeader: {
    paddingTop: 64,
    paddingBottom: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
    alignItems: "center",
  },
  avatarWrap: {
    alignItems: "center",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryFaded,
    borderWidth: 2,
    borderColor: Colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.base,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: 1,
  },
  profileName: {
    fontSize: FontSizes.xl,
    fontWeight: "700",
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    marginBottom: Spacing.md,
  },
  roleTag: {
    backgroundColor: Colors.primaryFaded,
    borderRadius: Radius.xs,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  roleTagText: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.primary,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  /* Sections */
  sectionLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.textTertiary,
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  section: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.xl,
    overflow: "hidden",
    ...Shadows?.md,
  } as any,

  /* Rows */
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: FontSizes.base,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  rowValue: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  rowSub: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginLeft: Spacing.lg + 32 + Spacing.md,
  },

  /* Sign Out */
  signOutBtn: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xxl,
  },

  /* Delete */
  deleteLink: {
    alignSelf: "center",
    marginTop: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  deleteLinkText: {
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    fontWeight: "500",
  },
});
