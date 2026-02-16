import { useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function ParentHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [childName, setChildName] = useState<string | null>(null);
  const [myGroup, setMyGroup] = useState<any>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [hasAvailability, setHasAvailability] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/");
      return;
    }

    const { data: parent } = await supabase
      .from("parents")
      .select("id, student_id")
      .eq("id", user.id)
      .single();

    if (!parent) {
      setLoading(false);
      return;
    }

    setParentId(parent.id);

    // Get child's name
    if (parent.student_id) {
      const { data: student } = await supabase
        .from("students")
        .select("name")
        .eq("id", parent.student_id)
        .single();

      setChildName(student?.name || null);

      // Find the group the child is in
      const { data: membership } = await supabase
        .from("group_members")
        .select(`
          group_id,
          carpool_groups ( id, name, status )
        `)
        .eq("student_id", parent.student_id)
        .eq("status", "active")
        .limit(1);

      if (membership && membership.length > 0) {
        const group = (membership[0] as any).carpool_groups;
        setMyGroup(group);
        setGroupId(group.id);

        // Auto-join the group as the parent if not already
        const { data: existingMember } = await supabase
          .from("group_members")
          .select("id")
          .eq("group_id", group.id)
          .eq("student_id", parent.student_id)
          .single();

        if (existingMember) {
          // Update the member row to include parent_id
          await supabase
            .from("group_members")
            .update({ parent_id: parent.id })
            .eq("id", existingMember.id);
        }

        // Check if parent has set availability
        const { data: availability } = await supabase
          .from("parent_availability")
          .select("id")
          .eq("parent_id", parent.id)
          .eq("group_id", group.id)
          .limit(1);

        setHasAvailability((availability || []).length > 0);
      }
    }

    setLoading(false);
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
      <Text style={styles.title}>🚗 RidePool</Text>

      {/* Child Link */}
      {childName ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>👤 Your child</Text>
          <Text style={styles.cardText}>{childName}</Text>
        </View>
      ) : (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>⚠️ No child linked</Text>
          <Text style={styles.warningText}>
            Your account isn't linked to a student yet. Make sure your child signs up first with their @pdsb.net email.
          </Text>
        </View>
      )}

      {/* Group */}
      {myGroup ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Carpool Group</Text>
          <TouchableOpacity
            style={styles.groupCard}
            onPress={() => router.push(`/my-group?groupId=${myGroup.id}`)}
          >
            <Text style={styles.groupName}>{myGroup.name}</Text>
            <Text style={styles.groupStatus}>
              {myGroup.status === "forming" ? "🔄 Forming" : "✅ Active"}
            </Text>
            <Text style={styles.tapHint}>Tap to view group →</Text>
          </TouchableOpacity>
        </View>
      ) : childName ? (
        <View style={styles.noGroupSection}>
          <Text style={styles.noGroupTitle}>No carpool group yet</Text>
          <Text style={styles.noGroupText}>
            Your child hasn't joined a carpool group yet. They can create or join one from their app.
          </Text>
        </View>
      ) : null}

      {/* Availability */}
      {myGroup && (
        <TouchableOpacity
          style={hasAvailability ? styles.secondaryButton : styles.primaryButton}
          onPress={() => router.push(`/availability?groupId=${groupId}`)}
        >
          <Text style={hasAvailability ? styles.secondaryButtonText : styles.buttonText}>
            {hasAvailability ? "✏️ Edit My Driving Availability" : "🗓️ Set My Driving Availability"}
          </Text>
        </TouchableOpacity>
      )}

      {!hasAvailability && myGroup && (
        <View style={styles.nudgeBox}>
          <Text style={styles.nudgeText}>
            👆 Set your availability so the app can create a fair driving schedule for the group.
          </Text>
        </View>
      )}

      {/* Schedule */}
      {myGroup && hasAvailability && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push(`/weekly-schedule?groupId=${groupId}`)}
        >
          <Text style={styles.secondaryButtonText}>📅 View Weekly Schedule</Text>
        </TouchableOpacity>
      )}

      {/* Group Detail */}
      {myGroup && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push(`/my-group?groupId=${myGroup.id}`)}
        >
          <Text style={styles.secondaryButtonText}>👥 View Group Members</Text>
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
    marginBottom: 8,
  },
  tapHint: {
    color: "#00d4aa",
    fontSize: 13,
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
  nudgeBox: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  nudgeText: {
    color: "#999",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
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