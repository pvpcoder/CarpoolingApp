import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { useTheme, Fonts, ThemeTokens } from "../lib/theme";
import { PrimaryButton, PressableScale } from "../components/UI";

function Field({
  label, value, onChangeText, placeholder, c,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; c: ThemeTokens;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, { borderColor: focused ? c.dawn : c.line }]}>
      <Text style={[styles.fieldLabel, { color: focused ? c.dawn : c.textMuted, fontFamily: Fonts.bodySemiBold }]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, { color: c.textPrimary, fontFamily: Fonts.body }]}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export default function ResetPassword() {
  const router = useRouter();
  const c = useTheme();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!password || !confirmPassword) {
      Alert.alert("Missing fields", "Please fill in both fields.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Password too short", "Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match", "Make sure both fields are the same.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
      return;
    }
    Alert.alert("Password updated", "You can now sign in with your new password.", [
      { text: "OK", onPress: () => router.replace("/") },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <View style={styles.heading}>
          <Text style={[styles.title, { color: c.textPrimary, fontFamily: Fonts.display }]}>New password</Text>
          <Text style={[styles.subtitle, { color: c.textMuted, fontFamily: Fonts.body }]}>Choose something you haven't used before.</Text>
        </View>

        <View style={styles.form}>
          <Field label="NEW PASSWORD" value={password} onChangeText={setPassword} placeholder="Min. 6 characters" c={c} />
          <View style={{ height: 12 }} />
          <Field label="CONFIRM PASSWORD" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat password" c={c} />
        </View>

        <PrimaryButton
          title="Update password"
          onPress={handleReset}
          loading={loading}
          style={styles.submitBtn}
        />

        <PressableScale
          onPress={() => router.replace("/")}
          style={styles.backPress}
        >
          <Text style={[styles.backText, { color: c.textMuted, fontFamily: Fonts.bodyMedium }]}>Back to sign in</Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 96,
    paddingBottom: 48,
    justifyContent: "center",
  },
  heading: { marginBottom: 40 },
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
  form: { marginBottom: 28 },
  field: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 13,
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
  submitBtn: {
    alignSelf: "stretch",
  },
  backPress: {
    alignSelf: "center",
    marginTop: 24,
    paddingVertical: 8,
  },
  backText: {
    fontSize: 14,
  },
});
