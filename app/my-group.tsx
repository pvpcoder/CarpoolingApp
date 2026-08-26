import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Linking,
  Platform,
  Pressable,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { getValidUser } from "../lib/helpers";
import { deletedGroups } from "../lib/deletedGroups";
import { SCHOOL } from "../lib/config";
import { useTheme, Fonts, Shadows } from "../lib/theme";
import { PrimaryButton, SecondaryButton, DangerButton, PressableScale, BackButton, FadeIn, LoadingScreen, Watermark, TitleRule } from "../components/UI";

const openDirections = (address: string, lat?: number, lng?: number) => {
  let url: string;
  if (lat && lng) {
    url = Platform.select({ ios: `maps://app?daddr=${lat},${lng}`, default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` }) as string;
  } else {
    const encoded = encodeURIComponent(address);
    url = Platform.select({ ios: `maps://app?daddr=${encoded}`, default: `https://www.google.com/maps/dir/?api=1&destination=${encoded}` }) as string;
  }
  Linking.openURL(url).catch(() => Alert.alert("Error", "Couldn't open maps app."));
};

const openMultiStopDirections = (stops: { lat: number; lng: number; label: string }[]) => {
  if (stops.length === 0) return;
  if (stops.length === 1) { openDirections(stops[0].label, stops[0].lat, stops[0].lng); return; }
  const waypoints = stops.slice(0, -1).map((s) => `${s.lat},${s.lng}`).join("|");
  const dest = stops[stops.length - 1];
  const url = `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&waypoints=${waypoints}`;
  Linking.openURL(url).catch(() => Alert.alert("Error", "Couldn't open maps app."));
};

export default function MyGroup() {
  const router = useRouter();
  const c = useTheme();

  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<"student" | "parent" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => { loadGroup(); }, []);

  const loadGroup = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data: student } = await supabase.from("students").select("id").eq("id", user.id).single();
    setUserRole(student ? "student" : "parent");

    if (student) {
      const { data: membership } = await supabase.from("group_members").select("role").eq("group_id", groupId).eq("student_id", user.id).eq("status", "active").single();
      setIsAdmin(membership?.role === "admin");
    } else {
      const { data: memberships } = await supabase.from("group_members").select("role").eq("group_id", groupId).eq("parent_id", user.id).eq("status", "active");
      setIsAdmin((memberships || []).some((m: any) => m.role === "admin"));
    }

    const { data: groupData } = await supabase.from("carpool_groups").select("id, name, status, max_members, created_at").eq("id", groupId).single();
    setGroup(groupData);

    const { data: memberData } = await supabase.from("group_members").select("id, role, student_id, joined_at, students ( name, grade, saved_pickup_address, saved_pickup_lat, saved_pickup_lng ), parents ( name, phone, email )").eq("group_id", groupId).eq("status", "active");
    setMembers(memberData || []);
    setLoading(false);
  };

  const confirmLeaveGroup = () => {
    Alert.alert("Leave group", "You'll need a new invite to rejoin.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            const user = await getValidUser();
            if (!user) return;
            deletedGroups.add(groupId as string);
            if (userRole === "student") {
              await supabase.from("group_members").update({ status: "inactive" }).eq("group_id", groupId).eq("student_id", user.id);
            } else {
              // Parents don't get their own row — they share the family's row
              // with the student. Null parent_id instead of marking the row
              // "left", so the student's membership isn't removed too.
              await supabase.from("group_members").update({ parent_id: null }).eq("group_id", groupId).eq("parent_id", user.id);
            }
            Alert.alert("Done", "You've left the group.", [{ text: "OK", onPress: () => router.replace("/(tabs)/home") }]);
          } catch {
            Alert.alert("Error", "Couldn't leave group. Try again.");
          }
        },
      },
    ]);
  };

  const confirmDeleteGroup = () => {
    Alert.alert("Delete group", `Permanently delete "${group?.name}"? This removes all members, messages, and schedules and cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => {
        Alert.alert("Final confirmation", "All data for all members will be permanently removed.", [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, delete everything", style: "destructive", onPress: handleDeleteGroup },
        ]);
      }},
    ]);
  };

  const handleSaveName = async () => {
    if (!editName.trim() || editName.trim() === group?.name) { setIsEditingName(false); return; }
    setSavingName(true);
    const { error } = await supabase.from("carpool_groups").update({ name: editName.trim() }).eq("id", groupId);
    setSavingName(false);
    if (error) { Alert.alert("Error", "Couldn't rename the group."); return; }
    setGroup((prev: any) => ({ ...prev, name: editName.trim() }));
    setIsEditingName(false);
  };

  const handleDeleteGroup = async () => {
    setDeleting(true);
    try {
      deletedGroups.add(groupId as string);
      await supabase.from("group_members").update({ status: "inactive" }).eq("group_id", groupId);
      await supabase.from("carpool_groups").update({ status: "archived" }).eq("id", groupId);
      try {
        await supabase.from("group_messages").delete().eq("group_id", groupId);
        await supabase.from("group_invites").delete().eq("group_id", groupId);
        await supabase.from("parent_availability").delete().eq("group_id", groupId);
        await supabase.from("weekly_schedules").delete().eq("group_id", groupId);
        await supabase.from("group_members").delete().eq("group_id", groupId);
        await supabase.from("carpool_groups").delete().eq("id", groupId);
      } catch {}
      setDeleting(false);
      Alert.alert("Group deleted", "The carpool group has been removed.", [{ text: "OK", onPress: () => router.replace("/(tabs)/home") }]);
    } catch {
      setDeleting(false);
      Alert.alert("Error", "Couldn't delete the group. Please try again.");
    }
  };

  const handleGetAllDirections = () => {
    const stops = members.filter((m: any) => m.students?.saved_pickup_lat && m.students?.saved_pickup_lng && m.student_id !== currentUserId).map((m: any) => ({ lat: m.students.saved_pickup_lat, lng: m.students.saved_pickup_lng, label: m.students.saved_pickup_address || m.students.name }));
    if (stops.length === 0) { Alert.alert("No addresses", "No students have set their pickup address yet."); return; }
    openMultiStopDirections(stops);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  const familiesWithoutParents = members.filter((m: any) => !m.parents);
  const familiesWithParents = members.filter((m: any) => m.parents);

  return (
    <View style={[styles.root, { backgroundColor: c.paper }]}>
      <Watermark />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
      <BackButton onPress={() => router.back()} />

      {/* Title */}
      {isEditingName ? (
        <View style={styles.editNameRow}>
          <TextInput
            style={[styles.editNameInput, { color: c.textPrimary, borderColor: c.dawn, fontFamily: Fonts.bodyBold }]}
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
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: c.textPrimary, flex: 1, fontFamily: Fonts.display }]}>{group?.name}</Text>
          {isAdmin && (
            <Pressable
              onPress={() => { setEditName(group?.name || ""); setIsEditingName(true); }}
              style={{ padding: 6, marginTop: 4 }}
              hitSlop={8}
            >
              <Ionicons name="pencil-outline" size={18} color={c.textMuted} />
            </Pressable>
          )}
        </View>
      )}
      <TitleRule style={{ marginBottom: 14 }} />
      <View style={styles.meta}>
        <View style={[styles.statusBadge, { backgroundColor: group?.status === "active" ? c.dawnFaded : c.rustFaded }]}>
          <Text style={[styles.statusText, { color: group?.status === "active" ? c.dawn : c.rust, fontFamily: Fonts.bodyBold }]}>
            {group?.status === "forming" ? "Forming" : "Active"}
          </Text>
        </View>
        <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
        <Text style={[styles.metaText, { color: c.textSecondary, fontFamily: Fonts.mono }]}>{members.length}/{group?.max_members} families</Text>
        {isAdmin && (
          <>
            <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
            <Text style={[styles.metaText, { color: c.dawn, fontFamily: Fonts.body }]}>Admin</Text>
          </>
        )}
      </View>

      {/* School */}
      <FadeIn>
        <View style={[styles.card, { backgroundColor: c.paperElevated, borderColor: c.line }, Shadows?.sm as object]}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="school-outline" size={15} color={c.textMuted} />
            <Text style={[styles.cardTitle, { color: c.textPrimary, fontFamily: Fonts.bodyBold, marginBottom: 0 }]}>{SCHOOL.name}</Text>
          </View>
          <Text style={[styles.cardSub, { color: c.textSecondary, fontFamily: Fonts.body }]}>{SCHOOL.address}</Text>
          <PressableScale
            onPress={() => openDirections(SCHOOL.address, SCHOOL.lat, SCHOOL.lng)}
            style={styles.dirBtn}
          >
            <Ionicons name="navigate-outline" size={13} color={c.dawn} />
            <Text style={[styles.dirBtnText, { color: c.dawn, fontFamily: Fonts.bodySemiBold }]}>Get directions</Text>
          </PressableScale>
        </View>
      </FadeIn>

      {/* Route all (parent) */}
      {userRole === "parent" && members.length > 1 && (
        <PressableScale
          onPress={handleGetAllDirections}
          style={[styles.routeAllBtn, { backgroundColor: c.dawn }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.routeAllTitle, { fontFamily: Fonts.bodyBold }]}>Route to all students</Text>
            <Text style={[styles.routeAllSub, { fontFamily: Fonts.body }]}>Multi-stop directions in maps</Text>
          </View>
          <Ionicons name="navigate" size={18} color="#FFFFFF" />
        </PressableScale>
      )}

      {/* Discover button (admin) */}
      {isAdmin && (
        <PressableScale
          onPress={() => router.push(`/discover?groupId=${groupId}`)}
          style={[styles.linkRow, { backgroundColor: c.paperElevated, borderColor: c.line }]}
        >
          <Text style={[styles.linkText, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>Find nearby students</Text>
          <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
        </PressableScale>
      )}

      {/* Weekly exceptions (student) */}
      {userRole === "student" && (
        <PressableScale
          onPress={() => router.push(`/student-schedule?groupId=${groupId}`)}
          style={[styles.linkRow, { backgroundColor: c.paperElevated, borderColor: c.line }]}
        >
          <Text style={[styles.linkText, { color: c.textPrimary, fontFamily: Fonts.bodyMedium }]}>Late pickups & no-ride days</Text>
          <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
        </PressableScale>
      )}

      {/* Families */}
      <View style={[styles.memberList, { borderColor: c.line, marginTop: 4 }]}>
        {members.map((member: any, i: number) => (
          <FadeIn key={member.id} delay={Math.min(i, 6) * 40}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: c.line }]} />}
            <View style={styles.memberRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.memberNameRow}>
                  <Text style={[styles.memberName, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{member.students?.name || "Student"}</Text>
                  {member.role === "admin" && (
                    <View style={[styles.adminBadge, { backgroundColor: c.dawnFaded }]}>
                      <Text style={[styles.adminText, { color: c.dawn, fontFamily: Fonts.bodyBold }]}>Admin</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.memberGrade, { color: c.textSecondary, fontFamily: Fonts.mono }]}>Grade {member.students?.grade}</Text>
                {member.students?.saved_pickup_address && (
                  <View style={styles.addrRow}>
                    <Text style={[styles.memberAddr, { color: c.textMuted, fontFamily: Fonts.body }]} numberOfLines={2}>
                      {member.students.saved_pickup_address}
                    </Text>
                    {userRole === "parent" && (
                      <PressableScale
                        onPress={() => openDirections(member.students.saved_pickup_address, member.students.saved_pickup_lat, member.students.saved_pickup_lng)}
                        style={styles.dirBtnSmall}
                      >
                        <Ionicons name="navigate-outline" size={12} color={c.dawn} />
                        <Text style={[styles.dirBtnSmallText, { color: c.dawn, fontFamily: Fonts.bodySemiBold }]}>Directions</Text>
                      </PressableScale>
                    )}
                  </View>
                )}
                {member.parents ? (
                  <View style={[styles.parentBlock, { backgroundColor: c.paper, borderColor: c.line }]}>
                    <Text style={[styles.parentLabel, { color: c.textMuted, fontFamily: Fonts.bodySemiBold }]}>Parent</Text>
                    <Text style={[styles.parentName, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>{member.parents.name}</Text>
                    {userRole === "parent" && (
                      <View style={styles.contactRow}>
                        {member.parents.phone ? (
                          <Pressable onPress={() => Linking.openURL(`tel:${member.parents.phone.replace(/\D/g, "")}`)}>
                            <Text style={[styles.parentContact, { color: c.dawn, fontFamily: Fonts.mono }]}>{member.parents.phone}</Text>
                          </Pressable>
                        ) : null}
                        {member.parents.phone && member.parents.email ? (
                          <Text style={[styles.parentContact, { color: c.textMuted, fontFamily: Fonts.body }]}>·</Text>
                        ) : null}
                        {member.parents.email ? (
                          <Pressable onPress={() => Linking.openURL(`mailto:${member.parents.email}`)}>
                            <Text style={[styles.parentContact, { color: c.dawn, fontFamily: Fonts.body }]}>{member.parents.email}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={[styles.noParent, { color: c.textMuted, fontFamily: Fonts.body }]}>Parent hasn't joined yet</Text>
                )}
              </View>
            </View>
          </FadeIn>
        ))}
      </View>

      {/* Warnings */}
      {familiesWithoutParents.length > 0 && (
        <View style={[styles.notice, { backgroundColor: c.rustFaded, borderColor: c.rustBorder }]}>
          <Text style={[styles.noticeTitle, { color: c.rust, fontFamily: Fonts.bodyBold }]}>Waiting on parents</Text>
          <Text style={[styles.noticeText, { color: c.textSecondary, fontFamily: Fonts.body }]}>
            {familiesWithoutParents.length} {familiesWithoutParents.length === 1 ? "family still needs a parent" : "families still need a parent"} to join.
          </Text>
        </View>
      )}

      {familiesWithParents.length >= 2 && group?.status === "forming" && (
        <View style={[styles.notice, { backgroundColor: c.dawnFaded, borderColor: c.dawnBorder }]}>
          <Text style={[styles.noticeTitle, { color: c.dawn, fontFamily: Fonts.bodyBold }]}>Almost ready</Text>
          <Text style={[styles.noticeText, { color: c.textSecondary, fontFamily: Fonts.body }]}>
            {familiesWithParents.length} families have parents. Once they set availability, a schedule can be generated.
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <PrimaryButton
          title="Invite more students"
          onPress={() => router.push(`/discover?groupId=${groupId}`)}
        />
        <SecondaryButton
          title={group?.status === "active" ? "View weekly schedule" : "Generate schedule"}
          onPress={() => router.push(`/weekly-schedule?groupId=${groupId}`)}
        />
        <SecondaryButton
          title="Group chat"
          icon="chatbubble-ellipses-outline"
          onPress={() => router.push(`/group-chat?groupId=${groupId}`)}
        />
      </View>

      {/* Leave / Delete */}
      <View style={[styles.dangerSection, { borderTopColor: c.line }]}>
        {!isAdmin ? (
          <Pressable onPress={confirmLeaveGroup} style={{ alignSelf: "flex-start" }} hitSlop={12}>
            <Text style={[styles.dangerLink, { color: c.rust, fontFamily: Fonts.bodySemiBold }]}>Leave group</Text>
          </Pressable>
        ) : (
          <>
            <Text style={[styles.dangerLabel, { color: c.textMuted, fontFamily: Fonts.bodyBold }]}>DANGER ZONE</Text>
            <Text style={[styles.dangerHint, { color: c.textMuted, fontFamily: Fonts.body }]}>
              Permanently removes the group and all data for all members.
            </Text>
            <DangerButton
              title={deleting ? "Deleting…" : "Delete group"}
              onPress={confirmDeleteGroup}
            />
          </>
        )}
      </View>

      <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 48 },

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  title: {
    fontSize: 40,
    letterSpacing: -1.5,
    lineHeight: 42,
  },
  editNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  editNameInput: {
    flex: 1,
    fontSize: 24,
    letterSpacing: -0.5,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  editNameSave: {
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  editNameSaveText: {
    color: "#FFFFFF",
    fontSize: 14,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 8,
  },
  statusBadge: {
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statusText: { fontSize: 11 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
  metaText: { fontSize: 13 },

  card: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 3,
  },
  cardTitle: {
    fontSize: 16,
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  cardSub: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  dirBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
  },
  dirBtnText: { fontSize: 13 },

  routeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    gap: 12,
  },
  routeAllTitle: { fontSize: 15, color: "#FFFFFF", marginBottom: 2 },
  routeAllSub: { fontSize: 12, color: "rgba(255,255,255,0.6)" },

  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 24,
  },
  linkText: { fontSize: 15, flex: 1 },

  memberList: {
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
  },
  divider: { height: StyleSheet.hairlineWidth },
  memberRow: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  memberName: { fontSize: 15, letterSpacing: -0.2 },
  adminBadge: { borderRadius: 5, paddingVertical: 2, paddingHorizontal: 8 },
  adminText: { fontSize: 11 },
  memberGrade: { fontSize: 13, marginBottom: 6 },
  addrRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  memberAddr: { fontSize: 12, flex: 1, lineHeight: 17 },
  dirBtnSmall: { flexDirection: "row", alignItems: "center", gap: 4 },
  dirBtnSmallText: { fontSize: 12 },
  parentBlock: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  parentLabel: { fontSize: 10, letterSpacing: 0.4, marginBottom: 3 },
  parentName: { fontSize: 14, marginBottom: 3 },
  parentContact: { fontSize: 12, lineHeight: 17 },
  contactRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 2 },
  noParent: { fontSize: 12, fontStyle: "italic", marginTop: 4 },

  notice: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  noticeTitle: { fontSize: 13, marginBottom: 4 },
  noticeText: { fontSize: 13, lineHeight: 18 },

  actions: { gap: 10, marginTop: 12, marginBottom: 28 },

  dangerSection: {
    borderTopWidth: 1,
    paddingTop: 24,
  },
  dangerLabel: { fontSize: 10, letterSpacing: 0.8, marginBottom: 6 },
  dangerHint: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  dangerLink: { fontSize: 14 },
});
