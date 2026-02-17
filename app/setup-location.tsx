import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { GOOGLE_API_KEY } from "../lib/config";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import {
  FadeIn,
  PrimaryButton,
  PressableScale,
  LoadingScreen,
} from "../components/UI";

// ─── Google Places helpers ────────────────────────────────────
const hasGoogleKey =
  GOOGLE_API_KEY && GOOGLE_API_KEY !== "YOUR_GOOGLE_API_KEY_HERE";

interface Suggestion {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
}

const fetchSuggestions = async (
  input: string
): Promise<Suggestion[]> => {
  if (!hasGoogleKey || input.length < 3) return [];
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      input
    )}&components=country:ca&types=address&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== "OK") return [];
    return json.predictions.map((p: any) => ({
      place_id: p.place_id,
      description: p.description,
      main_text: p.structured_formatting?.main_text || p.description,
      secondary_text: p.structured_formatting?.secondary_text || "",
    }));
  } catch {
    return [];
  }
};

const fetchPlaceCoords = async (
  placeId: string
): Promise<{ lat: number; lng: number } | null> => {
  if (!hasGoogleKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== "OK") return null;
    const loc = json.result.geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
};

// ─── Fallback geocoding (no API key) ──────────────────────────
const geocodeFallback = async (
  addr: string
): Promise<{ lat: number; lng: number } | null> => {
  try {
    const results = await Location.geocodeAsync(addr);
    if (results.length > 0) {
      return { lat: results[0].latitude, lng: results[0].longitude };
    }
  } catch {}
  return null;
};

