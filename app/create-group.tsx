import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { useTheme, Fonts } from "../lib/theme";
import { PrimaryButton, BackButton, FadeIn } from "../components/UI";
import { track } from "../lib/analytics";

const STEPS = [
  "Create the group and name it",
  "Invite 2–4 students from the discover screen",
  "Each student's parent joins with their own account",
  "Parents set when they can drive",
  "The app builds a fair weekly schedule automatically",
];

export default function CreateGroup() {
  const router = useRouter();
  const c = useTheme();

  const [groupName, setGroupName] = useState("");
  const [morningTime, setMorningTime] = useState("07:30");
  const [afternoonTime, setAfternoonTime] = useState("14:45");
  const [morningFocused, setMorningFocused] = useState(false);
  const [afternoonFocused, setAfternoonFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
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
    if (!groupName.trim()) { Alert.alert("Missing name", "Please enter a group name."); return; }
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(morningTime.trim()) || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(afternoonTime.trim())) {
      Alert.alert("Invalid time", "Enter times as HH:MM, e.g. 07:30 and 14:45.");
      return;
    }
    if (!studentData) return;
    setLoading(true);

    const { data: group, error: groupError } = await supabase.from("carpool_groups").insert({
      name: groupName.trim(),
      school_id: studentData.school_id,
      status: "forming",
      created_by: studentData.id,
      morning_departure_time: `${morningTime.trim()}:00`,
      afternoon_pickup_time: `${afternoonTime.trim()}:00`,
    }).select("id").single();

    if (groupError) { setLoading(false); Alert.alert("Error", groupError.message); return; }

    const { error: memberError } = await supabase.from("group_members").insert({
      group_id: group.id, student_id: studentData.id, role: "admin", status: "active",
    });

    setLoading(false);
    if (memberError) { Alert.alert("Error", memberError.message); return; }

    track(studentData.id, "group_created", { group_id: group.id });

    Alert.alert("Group created", "Now invite students from your area to join your carpool.", [
      { text: "Invite students", onPress: () => router.replace(`/discover?groupId=${group.id}`) },
      { text: "Go home", onPress: () => router.replace("/(tabs)/home") },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackButton onPress={() => router.back()} />

        <FadeIn>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: c.textPrimary, fontFamily: Fonts.display }]}>Create a group</Text>
            <Text style={[styles.subtitle, { color: c.textMuted, fontFamily: Fonts.body }]}>
              Invite nearby students and their parents to set up a shared schedule.
            </Text>
          </View>
        </FadeIn>

        {/* Group name field */}
        <FadeIn delay={40}>
          <View style={[styles.field, { borderColor: focused ? c.dawn : c.line }]}>
            <Text style={[styles.fieldLabel, { color: focused ? c.dawn : c.textMuted, fontFamily: Fonts.bodySemiBold }]}>GROUP NAME</Text>
            <TextInput
              style={[styles.fieldInput, { color: c.textPrimary, fontFamily: Fonts.body }]}
              placeholder="e.g. North Park Crew"
              placeholderTextColor={c.textMuted}
              value={groupName}
              onChangeText={setGroupName}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>
        </FadeIn>

        {/* Pickup/dropoff times */}
        <FadeIn delay={60}>
          <View style={styles.timeRow}>
            <View style={[styles.field, styles.timeField, { borderColor: morningFocused ? c.dawn : c.line }]}>
              <Text style={[styles.fieldLabel, { color: morningFocused ? c.dawn : c.textMuted, fontFamily: Fonts.bodySemiBold }]}>MORNING DROPOFF</Text>
              <TextInput
                style={[styles.fieldInput, { color: c.textPrimary, fontFamily: Fonts.body }]}
                placeholder="07:30"
                placeholderTextColor={c.textMuted}
                value={morningTime}
                onChangeText={setMorningTime}
                onFocus={() => setMorningFocused(true)}
                onBlur={() => setMorningFocused(false)}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
            </View>
            <View style={[styles.field, styles.timeField, { borderColor: afternoonFocused ? c.dawn : c.line }]}>
              <Text style={[styles.fieldLabel, { color: afternoonFocused ? c.dawn : c.textMuted, fontFamily: Fonts.bodySemiBold }]}>AFTERNOON PICKUP</Text>
              <TextInput
                style={[styles.fieldInput, { color: c.textPrimary, fontFamily: Fonts.body }]}
                placeholder="14:45"
                placeholderTextColor={c.textMuted}
                value={afternoonTime}
                onChangeText={setAfternoonTime}
                onFocus={() => setAfternoonFocused(true)}
                onBlur={() => setAfternoonFocused(false)}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
            </View>
          </View>
        </FadeIn>

        {/* How it works */}
        <FadeIn delay={80}>
          <View style={[styles.stepsCard, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
            <Text style={[styles.stepsTitle, { color: c.textMuted, fontFamily: Fonts.bodySemiBold }]}>HOW IT WORKS</Text>
            {STEPS.map((step, i) => (
              <View key={i} style={[styles.stepRow, i < STEPS.length - 1 && { borderBottomColor: c.line, borderBottomWidth: 1 }]}>
                <Text style={[styles.stepNum, { color: c.dawn, fontFamily: Fonts.displaySemiBold }]}>{i + 1}</Text>
                <Text style={[styles.stepText, { color: c.textSecondary, fontFamily: Fonts.body }]}>{step}</Text>
              </View>
            ))}
          </View>
        </FadeIn>

        <PrimaryButton title="Create group" onPress={handleCreate} loading={loading} disabled={loading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 48,
  },

  heading: { marginBottom: 32 },
  title: {
    fontSize: 46,
    letterSpacing: -2,
    lineHeight: 48,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },

  field: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 13,
    marginBottom: 28,
  },
  timeRow: {
    flexDirection: "row",
    gap: 12,
  },
  timeField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  fieldInput: {
    fontSize: 16,
    paddingVertical: 0,
    height: 26,
  },

  stepsCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 28,
  },
  stepsTitle: {
    fontSize: 10,
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  stepNum: {
    fontSize: 18,
    letterSpacing: -0.5,
    lineHeight: 21,
    width: 18,
  },
  stepText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
});
