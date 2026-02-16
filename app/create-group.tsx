import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function CreateGroup() {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [studentData, setStudentData] = useState<any>(null);

  useEffect(() => {
    loadStudent();
  }, []);

  const loadStudent = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("students")
      .select("id, school_id, name")
      .eq("id", user.id)
      .single();

    setStudentData(data);
    if (data) {
      setGroupName(`${data.name}'s Carpool`);
    }
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      Alert.alert("Error", "Please enter a group name.");
      return;
    }

    if (!studentData) return;

    setLoading(true);

    // Create the group
    const { data: group, error: groupError } = await supabase
      .from("carpool_groups")
      .insert({
        name: groupName.trim(),
        school_id: studentData.school_id,
        status: "forming",
        created_by: studentData.id,
      })
      .select("id")
      .single();

    if (groupError) {
      setLoading(false);
      Alert.alert("Error", groupError.message);
      return;
    }

    // Add myself as the first member (admin)
    const { error: memberError } = await supabase
      .from("group_members")
      .insert({
        group_id: group.id,
        student_id: studentData.id,
        role: "admin",
        status: "active",
      });

    setLoading(false);

    if (memberError) {
      Alert.alert("Error", memberError.message);
      return;
    }

    Alert.alert(
      "Group Created! 🎉",
      "Now invite students from the discover screen to join your carpool.",
      [
        {
          text: "Invite Students",
          onPress: () => router.replace("/discover"),
        },
        {
          text: "Go Home",
          onPress: () => router.replace("/student-home"),
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create a Carpool Group</Text>
        <Text style={styles.subtitle}>
          Start a group and invite nearby students. Once everyone's parents join, 
          the app will create a fair driving schedule.
        </Text>

        <Text style={styles.label}>Group Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., North Park Crew"
          placeholderTextColor="#999"
          value={groupName}
          onChangeText={setGroupName}
        />

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>How it works:</Text>
          <Text style={styles.infoStep}>1. You create the group</Text>
          <Text style={styles.infoStep}>2. Invite 2-4 students from your area</Text>
          <Text style={styles.infoStep}>3. Each student's parent joins the app</Text>
          <Text style={styles.infoStep}>4. Parents enter when they can drive</Text>
          <Text style={styles.infoStep}>5. The app creates a fair weekly schedule</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Creating..." : "Create Group"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  inner: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
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
  subtitle: {
    fontSize: 14,
    color: "#ccc",
    lineHeight: 20,
    marginBottom: 32,
  },
  label: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  input: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#fff",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  infoBox: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  infoTitle: {
    color: "#00d4aa",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  infoStep: {
    color: "#ccc",
    fontSize: 14,
    lineHeight: 24,
  },
  button: {
    backgroundColor: "#00d4aa",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#1a1a2e",
    fontSize: 18,
    fontWeight: "bold",
  },
});