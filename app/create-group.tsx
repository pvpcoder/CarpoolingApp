import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import { FadeIn, PrimaryButton, BackButton, Card } from "../components/UI";

export default function CreateGroup() {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [studentData, setStudentData] = useState<any>(null);

  useEffect(() => { loadStudent(); }, []);

  const loadStudent = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("students").select("id, school_id, name").eq("id", user.id).single();
    setStudentData(data);
    if (data) setGroupName(`${data.name}'s Carpool`);
  };

  const handleCreate = async () => {
    if (!groupName.trim()) { Alert.alert("Error", "Please enter a group name."); return; }
    if (!studentData) return;
    setLoading(true);

    const { data: group, error: groupError } = await supabase.from("carpool_groups").insert({
      name: groupName.trim(), school_id: studentData.school_id, status: "forming", created_by: studentData.id,
    }).select("id").single();

    if (groupError) { setLoading(false); Alert.alert("Error", groupError.message); return; }

    const { error: memberError } = await supabase.from("group_members").insert({
      group_id: group.id, student_id: studentData.id, role: "admin", status: "active",
    });

    setLoading(false);
    if (memberError) { Alert.alert("Error", memberError.message); return; }

    Alert.alert("Group Created!", "Now invite students from the discover screen to join your carpool.", [
      { text: "Invite Students", onPress: () => router.replace("/discover") },
      { text: "Go Home", onPress: () => router.replace("/student-home") },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.inner}>
        <BackButton onPress={() => router.back()} />
        <FadeIn>
          <Text style={styles.title}>Create a Carpool Group</Text>
          <Text style={styles.subtitle}>
            Start a group and invite nearby students. Once everyone's parents join, the app will create a fair driving schedule.
          </Text>
        </FadeIn>

        <FadeIn delay={150}>
          <Text style={styles.label}>Group Name</Text>
          <TextInput style={styles.input} placeholder="e.g., North Park Crew" placeholderTextColor={Colors.textTertiary} value={groupName} onChangeText={setGroupName} />
        </FadeIn>

        <FadeIn delay={250}>
          <Card>
            <Text style={styles.howTitle}>How it works</Text>
            {["You create the group", "Invite 2-4 students from your area", "Each student's parent joins the app", "Parents enter when they can drive", "The app creates a fair weekly schedule"].map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </Card>
        </FadeIn>

        <FadeIn delay={350}>
          <PrimaryButton title={loading ? "Creating..." : "Create Group"} onPress={handleCreate} loading={loading} />
        </FadeIn>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1, padding: Spacing.xl, paddingTop: 60 },
  title: { fontSize: FontSizes.xxl, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.xxl },
  label: { color: Colors.textPrimary, fontSize: FontSizes.base, fontWeight: "700", marginBottom: 10 },
  input: { backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: 16, fontSize: FontSizes.base, color: Colors.textPrimary, marginBottom: Spacing.xl, borderWidth: 1, borderColor: Colors.border },
  howTitle: { color: Colors.primary, fontSize: FontSizes.md, fontWeight: "700", marginBottom: Spacing.md },
  stepRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primaryFaded, alignItems: "center", justifyContent: "center", marginRight: Spacing.md },
  stepNumText: { color: Colors.primary, fontSize: FontSizes.xs, fontWeight: "700" },
  stepText: { color: Colors.textSecondary, fontSize: FontSizes.sm, flex: 1 },
});