// ─── Component ────────────────────────────────────────────────
export default function SetupLocation() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState({ latitude: 43.7205, longitude: -79.7471 });
  const [region, setRegion] = useState<Region>({
    latitude: 43.7205,
    longitude: -79.7471,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedFromSuggestions, setSelectedFromSuggestions] = useState(false);

  useEffect(() => {
    loadExistingOrDetect();
  }, []);

  const loadExistingOrDetect = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: student } = await supabase
          .from("students")
          .select("saved_pickup_lat, saved_pickup_lng, saved_pickup_address")
          .eq("id", user.id)
          .single();
        if (student?.saved_pickup_lat) {
          const coords = {
            latitude: student.saved_pickup_lat,
            longitude: student.saved_pickup_lng,
          };
          setPin(coords);
          setRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 });
          setAddress(student.saved_pickup_address || "");
          setLoading(false);
          return;
        }
      }
    } catch {}

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Permission",
          "We need your location to suggest a pickup spot. You can also type your address manually."
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
      setRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 });
      // Reverse geocode to pre-fill address
      try {
        const result = await Location.reverseGeocodeAsync(coords);
        if (result.length > 0) {
          const place = result[0];
          const parts = [
            place.streetNumber,
            place.street,
            place.city,
            place.region,
          ].filter(Boolean);
          const resolved = parts.join(", ") || "";
          setAddress(resolved);
        }
      } catch {}
    } catch {}
    setLoading(false);
  };

  // Debounced autocomplete
  const handleAddressChange = useCallback(
    (text: string) => {
      setAddress(text);
      setSelectedFromSuggestions(false);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (text.length < 3) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        if (hasGoogleKey) {
          setSearching(true);
          const results = await fetchSuggestions(text);
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
          setSearching(false);
        } else {
          // Fallback: show a single "Search this address" option
          setSuggestions([
            {
              place_id: "__fallback__",
              description: text,
              main_text: text,
              secondary_text: "Tap to locate on map",
            },
          ]);
          setShowSuggestions(true);
        }
      }, 350);
    },
    []
  );

  const handleSelectSuggestion = async (suggestion: Suggestion) => {
    setAddress(suggestion.description);
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedFromSuggestions(true);
    Keyboard.dismiss();

    let coords: { lat: number; lng: number } | null = null;

    if (suggestion.place_id === "__fallback__") {
      coords = await geocodeFallback(suggestion.description);
    } else {
      coords = await fetchPlaceCoords(suggestion.place_id);
    }

    if (coords) {
      const newPin = { latitude: coords.lat, longitude: coords.lng };
      setPin(newPin);
      const newRegion = {
        ...newPin,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
      setRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 600);
    } else {
      Alert.alert(
        "Couldn't Locate",
        "We couldn't find that address on the map. Try dragging the pin manually."
      );
    }
  };

  const handlePinDrag = async (coords: {
    latitude: number;
    longitude: number;
  }) => {
    setPin(coords);
    // Reverse geocode the new pin location
    try {
      const result = await Location.reverseGeocodeAsync(coords);
      if (result.length > 0) {
        const place = result[0];
        const parts = [
          place.streetNumber,
          place.street,
          place.city,
          place.region,
        ].filter(Boolean);
        const resolved = parts.join(", ");
        if (resolved) setAddress(resolved);
      }
    } catch {}
  };

  const handleSave = async () => {
    if (!address.trim()) {
      Alert.alert("Address Required", "Please enter your pickup address.");
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert("Error", "Not logged in.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("students")
      .update({
        saved_pickup_lat: pin.latitude,
        saved_pickup_lng: pin.longitude,
        saved_pickup_address: address.trim(),
      })
      .eq("id", user.id);

    setSaving(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    Alert.alert("Saved!", "Your pickup location has been set.", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  if (loading) return <LoadingScreen message="Finding your location..." />;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <FadeIn>
        <View style={styles.header}>
          <PressableScale onPress={() => router.back()} style={styles.backArea}>
            <Text style={styles.backText}>← Back</Text>
          </PressableScale>
          <Text style={styles.title}>Pickup Location</Text>
          <Text style={styles.subtitle}>
            Start typing your address and select from suggestions. The pin will
            move to match. You can also drag the pin to fine-tune.
          </Text>
        </View>
      </FadeIn>

      {/* Address Input + Autocomplete */}
      <FadeIn delay={100}>
        <View style={styles.addressSection}>
          <Text style={styles.inputLabel}>YOUR ADDRESS</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.addressInput}
              placeholder="Start typing your address..."
              placeholderTextColor={Colors.textTertiary}
              value={address}
              onChangeText={handleAddressChange}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searching && (
              <ActivityIndicator
                size="small"
                color={Colors.primary}
                style={styles.inputSpinner}
              />
            )}
          </View>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <View style={styles.suggestionsContainer}>
              {suggestions.map((s, idx) => (
                <PressableScale
                  key={s.place_id + idx}
                  onPress={() => handleSelectSuggestion(s)}
                  style={[
                    styles.suggestionRow,
                    idx < suggestions.length - 1 && styles.suggestionBorder,
                  ]}
                >
                  <View style={styles.suggestionIcon}>
                    <Text style={{ fontSize: 14 }}>📍</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionMain} numberOfLines={1}>
                      {s.main_text}
                    </Text>
                    {s.secondary_text ? (
                      <Text
                        style={styles.suggestionSecondary}
                        numberOfLines={1}
                      >
                        {s.secondary_text}
                      </Text>
                    ) : null}
                  </View>
                </PressableScale>
              ))}
              {hasGoogleKey && (
                <View style={styles.poweredBy}>
                  <Text style={styles.poweredByText}>
                    Powered by Google
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </FadeIn>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        onPress={() => {
          setShowSuggestions(false);
          Keyboard.dismiss();
        }}
      >
        <Marker
          coordinate={pin}
          draggable
          onDragEnd={(e) => handlePinDrag(e.nativeEvent.coordinate)}
          title="Pickup Spot"
          description="Drag to adjust"
        />
      </MapView>

      {/* Confirmed address strip */}
      {selectedFromSuggestions && (
        <View style={styles.confirmedStrip}>
          <Text style={{ fontSize: 13 }}>✅</Text>
          <Text style={styles.confirmedText} numberOfLines={1}>
            {address}
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <PrimaryButton
          title={saving ? "Saving..." : "Save This Location"}
          onPress={handleSave}
          loading={saving}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { padding: Spacing.xl, paddingTop: 56, paddingBottom: Spacing.sm },
  backArea: { marginBottom: Spacing.md },
  backText: {
    color: Colors.primary,
    fontSize: FontSizes.base,
    fontWeight: "600",
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  addressSection: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    zIndex: 10,
  },
  inputLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "700",
    color: Colors.textTertiary,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputWrap: {
    position: "relative",
  },
  addressInput: {
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    padding: 14,
    paddingRight: 40,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputSpinner: {
    position: "absolute",
    right: 14,
    top: 16,
  },

  suggestionsContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
    overflow: "hidden",
    // Shadow
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  suggestionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  suggestionMain: {
    fontSize: FontSizes.base,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 1,
  },
  suggestionSecondary: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  poweredBy: {
    padding: 8,
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  poweredByText: {
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },

  map: { flex: 1 },

  confirmedStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.successFaded,
    paddingVertical: 10,
    paddingHorizontal: Spacing.xl,
    gap: 8,
  },
  confirmedText: {
    fontSize: FontSizes.sm,
    color: Colors.success,
    fontWeight: "600",
    flex: 1,
  },

  footer: {
    padding: Spacing.xl,
    backgroundColor: Colors.bg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
