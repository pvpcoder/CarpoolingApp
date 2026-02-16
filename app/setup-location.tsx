import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function SetupLocation() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState({
    latitude: 43.7205,
    longitude: -79.7471,
  });
  const [region, setRegion] = useState<Region>({
    latitude: 43.7205,
    longitude: -79.7471,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      Alert.alert(
        "Location Permission",
        "We need your location to suggest a pickup spot. You can still set it manually on the map."
      );
      setLoading(false);
      return;
    }

    const location = await Location.getCurrentPositionAsync({});
    const coords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };

    setPin(coords);
    setRegion({
      ...coords,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert("Error", "Not logged in.");
      setSaving(false);
      return;
    }

    // Reverse geocode to get address
    let address = "Custom location";
    try {
      const result = await Location.reverseGeocodeAsync(pin);
      if (result.length > 0) {
        const place = result[0];
        address = [place.street, place.city, place.region]
          .filter(Boolean)
          .join(", ");
      }
    } catch (e) {
      // Keep default address if geocoding fails
    }

    const { error } = await supabase
      .from("students")
      .update({
        saved_pickup_lat: pin.latitude,
        saved_pickup_lng: pin.longitude,
        saved_pickup_address: address,
      })
      .eq("id", user.id);

    setSaving(false);

    if (error) {
      Alert.alert("Error", error.message);
      return;
    }

    Alert.alert("Saved!", "Your pickup location has been set.", [
      { text: "OK", onPress: () => router.replace("/student-home") },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00d4aa" />
        <Text style={styles.loadingText}>Finding your location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Set Your Pickup Spot</Text>
        <Text style={styles.subtitle}>
          Drag the pin to where you'd like to be picked up. You can choose a
          nearby intersection for privacy.
        </Text>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation={true}
      >
        <Marker
          coordinate={pin}
          draggable
          onDragEnd={(e) => setPin(e.nativeEvent.coordinate)}
          title="Pickup Spot"
          description="Drag me to adjust"
        />
      </MapView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.buttonText}>
            {saving ? "Saving..." : "Confirm This Spot"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#ccc",
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: "#1a1a2e",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00d4aa",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#ccc",
    lineHeight: 20,
  },
  map: {
    flex: 1,
  },
  footer: {
    padding: 24,
    backgroundColor: "#1a1a2e",
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