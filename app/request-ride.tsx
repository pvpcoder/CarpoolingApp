import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const MINUTES = ["00", "15", "30", "45"];

export default function RequestRide() {
  const router = useRouter();
  const [direction, setDirection] = useState<"to_school" | "from_school">("to_school");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState("00");
  const [loading, setSaving] = useState(false);
  const [studentData, setStudentData] = useState<any>(null);

  useEffect(() => {
    loadStudent();
  }, []);

  const loadStudent = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("students")
      .select("id, school_id, saved_pickup_lat, saved_pickup_lng, saved_pickup_address")
      .eq("id", user.id)
      .single();

    setStudentData(data);
  };

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const formatTime = () => {
    const h = hour > 12 ? hour - 12 : hour;
    const ampm = hour >= 12 ? "PM" : "AM";
    return `${h}:${minute} ${ampm}`;
  };

  const handleSubmit = async () => {
    if (selectedDays.length === 0) {
      Alert.alert("Error", "Please select at least one day.");
      return;
    }

    if (!studentData?.saved_pickup_lat) {
      Alert.alert("Error", "Please set your pickup location first.");
      return;
    }

    setSaving(true);

    const timeString = `${hour.toString().padStart(2, "0")}:${minute}:00`;

    const { error } = await supabase.from("ride_requests").insert({
      student_id: studentData.id,
      school_id: studentData.school_id,
      direction,
      pickup_lat: studentData.saved_pickup_lat,
      pickup_lng: studentData.saved_pickup_lng,
      pickup_address: studentData.saved_pickup_address,
      target_time: timeString,
      recurring_days: selectedDays,
      status: "active",
    });

    setSaving(false);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert("Ride Requested!", "We'll notify you when a driver match is found.", [
      { text: "OK", onPress: () => router.replace("/student-home") },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Request a Ride</Text>

      {/* Direction */}
      <Text style={styles.label}>I need a ride...</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, direction === "to_school" && styles.toggleActive]}
          onPress={() => setDirection("to_school")}
        >
          <Text style={[styles.toggleText, direction === "to_school" && styles.toggleTextActive]}>
            🏫 To School
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, direction === "from_school" && styles.toggleActive]}
          onPress={() => setDirection("from_school")}
        >
          <Text style={[styles.toggleText, direction === "from_school" && styles.toggleTextActive]}>
            🏠 From School
          </Text>
        </TouchableOpacity>
      </View>

      {/* Days */}
      <Text style={styles.label}>Which days?</Text>
      <View style={styles.daysRow}>
        {DAYS.map((day) => (
          <TouchableOpacity
            key={day}
            style={[styles.dayButton, selectedDays.includes(day) && styles.dayActive]}
            onPress={() => toggleDay(day)}
          >
            <Text style={[styles.dayText, selectedDays.includes(day) && styles.dayTextActive]}>
              {day}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Time */}
      <Text style={styles.label}>
        {direction === "to_school" ? "Arrive at school by:" : "Leave school at:"}
      </Text>
      <View style={styles.timeContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
          {HOURS.map((h) => (
            <TouchableOpacity
              key={h}
              style={[styles.timeChip, hour === h && styles.timeChipActive]}
              onPress={() => setHour(h)}
            >
              <Text style={[styles.timeChipText, hour === h && styles.timeChipTextActive]}>
                {h > 12 ? h - 12 : h} {h >= 12 ? "PM" : "AM"}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.minuteRow}>
          {MINUTES.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.minuteChip, minute === m && styles.minuteActive]}
              onPress={() => setMinute(m)}
            >
              <Text style={[styles.minuteText, minute === m && styles.minuteTextActive]}>
                :{m}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.selectedTime}>{formatTime()}</Text>
      </View>

      {/* Pickup info */}
      {studentData?.saved_pickup_address && (
        <View style={styles.infoBox}>
          <Text style={styles.infoLabel}>📍 Pickup from:</Text>
          <Text style={styles.infoText}>{studentData.saved_pickup_address}</Text>
        </View>
      )}

      {/* Submit */}
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Submitting..." : "Request Ride"}
        </Text>
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
  backText: {
    color: "#00d4aa",
    fontSize: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00d4aa",
    marginBottom: 32,
  },
  label: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 28,
  },
  toggleButton: {
    flex: 1,
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  toggleActive: {
    backgroundColor: "#00d4aa",
    borderColor: "#00d4aa",
  },
  toggleText: {
    color: "#999",
    fontSize: 16,
    fontWeight: "bold",
  },
  toggleTextActive: {
    color: "#1a1a2e",
  },
  daysRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 28,
  },
  dayButton: {
    flex: 1,
    backgroundColor: "#16213e",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  dayActive: {
    backgroundColor: "#00d4aa",
    borderColor: "#00d4aa",
  },
  dayText: {
    color: "#999",
    fontSize: 13,
    fontWeight: "bold",
  },
  dayTextActive: {
    color: "#1a1a2e",
  },
  timeContainer: {
    marginBottom: 28,
  },
  timeScroll: {
    marginBottom: 12,
  },
  timeChip: {
    backgroundColor: "#16213e",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  timeChipActive: {
    backgroundColor: "#00d4aa",
    borderColor: "#00d4aa",
  },
  timeChipText: {
    color: "#999",
    fontSize: 14,
    fontWeight: "bold",
  },
  timeChipTextActive: {
    color: "#1a1a2e",
  },
  minuteRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  minuteChip: {
    flex: 1,
    backgroundColor: "#16213e",
    borderRadius: 10,
    padding: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  minuteActive: {
    backgroundColor: "#00d4aa",
    borderColor: "#00d4aa",
  },
  minuteText: {
    color: "#999",
    fontSize: 14,
    fontWeight: "bold",
  },
  minuteTextActive: {
    color: "#1a1a2e",
  },
  selectedTime: {
    color: "#00d4aa",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  infoBox: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  infoLabel: {
    color: "#00d4aa",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  infoText: {
    color: "#fff",
    fontSize: 15,
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