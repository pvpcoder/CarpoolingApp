import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { getValidUser, handleLogout } from "../../lib/helpers";
import { useTheme, Fonts } from "../../lib/theme";
import { LoadingScreen, FadeIn } from "../../components/UI";

export default function ProfileTab() {
  const router = useRouter();
  const c = useTheme();

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
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => handleLogout(router) },
    ]);
  };

  const confirmLeaveGroup = () => {
    if (!groupId) return;
    Alert.alert(
      "Leave group",
      "You'll need a new invite to rejoin.",
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
      "Delete account",
      "This permanently deletes your account and all data. This cannot be undone.",
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
                  text: "Yes, delete everything",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const user = await getValidUser();
                      if (!user) return;
                      if (userRole === "student") {
                        await supabase.from("group_members").delete().eq("student_id", user.id);
                        await supabase.from("students").delete().eq("id", user.id);
                      } else {
                        await supabase.from("group_members").update({ parent_id: null }).match({ parent_id: user.id });
                        await supabase.from("parent_availability").delete().eq("parent_id", user.id);
                        await supabase.from("parents").delete().eq("id", user.id);
                      }
                      await supabase.auth.signOut();
                      router.replace("/");
                    } catch {
                      Alert.alert("Error", "Couldn't delete account. Please try again or contact support.");
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
      "Reset password",
      `Send a reset link to ${userEmail}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send link",
          onPress: async () => {
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(userEmail);
              if (error) {
                Alert.alert("Error", error.message);
              } else {
                Alert.alert("Check your email", "A password reset link has been sent.");
              }
            } catch {
              Alert.alert("Error", "Couldn't send reset email. Try again.");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <LoadingScreen />;
  }

  const initials = userName
    ? userName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.paper }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <FadeIn>
        <View style={styles.header}>
          <View style={[styles.initials, { backgroundColor: c.dawnFaded }]}>
            <Text style={[styles.initialsText, { color: c.dawn, fontFamily: Fonts.display }]}>{initials}</Text>
          </View>
          <Text style={[styles.profileName, { color: c.textPrimary, fontFamily: Fonts.display }]}>{userName || "User"}</Text>
          <Text style={[styles.profileEmail, { color: c.textMuted, fontFamily: Fonts.body }]}>{userEmail}</Text>
          <View style={[styles.roleTag, { backgroundColor: c.dawnFaded, borderColor: c.dawnBorder }]}>
            <Text style={[styles.roleTagText, { color: c.dawn, fontFamily: Fonts.bodyBold }]}>
              {userRole === "student" ? "STUDENT" : "PARENT"}
            </Text>
          </View>
        </View>
      </FadeIn>

      <View style={styles.body}>
        {/* Account section */}
        <Text style={[styles.sectionLabel, { color: c.textMuted, fontFamily: Fonts.bodyBold }]}>ACCOUNT</Text>
        <View style={[styles.section, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
          {childName && (
            <>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>Linked child</Text>
                <Text style={[styles.rowValue, { color: c.textSecondary, fontFamily: Fonts.body }]}>{childName}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: c.line }]} />
            </>
          )}

          {groupName && (
            <>
              <Pressable
                onPress={() => router.push(`/my-group?groupId=${groupId}`)}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.rowLabel, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>Carpool group</Text>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowValue, { color: c.textSecondary, fontFamily: Fonts.body }]} numberOfLines={1}>
                    {groupName}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={c.textMuted} style={{ marginLeft: 6 }} />
                </View>
              </Pressable>
              <View style={[styles.divider, { backgroundColor: c.line }]} />
            </>
          )}

          <Pressable
            onPress={handleResetPassword}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.rowLabel, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>Change password</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
          </Pressable>

          {userRole === "student" && (
            <>
              <View style={[styles.divider, { backgroundColor: c.line }]} />
              <Pressable
                onPress={() => router.push("/setup-location")}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.rowLabel, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>Pickup location</Text>
                <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
              </Pressable>
            </>
          )}
        </View>

        {/* Group section */}
        {groupName && (
          <>
            <Text style={[styles.sectionLabel, { color: c.textMuted, fontFamily: Fonts.bodyBold }]}>GROUP</Text>
            <View style={[styles.section, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
              {userRole === "parent" && groupId && (
                <>
                  <Pressable
                    onPress={() => router.push(`/availability?groupId=${groupId}`)}
                    style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={[styles.rowLabel, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>My availability</Text>
                    <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
                  </Pressable>
                  <View style={[styles.divider, { backgroundColor: c.line }]} />
                </>
              )}
              <Pressable
                onPress={confirmLeaveGroup}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.rowLabel, { color: c.rust, fontFamily: Fonts.bodyMedium }]}>Leave group</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* About section */}
        <Text style={[styles.sectionLabel, { color: c.textMuted, fontFamily: Fonts.bodyBold }]}>ABOUT</Text>
        <View style={[styles.section, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>Version</Text>
            <Text style={[styles.rowValue, { color: c.textSecondary, fontFamily: Fonts.mono }]}>1.0.0</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: c.line }]} />
          <Pressable
            onPress={() => Linking.openURL("mailto:support@hopin.app")}
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.rowLabel, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>Contact support</Text>
            <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
          </Pressable>
        </View>

        {/* Sign out */}
        <Pressable
          onPress={confirmLogout}
          style={({ pressed }) => [styles.signOutBtn, { borderColor: c.line, backgroundColor: c.paperElevated, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.signOutText, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>Sign out</Text>
        </Pressable>

        {/* Delete account */}
        <Pressable
          onPress={confirmDeleteAccount}
          style={{ alignSelf: "center", marginTop: 20, paddingVertical: 8 }}
          hitSlop={12}
        >
          <Text style={[styles.deleteText, { color: c.textMuted, fontFamily: Fonts.bodyMedium }]}>Delete account</Text>
        </Pressable>
      </View>

      <View style={{ height: 40 }} />
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
    paddingBottom: 32,
  },
  initials: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  initialsText: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 1,
  },
  profileName: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.2,
    lineHeight: 38,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 13,
    fontWeight: "400",
    marginBottom: 12,
  },
  roleTag: {
    alignSelf: "flex-start",
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  roleTagText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
  },

  body: {
    paddingHorizontal: 20,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 24,
    marginLeft: 2,
  },
  section: {
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: "400",
    maxWidth: 160,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 18,
  },

  signOutBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 28,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600",
  },
  deleteText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
