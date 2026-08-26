import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { getValidUser, handleLogout } from "../../lib/helpers";
import { registerForPushNotifications } from "../../lib/notifications";
import { linkParentToChildByEmail } from "../../lib/parentLinking";
import { getOrCreateCalendarFeedUrl, toWebcalUrl } from "../../lib/calendarFeed";
import * as Clipboard from "expo-clipboard";
import { track } from "../../lib/analytics";
import { useTheme, Fonts } from "../../lib/theme";
import { LoadingScreen, FadeIn, Watermark, TitleRule, ListSection, ListRow, ToggleSwitch } from "../../components/UI";

export default function ProfileTab() {
  const router = useRouter();
  const c = useTheme();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<"student" | "parent" | null>(null);
  const [linkedChildren, setLinkedChildren] = useState<{ id: string; name: string }[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [isLinkingChild, setIsLinkingChild] = useState(false);
  const [linkChildEmail, setLinkChildEmail] = useState("");
  const [linkingBusy, setLinkingBusy] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);

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
      setUserId(user.id);
      setUserEmail(user.email || "");

      const { data: tokenRow } = await supabase.from("push_tokens").select("id").eq("user_id", user.id).limit(1).maybeSingle();
      setNotificationsEnabled(!!tokenRow);

      const { data: student } = await supabase
        .from("students")
        .select("id, name")
        .eq("id", user.id)
        .single();

      if (student) {
        setUserRole("student");
        setUserName(student.name || "");
      } else {
        const { data: parent } = await supabase
          .from("parents")
          .select("id, name")
          .eq("id", user.id)
          .single();
        if (parent) {
          setUserRole("parent");
          setUserName(parent.name || "");

          const { data: links } = await supabase
            .from("parent_student_links")
            .select("students ( id, name )")
            .eq("parent_id", user.id);
          setLinkedChildren((links || []).map((l: any) => l.students).filter(Boolean));
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

  const handleLinkChild = async () => {
    if (!linkChildEmail.trim() || !userId) { setIsLinkingChild(false); return; }
    setLinkingBusy(true);
    const result = await linkParentToChildByEmail(userId, linkChildEmail);
    setLinkingBusy(false);
    if (!result.success) {
      Alert.alert("Couldn't link child", result.error || "Please try again.");
      return;
    }
    setLinkChildEmail("");
    setIsLinkingChild(false);
    track(userId, "child_linked");
    Alert.alert("Linked", `${result.studentName || "Student"} is now linked to your account.`);
    loadSettings();
  };

  const handleSaveName = async () => {
    if (!editName.trim() || editName.trim() === userName || !userId) { setIsEditingName(false); return; }
    setSavingName(true);
    const table = userRole === "student" ? "students" : "parents";
    const { error } = await supabase.from(table).update({ name: editName.trim() }).eq("id", userId);
    setSavingName(false);
    if (error) { Alert.alert("Error", "Couldn't update your name."); return; }
    setUserName(editName.trim());
    setIsEditingName(false);
  };

  const handleToggleNotifications = async (next: boolean) => {
    if (!userId || notificationsBusy) return;
    setNotificationsBusy(true);
    if (next) {
      await registerForPushNotifications(userId);
      const { data: tokenRow } = await supabase.from("push_tokens").select("id").eq("user_id", userId).limit(1).maybeSingle();
      setNotificationsEnabled(!!tokenRow);
      if (!tokenRow) {
        Alert.alert("Couldn't enable notifications", "Check that notifications are allowed for this app in your device settings.");
      } else {
        track(userId, "notifications_toggled", { enabled: true });
      }
    } else {
      track(userId, "notifications_toggled", { enabled: false });
      await supabase.from("push_tokens").delete().eq("user_id", userId);
      setNotificationsEnabled(false);
    }
    setNotificationsBusy(false);
  };

  const handleAddToCalendar = async () => {
    if (!userId || calendarBusy) return;
    setCalendarBusy(true);
    try {
      const feedUrl = await getOrCreateCalendarFeedUrl(userId);
      const webcalUrl = toWebcalUrl(feedUrl);
      track(userId, "calendar_subscribed");
      Alert.alert(
        "Subscribe to your schedule",
        "Add this feed to your phone's calendar app so it stays up to date automatically as new weeks are scheduled.",
        [
          { text: "Copy link", onPress: () => Clipboard.setStringAsync(feedUrl) },
          {
            text: "Open in Calendar",
            onPress: () => Linking.openURL(webcalUrl).catch(() => Clipboard.setStringAsync(feedUrl).then(() => Alert.alert("Link copied", "Paste it into your calendar app's \"Add subscription calendar\" option."))),
          },
          { text: "Cancel", style: "cancel" },
        ]
      );
    } catch (err: any) {
      Alert.alert("Couldn't create calendar link", err?.message || "Please try again.");
    } finally {
      setCalendarBusy(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => handleLogout(router) },
    ]);
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
                      const { error } = await supabase.functions.invoke("delete-account");
                      if (error) throw error;
                      await supabase.auth.signOut();
                      router.replace("/");
                    } catch (err: any) {
                      const detail = await err?.context?.json?.().catch(() => null);
                      console.log("delete-account failed:", detail?.error || err?.message || err);
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
    <View style={[styles.root, { backgroundColor: c.paper }]}>
      <Watermark />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
      {/* Header */}
      <FadeIn>
        <View style={styles.header}>
          <View style={[styles.initials, { backgroundColor: c.dawnFaded }]}>
            <Text style={[styles.initialsText, { color: c.dawn, fontFamily: Fonts.display }]}>{initials}</Text>
          </View>

          {isEditingName ? (
            <View style={styles.editNameRow}>
              <TextInput
                style={[styles.editNameInput, { color: c.textPrimary, borderColor: c.dawn, fontFamily: Fonts.display }]}
                value={editName}
                onChangeText={setEditName}
                autoFocus
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
              />
              <Pressable onPress={handleSaveName} disabled={savingName} style={[styles.editNameSave, { backgroundColor: c.dawn }]}>
                <Text style={[styles.editNameSaveText, { fontFamily: Fonts.bodyBold }]}>{savingName ? "…" : "Save"}</Text>
              </Pressable>
              <Pressable onPress={() => setIsEditingName(false)} hitSlop={12} style={{ padding: 8 }}>
                <Ionicons name="close" size={18} color={c.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => { setEditName(userName); setIsEditingName(true); }}
              style={styles.nameRow}
              hitSlop={8}
            >
              <Text style={[styles.profileName, { color: c.textPrimary, fontFamily: Fonts.display }]}>{userName || "User"}</Text>
              <Ionicons name="pencil-outline" size={16} color={c.textMuted} style={{ marginLeft: 8, marginBottom: 6 }} />
            </Pressable>
          )}

          <TitleRule />
          <Text style={[styles.profileEmail, { color: c.textMuted, fontFamily: Fonts.body }]}>{userEmail}</Text>
          <View style={[styles.roleTag, { backgroundColor: c.dawnFaded, borderColor: c.dawnBorder }]}>
            <Text style={[styles.roleTagText, { color: c.dawn, fontFamily: Fonts.bodyBold }]}>
              {userRole === "student" ? "STUDENT" : "PARENT"}
            </Text>
          </View>
        </View>
      </FadeIn>

      <View style={styles.body}>
        {/* Account — account-level only. Group actions (leave, invite,
            schedule, chat) live on the group's own screen, not here. */}
        <ListSection label="ACCOUNT">
          {userRole === "parent" && linkedChildren.map((child, i) => (
            <ListRow key={child.id || i} label={linkedChildren.length > 1 ? `Linked child ${i + 1}` : "Linked child"} value={child.name} />
          ))}
          {userRole === "parent" && isLinkingChild && (
            <View style={styles.linkChildRow}>
              <TextInput
                style={[styles.linkChildInput, { color: c.textPrimary, borderColor: c.dawn, fontFamily: Fonts.body }]}
                value={linkChildEmail}
                onChangeText={setLinkChildEmail}
                placeholder="Child's school email"
                placeholderTextColor={c.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleLinkChild}
              />
              <Pressable onPress={handleLinkChild} disabled={linkingBusy} style={[styles.editNameSave, { backgroundColor: c.dawn }]}>
                <Text style={[styles.editNameSaveText, { fontFamily: Fonts.bodyBold }]}>{linkingBusy ? "…" : "Link"}</Text>
              </Pressable>
              <Pressable onPress={() => { setIsLinkingChild(false); setLinkChildEmail(""); }} hitSlop={12} style={{ padding: 8 }}>
                <Ionicons name="close" size={18} color={c.textMuted} />
              </Pressable>
            </View>
          )}
          {userRole === "parent" && !isLinkingChild && (
            <ListRow label={linkedChildren.length > 0 ? "Link another child" : "Link a child"} onPress={() => setIsLinkingChild(true)} />
          )}
          <ListRow label="Change password" onPress={handleResetPassword} />
          {userRole === "student" && (
            <ListRow label="Pickup location" onPress={() => router.push("/setup-location")} />
          )}
        </ListSection>

        {/* Preferences */}
        <ListSection label="PREFERENCES">
          <View style={styles.toggleRow}>
            <Text style={[styles.listRowLabelStandin, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>Push notifications</Text>
            <ToggleSwitch value={notificationsEnabled} onValueChange={handleToggleNotifications} />
          </View>
          <ListRow label="Subscribe to calendar" onPress={handleAddToCalendar} />
        </ListSection>

        {/* About — a quiet unlabeled footer list, not a third identical section */}
        <ListSection>
          <ListRow label="Version" value="1.0.0" />
          <ListRow label="Contact support" onPress={() => Linking.openURL("mailto:support@hopin.app")} />
          <ListRow label="Privacy Policy" onPress={() => Alert.alert("Coming soon", "Our privacy policy is being finalized.")} />
          <ListRow label="Terms of Service" onPress={() => Alert.alert("Coming soon", "Our terms of service are being finalized.")} />
        </ListSection>

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
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  root: { flex: 1 },
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
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    alignSelf: "flex-start",
  },
  profileName: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.2,
    lineHeight: 38,
    marginBottom: 4,
  },
  editNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  editNameInput: {
    flex: 1,
    fontSize: 22,
    letterSpacing: -0.5,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editNameSave: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editNameSaveText: {
    color: "#FFFFFF",
    fontSize: 13,
  },
  linkChildRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  linkChildInput: {
    flex: 1,
    fontSize: 15,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
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

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  listRowLabelStandin: {
    fontSize: 16,
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
