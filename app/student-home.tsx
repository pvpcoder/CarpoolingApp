import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function StudentHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pickupAddress, setPickupAddress] = useState<string | null>(null);
  const [myGroup, setMyGroup] = useState<any>(null);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);

useFocusEffect(
    useCallback(() => {
      checkProfile();
    }, [])
  );

  const checkProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/");
      return;
    }

    const { data: student } = await supabase
      .from("students")
      .select("id, saved_pickup_lat, saved_pickup_address")
      .eq("id", user.id)
      .single();

    if (student && !student.saved_pickup_lat) {
      router.replace("/setup-location");
      return;
    }

    setPickupAddress(student?.saved_pickup_address || null);

    // Check if in a group
    const { data: membership } = await supabase
      .from("group_members")
      .select(`
        group_id, role,
        carpool_groups ( id, name, status )
      `)
      .eq("student_id", student?.id)
      .eq("status", "active")
      .limit(1);

    if (membership && membership.length > 0) {
      const group = (membership[0] as any).carpool_groups;
      setMyGroup(group);

      // Load group members
      const { data: members } = await supabase
        .from("group_members")
        .select(`
          id, role,
          students ( name, grade ),
          parents ( name, phone )
        `)
        .eq("group_id", group.id)
        .eq("status", "active");

      setGroupMembers(members || []);
    }

    // Check for pending invites TO me
    const { data: invites } = await supabase
      .from("group_invites")
      .select(`
        id, group_id, status,
        carpool_groups ( name ),
        invited_by_student:students!group_invites_invited_by_fkey ( name )
      `)
      .eq("invited_student_id", student?.id)
      .eq("status", "pending");

    setPendingInvites(invites || []);
    setLoading(false);
  };

  const handleInviteResponse = async (inviteId: string, groupId: string, accept: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Update invite status
    await supabase
      .from("group_invites")
      .update({ status: accept ? "accepted" : "declined" })
      .eq("id", inviteId);

    if (accept) {
      // Add to group
      await supabase.from("group_members").insert({
        group_id: groupId,
        student_id: user.id,
        role: "member",
        status: "active",
      });

      Alert.alert("Joined! 🎉", "You're now part of the carpool group.");
    }

    checkProfile(); // Refresh
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00d4aa" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🎒 RidePool</Text>

      {/* Pickup Location */}
      {pickupAddress && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>📍 Your pickup spot</Text>
          <Text style={styles.cardText}>{pickupAddress}</Text>
        </View>
      )}

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Group Invites</Text>
          {pendingInvites.map((invite: any) => (
            <View key={invite.id} style={styles.inviteCard}>
              <Text style={styles.inviteName}>
                {invite.carpool_groups?.name || "Carpool Group"}
              </Text>
              <Text style={styles.inviteFrom}>
                Invited by {(invite.invited_by_student as any)?.name || "a classmate"}
              </Text>
              <View style={styles.inviteActions}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => handleInviteResponse(invite.id, invite.group_id, true)}
                >
                  <Text style={styles.acceptText}>✅ Join</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineButton}
                  onPress={() => handleInviteResponse(invite.id, invite.group_id, false)}
                >
                  <Text style={styles.declineText}>❌ Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* My Group */}
      {myGroup ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Carpool Group</Text>
          <TouchableOpacity
            style={styles.groupCard}
            onPress={() => router.push(`/my-group?groupId=${myGroup.id}`)}
          >
            <Text style={styles.groupName}>{myGroup.name}</Text>
            <Text style={styles.groupStatus}>
              {myGroup.status === "forming" ? "🔄 Forming — invite more students" : "✅ Active"}
            </Text>
            <Text style={styles.groupMembers}>
              {groupMembers.length} {groupMembers.length === 1 ? "family" : "families"} joined
            </Text>
            <Text style={styles.tapHint}>Tap to view group →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.noGroupSection}>
          <Text style={styles.noGroupTitle}>No carpool group yet</Text>
          <Text style={styles.noGroupText}>
            Create a group or find nearby students to carpool with.
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      {!myGroup && (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push("/create-group")}
        >
          <Text style={styles.primaryButtonText}>✨ Create a Carpool Group</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => router.push("/discover")}
      >
        <Text style={styles.primaryButtonText}>🔍 Find Nearby Students</Text>
      </TouchableOpacity>

      {myGroup && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push(`/student-schedule?groupId=${myGroup.id}`)}
        >
          <Text style={styles.primaryButtonText}>📅 My Schedule & Exceptions</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
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
  centerContainer: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00d4aa",
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  cardLabel: {
    color: "#00d4aa",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  cardText: {
    color: "#fff",
    fontSize: 15,
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
  inviteCard: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#00d4aa",
  },
  inviteName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  inviteFrom: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 14,
  },
  inviteActions: {
    flexDirection: "row",
    gap: 10,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: "#1a4a3a",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#00d4aa",
  },
  declineButton: {
    flex: 1,
    backgroundColor: "#4a1a1a",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ff6b6b",
  },
  acceptText: {
    color: "#00d4aa",
    fontSize: 15,
    fontWeight: "bold",
  },
  declineText: {
    color: "#ff6b6b",
    fontSize: 15,
    fontWeight: "bold",
  },
  groupCard: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  groupName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 6,
  },
  groupStatus: {
    color: "#00d4aa",
    fontSize: 14,
    marginBottom: 4,
  },
  groupMembers: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 8,
  },
  tapHint: {
    color: "#00d4aa",
    fontSize: 13,
  },
  noGroupSection: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 12,
  },
  noGroupTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  noGroupText: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#00d4aa",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
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
  primaryButtonText: {
    color: "#1a1a2e",
    fontSize: 16,
    fontWeight: "bold",
  },
  logoutButton: {
    backgroundColor: "#2a2a4a",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  logoutText: {
    color: "#ff6b6b",
    fontSize: 16,
    fontWeight: "bold",
  },
}); 