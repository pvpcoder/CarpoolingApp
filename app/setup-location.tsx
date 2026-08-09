import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { GOOGLE_API_KEY } from "../lib/config";
import { useTheme, Spacing, Radius, FontSizes, Fonts } from "../lib/theme";
import { PrimaryButton, BackButton, LoadingScreen } from "../components/UI";

const hasGoogleKey = GOOGLE_API_KEY && GOOGLE_API_KEY !== "YOUR_GOOGLE_API_KEY_HERE";

interface Suggestion {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
}

const fetchSuggestions = async (input: string): Promise<Suggestion[]> => {
  if (!hasGoogleKey || input.length < 3) return [];
  try {
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:ca&types=address&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== "OK") return [];
    return json.predictions.map((p: any) => ({ place_id: p.place_id, description: p.description, main_text: p.structured_formatting?.main_text || p.description, secondary_text: p.structured_formatting?.secondary_text || "" }));
  } catch { return []; }
};

const fetchPlaceCoords = async (placeId: string): Promise<{ lat: number; lng: number } | null> => {
  if (!hasGoogleKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.status !== "OK") return null;
    const loc = json.result.geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  } catch { return null; }
};

const geocodeFallback = async (addr: string): Promise<{ lat: number; lng: number } | null> => {
  try {
    const results = await Location.geocodeAsync(addr);
    if (results.length > 0) return { lat: results[0].latitude, lng: results[0].longitude };
  } catch {}
  return null;
};

