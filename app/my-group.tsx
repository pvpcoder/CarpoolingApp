import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";

export default function MyGroup() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<"student" | "parent" | null>(null);

  useEffect(() => {
    loadGroup();
  }, []);

  const loadGroup = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check role
    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("id", user.id)
      .single();

    setUserRole(student ? "student" : "parent");

    // Load group
    const { data: groupData } = await supabase
      .from("carpool_groups")
      .select("id, name, status, max_members, created_at")
      .eq("id", groupId)
      .single();

    setGroup(groupData);

    // Load members with student and parent info
    const { data: memberData } = await supabase
      .from("group_members")
      .select(`
        id, role, joined_at,
        students ( name, grade, saved_pickup_address ),
        parents ( name, phone, email )
      `)
      .eq("group_id", groupId)
      .eq("status", "active");

    setMembers(memberData || []);
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00d4aa" />
      </View>
    );
  }

  const familiesWithParents = members.filter((m: any) => m.parents);
  const familiesWithoutParents = members.filter((m: any) => !m.parents);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{group?.name}</Text>
      <Text style={styles.statusText}>
        {group?.status === "forming"
          ? "🔄 Forming — waiting for families to join"
          : "✅ Active"}
      </Text>
      <Text style={styles.memberCount}>
        {members.length} / {group?.max_members} families
      </Text>

      {/* Members */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Families</Text>
        {members.map((member: any) => (
          <View key={member.id} style={styles.memberCard}>
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
            <Text style={styles.memberGrade}>Grade {member.students?.grade}</Text>
            {member.students?.saved_pickup_address && (
              <Text style={styles.memberAddress}>📍 {member.students.saved_pickup_address}</Text>
            )}
            {member.parents ? (
              <View style={styles.parentInfo}>
                <Text style={styles.parentName}>🚗 {member.parents.name} (Parent)</Text>
                {userRole === "parent" && (
                  <>
                    <Text style={styles.parentContact}>📞 {member.parents.phone}</Text>
                    <Text style={styles.parentContact}>✉️ {member.parents.email}</Text>
                  </>
                )}
              </View>
            ) : (
              <Text style={styles.noParent}>⏳ Parent hasn't joined yet</Text>
            )}
          </View>
        ))}
      </View>

      {/* Status Messages */}
      {familiesWithoutParents.length > 0 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>⚠️ Waiting on parents</Text>
          <Text style={styles.warningText}>
            {familiesWithoutParents.length} {familiesWithoutParents.length === 1 ? "family" : "families"} still
            {familiesWithoutParents.length === 1 ? " needs a" : " need"} parent to join. Each student should invite
            their parent to create an account and link to them.
          </Text>
        </View>
      )}

      {familiesWithParents.length >= 2 && group?.status === "forming" && (
        <View style={styles.readyBox}>
          <Text style={styles.readyTitle}>🎉 Almost ready!</Text>
          <Text style={styles.readyText}>
            You have {familiesWithParents.length} families with parents. Once parents set their
            driving availability, the app can generate a weekly schedule.
          </Text>
        </View>
      )}

      {/* Actions */}
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push("/discover")}
      >
        <Text style={styles.buttonText}>🔍 Invite More Students</Text>
      </TouchableOpacity>

      {myGroupHasSchedule(group) && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push(`/weekly-schedule?groupId=${groupId}`)}
        >
          <Text style={styles.secondaryButtonText}>📅 View Weekly Schedule</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function myGroupHasSchedule(group: any) {
  return group?.status === "active";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  content: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  },
  backText: {
    color: "#00d4aa",
    fontSize: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00d4aa",
    marginBottom: 8,
  },
  statusText: {
    color: "#ccc",
    fontSize: 15,
    marginBottom: 4,
  },
  memberCount: {
    color: "#999",
    fontSize: 14,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  memberCard: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  memberHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  memberName: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },
  adminBadge: {
    backgroundColor: "#00d4aa",
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  adminText: {
    color: "#1a1a2e",
    fontSize: 11,
    fontWeight: "bold",
  },
  memberGrade: {
    color: "#00d4aa",
    fontSize: 14,
    marginBottom: 4,
  },
  memberAddress: {
    color: "#999",
    fontSize: 13,
    marginBottom: 8,
  },
  parentInfo: {
    backgroundColor: "#1a2a3e",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  parentName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 4,
  },
  parentContact: {
    color: "#ccc",
    fontSize: 13,
    marginBottom: 2,
  },
  noParent: {
    color: "#ff6b6b",
    fontSize: 13,
    marginTop: 8,
  },
  warningBox: {
    backgroundColor: "#3a2a1a",
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#ff6b6b",
  },
  warningTitle: {
    color: "#ff6b6b",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 6,
  },
  warningText: {
    color: "#ccc",
    fontSize: 14,
    lineHeight: 20,
  },
  readyBox: {
    backgroundColor: "#1a3a2a",
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#00d4aa",
  },
  readyTitle: {
    color: "#00d4aa",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 6,
  },
  readyText: {
    color: "#ccc",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    backgroundColor: "#00d4aa",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: {
    color: "#1a1a2e",
    fontSize: 16,
    fontWeight: "bold",
  },
  secondaryButton: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#00d4aa",
  },
  secondaryButtonText: {
    color: "#00d4aa",
    fontSize: 16,
    fontWeight: "bold",
  },
});