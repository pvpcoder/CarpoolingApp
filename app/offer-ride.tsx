import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const MINUTES = ["00", "15", "30", "45"];

export default function OfferRide() {
  const router = useRouter();
  const [direction, setDirection] = useState<"to_school" | "from_school">("to_school");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState("00");
  const [seats, setSeats] = useState("3");
  const [loading, setSaving] = useState(false);
  const [parentData, setParentData] = useState<any>(null);

  useEffect(() => {
    loadParent();
  }, []);

  const loadParent = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: parent } = await supabase
      .from("parents")
      .select("id, student_id")
      .eq("id", user.id)
      .single();

    if (parent?.student_id) {
      // Get the student's school
      const { data: student } = await supabase
        .from("students")
        .select("school_id")
        .eq("id", parent.student_id)
        .single();

      setParentData({ ...parent, school_id: student?.school_id });
    } else {
      setParentData(parent);
    }
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

    if (!parentData?.school_id) {
      Alert.alert("Error", "Your account isn't linked to a school yet. Make sure your child has signed up first.");
      return;
    }

    setSaving(true);

    const timeString = `${hour.toString().padStart(2, "0")}:${minute}:00`;

    // Get the school's location as default area
    const { data: school } = await supabase
      .from("schools")
      .select("lat, lng")
      .eq("id", parentData.school_id)
      .single();

    const { error } = await supabase.from("ride_offers").insert({
      parent_id: parentData.id,
      school_id: parentData.school_id,
      direction,
      area_lat: school?.lat || 43.7205,
      area_lng: school?.lng || -79.7471,
      area_address: "Brampton area",
      departure_time: timeString,
      seats_available: parseInt(seats) || 3,
      recurring_days: selectedDays,
      status: "active",
    });

    setSaving(false);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert("Ride Offered!", "Students in your area will be able to request a spot.", [
      { text: "OK", onPress: () => router.replace("/parent-home") },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Offer a Ride</Text>

      {/* Direction */}
      <Text style={styles.label}>I can drive...</Text>
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
        {direction === "to_school" ? "Departure time:" : "Pickup from school at:"}
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

      {/* Seats */}
      <Text style={styles.label}>Available seats:</Text>
      <View style={styles.seatsRow}>
        {["1", "2", "3", "4", "5"].map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.seatButton, seats === s && styles.seatActive]}
            onPress={() => setSeats(s)}
          >
            <Text style={[styles.seatText, seats === s && styles.seatTextActive]}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Submit */}
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Submitting..." : "Offer Ride"}
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
  seatsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 32,
  },
  seatButton: {
    flex: 1,
    backgroundColor: "#16213e",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  seatActive: {
    backgroundColor: "#00d4aa",
    borderColor: "#00d4aa",
  },
  seatText: {
    color: "#999",
    fontSize: 18,
    fontWeight: "bold",
  },
  seatTextActive: {
    color: "#1a1a2e",
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