export default function SetupLocation() {
  const router = useRouter();
  const c = useTheme();

  const mapRef = useRef<MapView>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pin, setPin] = useState({ latitude: 43.7205, longitude: -79.7471 });
  const [region, setRegion] = useState<Region>({ latitude: 43.7205, longitude: -79.7471, latitudeDelta: 0.01, longitudeDelta: 0.01 });
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedFromSuggestions, setSelectedFromSuggestions] = useState(false);

  useEffect(() => { loadExistingOrDetect(); }, []);

  const loadExistingOrDetect = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: student } = await supabase.from("students").select("saved_pickup_lat, saved_pickup_lng, saved_pickup_address").eq("id", user.id).single();
        if (student?.saved_pickup_lat) {
          const coords = { latitude: student.saved_pickup_lat, longitude: student.saved_pickup_lng };
          setPin(coords); setRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 });
          setAddress(student.saved_pickup_address || ""); setLoading(false); return;
        }
      }
    } catch {}
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { Alert.alert("Location permission", "We need your location to suggest a pickup spot. You can also type your address manually."); setLoading(false); return; }
      const location = await Location.getCurrentPositionAsync({});
      const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setPin(coords); setRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 });
      try {
        const result = await Location.reverseGeocodeAsync(coords);
        if (result.length > 0) {
          const place = result[0];
          const parts = [place.streetNumber, place.street, place.city, place.region].filter(Boolean);
          setAddress(parts.join(", ") || "");
        }
      } catch {}
    } catch {}
    setLoading(false);
  };

  const handleAddressChange = useCallback((text: string) => {
    setAddress(text);
    setSelectedFromSuggestions(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 3) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceRef.current = setTimeout(async () => {
      if (hasGoogleKey) {
        setSearching(true);
        const results = await fetchSuggestions(text);
        setSuggestions(results); setShowSuggestions(results.length > 0); setSearching(false);
      } else {
        setSuggestions([{ place_id: "__fallback__", description: text, main_text: text, secondary_text: "Tap to locate on map" }]);
        setShowSuggestions(true);
      }
    }, 350);
  }, []);

  const handleSelectSuggestion = async (suggestion: Suggestion) => {
    setAddress(suggestion.description); setSuggestions([]); setShowSuggestions(false);
    setSelectedFromSuggestions(true); Keyboard.dismiss();
    let coords: { lat: number; lng: number } | null = null;
    if (suggestion.place_id === "__fallback__") { coords = await geocodeFallback(suggestion.description); }
    else { coords = await fetchPlaceCoords(suggestion.place_id); }
    if (coords) {
      const newPin = { latitude: coords.lat, longitude: coords.lng };
      setPin(newPin);
      const newRegion = { ...newPin, latitudeDelta: 0.005, longitudeDelta: 0.005 };
      setRegion(newRegion); mapRef.current?.animateToRegion(newRegion, 600);
    } else {
      Alert.alert("Couldn't locate", "We couldn't find that address on the map. Try dragging the pin manually.");
    }
  };

  const handlePinDrag = async (coords: { latitude: number; longitude: number }) => {
    setPin(coords);
    try {
      const result = await Location.reverseGeocodeAsync(coords);
      if (result.length > 0) {
        const place = result[0];
        const parts = [place.streetNumber, place.street, place.city, place.region].filter(Boolean);
        const resolved = parts.join(", ");
        if (resolved) setAddress(resolved);
      }
    } catch {}
  };

  const handleSave = async () => {
    if (!address.trim()) { Alert.alert("Address required", "Please enter your pickup address."); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { Alert.alert("Error", "Not logged in."); setSaving(false); return; }
    const { error } = await supabase.from("students").update({ saved_pickup_lat: pin.latitude, saved_pickup_lng: pin.longitude, saved_pickup_address: address.trim() }).eq("id", user.id);
    setSaving(false);
    if (error) { Alert.alert("Error", error.message); return; }
    Alert.alert("Saved", "Your pickup location has been set.", [{ text: "OK", onPress: () => router.replace("/(tabs)/home") }]);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: c.paper }]} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.paper }]}>
        <View style={styles.backBtnWrap}>
          <BackButton onPress={() => router.back()} />
        </View>
        <Text style={[styles.title, { color: c.textPrimary, fontFamily: Fonts.display }]}>Pickup location</Text>
        <Text style={[styles.subtitle, { color: c.textMuted, fontFamily: Fonts.body }]}>
          Search your address and select from suggestions, or drag the pin.
        </Text>
      </View>

      {/* Address input */}
      <View style={[styles.addressSection, { backgroundColor: c.paper }]}>
        <Text style={[styles.inputLabel, { color: c.textMuted, fontFamily: Fonts.bodySemiBold }]}>YOUR ADDRESS</Text>
        <View style={[styles.inputWrap, { borderColor: focused ? c.dawn : c.line }]}>
          <TextInput
            style={[styles.addressInput, { color: c.textPrimary, fontFamily: Fonts.body }]}
            placeholder="Start typing your address…"
            placeholderTextColor={c.textMuted}
            value={address}
            onChangeText={handleAddressChange}
            onFocus={() => { setFocused(true); if (suggestions.length > 0) setShowSuggestions(true); }}
            onBlur={() => setFocused(false)}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={c.dawn} style={styles.inputSpinner} />}
        </View>

        {showSuggestions && suggestions.length > 0 && (
          <View style={[styles.suggestions, { backgroundColor: c.paperElevated, borderColor: c.line }]}>
            {suggestions.map((s, idx) => (
              <Pressable
                key={s.place_id + idx}
                onPress={() => handleSelectSuggestion(s)}
                style={({ pressed }) => [styles.suggestionRow, idx < suggestions.length - 1 && { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth }, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="location" size={14} color={c.dawn} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.suggestionMain, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]} numberOfLines={1}>{s.main_text}</Text>
                  {s.secondary_text ? <Text style={[styles.suggestionSub, { color: c.textSecondary, fontFamily: Fonts.body }]} numberOfLines={1}>{s.secondary_text}</Text> : null}
                </View>
              </Pressable>
            ))}
            {hasGoogleKey && (
              <View style={[styles.poweredBy, { borderTopColor: c.line }]}>
                <Text style={[styles.poweredByText, { color: c.textMuted, fontFamily: Fonts.body }]}>Powered by Google</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        showsUserLocation
        onPress={() => { setShowSuggestions(false); Keyboard.dismiss(); }}
      >
        <Marker coordinate={pin} draggable onDragEnd={(e) => handlePinDrag(e.nativeEvent.coordinate)} title="Pickup Spot" description="Drag to adjust" />
      </MapView>

      {/* Confirmed address strip */}
      {selectedFromSuggestions && (
        <View style={[styles.confirmedStrip, { backgroundColor: c.paperElevated, borderTopColor: c.line }]}>
          <Ionicons name="checkmark-circle" size={14} color={c.dawn} />
          <Text style={[styles.confirmedText, { color: c.textSecondary, fontFamily: Fonts.bodyMedium }]} numberOfLines={1}>{address}</Text>
        </View>
      )}

      {/* Footer */}
      <View style={[styles.footer, { backgroundColor: c.paper, borderTopColor: c.line }]}>
        <PrimaryButton title="Save this location" onPress={handleSave} loading={saving} disabled={saving} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 56,
    paddingBottom: Spacing.md,
  },
  backBtnWrap: {
    marginBottom: Spacing.md,
    marginLeft: -4,
  },
  title: {
    fontSize: FontSizes.xxl,
    letterSpacing: -1.2,
    lineHeight: 34,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    lineHeight: 18,
  },

  addressSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    zIndex: 10,
  },
  inputLabel: {
    fontSize: FontSizes.xs,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: Spacing.md,
  },
  inputWrap: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  addressInput: {
    flex: 1,
    fontSize: FontSizes.md,
    paddingVertical: 0,
  },
  inputSpinner: { marginLeft: Spacing.sm },

  suggestions: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    marginTop: 4,
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  suggestionMain: { fontSize: FontSizes.md, marginBottom: 1 },
  suggestionSub: { fontSize: FontSizes.xs + 1 },
  poweredBy: {
    padding: Spacing.sm,
    alignItems: "flex-end",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  poweredByText: { fontSize: FontSizes.xs },

  map: { flex: 1 },

  confirmedStrip: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  confirmedText: { fontSize: FontSizes.sm, flex: 1 },

  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
});
