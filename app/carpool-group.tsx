import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";

export default function CarpoolGroup() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [upcomingRides, setUpcomingRides] = useState<any[]>([]);
  const [driver, setDriver] = useState<any>(null);
  const [userRole, setUserRole] = useState<"student" | "parent" | null>(null);

  useEffect(() => {
    loadGroup();
  }, []);

  const loadGroup = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check if user is student or parent
    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("id", user.id)
      .single();

    setUserRole(student ? "student" : "parent");

    // Load group details
    const { data: groupData } = await supabase
      .from("carpool_groups")
      .select(`
        id, name, status, semester,
        ride_offers (
          direction, departure_time, recurring_days, seats_available,
          parents ( name, phone, email )
        )
      `)
      .eq("id", groupId)
      .single();

    setGroup(groupData);
    setDriver((groupData?.ride_offers as any)?.parents);

    // Load members
    const { data: memberData } = await supabase
      .from("carpool_members")
      .select(`
        id, joined_at,
        students ( name, grade, saved_pickup_address )
      `)
      .eq("carpool_group_id", groupId);

    setMembers(memberData || []);

    // Load or create upcoming ride instances for next 5 weekdays
    await loadUpcomingRides(groupId as string);

    setLoading(false);
  };

  const loadUpcomingRides = async (gId: string) => {
    const today = new Date();
    const dates: string[] = [];

    // Get next 5 weekdays
    for (let i = 0; i < 7 && dates.length < 5; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const day = d.getDay();
      if (day !== 0 && day !== 6) {
        dates.push(d.toISOString().split("T")[0]);
      }
    }

    // Get existing ride instances
    const { data: existing } = await supabase
      .from("ride_instances")
      .select("*")
      .eq("carpool_group_id", gId)
      .in("date", dates);

    // Create missing instances
    const existingDates = new Set((existing || []).map((e: any) => e.date));
    const toCreate = dates
      .filter((d) => !existingDates.has(d))
      .map((d) => ({
        carpool_group_id: gId,
        date: d,
        status: "confirmed",
      }));

    if (toCreate.length > 0) {
      await supabase.from("ride_instances").insert(toCreate);
    }

    // Reload all instances
    const { data: allInstances } = await supabase
      .from("ride_instances")
      .select("*")
      .eq("carpool_group_id", gId)
      .in("date", dates)
      .order("date");

    setUpcomingRides(allInstances || []);
  };

  const toggleRideStatus = async (instanceId: string, currentStatus: string) => {
    const newStatus = currentStatus === "confirmed" ? "cancelled" : "confirmed";

    const { error } = await supabase
      .from("ride_instances")
      .update({ status: newStatus })
      .eq("id", instanceId);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    setUpcomingRides((prev) =>
      prev.map((r) =>
        r.id === instanceId ? { ...r, status: newStatus } : r
      )
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
  };

  const formatTime = (timeStr: string) => {
    const [h, m] = timeStr.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00d4aa" />
      </View>
    );
  }

  const rideOffer = group?.ride_offers as any;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{group?.name || "Carpool Group"}</Text>

      {/* Ride Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {rideOffer?.direction === "to_school" ? "🏫 To School" : "🏠 From School"}
        </Text>
        <Text style={styles.rideTime}>{formatTime(rideOffer?.departure_time)}</Text>
        <Text style={styles.rideDays}>{rideOffer?.recurring_days?.join(", ")}</Text>
      </View>

      {/* Driver */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🚗 Driver</Text>
        <Text style={styles.memberName}>{driver?.name}</Text>
        {userRole === "student" && (
          <>
            <Text style={styles.contactInfo}>📞 {driver?.phone}</Text>
            <Text style={styles.contactInfo}>✉️ {driver?.email}</Text>
          </>
        )}
      </View>

      {/* Members */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          🎒 Riders ({members.length}/{rideOffer?.seats_available})
        </Text>
        {members.map((member) => (
          <View key={member.id} style={styles.memberRow}>
            <View>
              <Text style={styles.memberName}>{member.students?.name}</Text>
              <Text style={styles.memberGrade}>Grade {member.students?.grade}</Text>
              {userRole === "parent" && member.students?.saved_pickup_address && (
                <Text style={styles.memberAddress}>📍 {member.students.saved_pickup_address}</Text>
              )}
            </View>
          </View>
        ))}
      </View>

      {/* Upcoming Rides */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📅 Upcoming Rides</Text>
        <Text style={styles.cardSubtitle}>Rides auto-confirm daily. Tap to cancel a day.</Text>
        {upcomingRides.map((ride) => (
          <TouchableOpacity
            key={ride.id}
            style={[styles.rideRow, ride.status === "cancelled" && styles.rideRowCancelled]}
            onPress={() => toggleRideStatus(ride.id, ride.status)}
          >
            <Text style={[styles.rideDate, ride.status === "cancelled" && styles.rideDateCancelled]}>
              {formatDate(ride.date)}
            </Text>
            <Text style={ride.status === "confirmed" ? styles.rideConfirmed : styles.rideCancelled}>
              {ride.status === "confirmed" ? "✅ Confirmed" : "❌ Cancelled"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
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
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#16213e",
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  cardSubtitle: {
    color: "#999",
    fontSize: 13,
    marginBottom: 12,
  },
  rideTime: {
    color: "#00d4aa",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 4,
  },
  rideDays: {
    color: "#999",
    fontSize: 14,
  },
  memberRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a4a",
  },
  memberName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  memberGrade: {
    color: "#00d4aa",
    fontSize: 13,
  },
  memberAddress: {
    color: "#999",
    fontSize: 13,
    marginTop: 2,
  },
  contactInfo: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 4,
  },
  rideRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a4a",
  },
  rideRowCancelled: {
    opacity: 0.6,
  },
  rideDate: {
    color: "#fff",
    fontSize: 15,
  },
  rideDateCancelled: {
    textDecorationLine: "line-through",
  },
  rideConfirmed: {
    color: "#00d4aa",
    fontSize: 14,
    fontWeight: "bold",
  },
  rideCancelled: {
    color: "#ff6b6b",
    fontSize: 14,
    fontWeight: "bold",
  },
});