import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import { FadeIn, PrimaryButton, PressableScale } from "../components/UI";

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!password || !confirmPassword) { Alert.alert("Error", "Please fill in both fields."); return; }
    if (password.length < 6) { Alert.alert("Error", "Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { Alert.alert("Error", "Passwords don't match."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { Alert.alert("Error", error.message); return; }
    Alert.alert("Password Updated!", "You can now log in with your new password.", [{ text: "OK", onPress: () => router.replace("/") }]);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={styles.inner}>
        <FadeIn>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>Enter your new password below.</Text>
        </FadeIn>
        <FadeIn delay={100}>
          <TextInput style={styles.input} placeholder="New Password" placeholderTextColor={Colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry />
        </FadeIn>
        <FadeIn delay={150}>
          <TextInput style={styles.input} placeholder="Confirm New Password" placeholderTextColor={Colors.textTertiary} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
        </FadeIn>
        <FadeIn delay={200}>
          <PrimaryButton title={loading ? "Updating..." : "Update Password"} onPress={handleReset} loading={loading} style={{ marginBottom: Spacing.xl }} />
          <PressableScale onPress={() => router.replace("/")} style={{ alignSelf: "center", padding: Spacing.sm }}>
            <Text style={{ color: Colors.primary, fontSize: FontSizes.sm, fontWeight: "600" }}>← Back to Login</Text>
          </PressableScale>
        </FadeIn>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1, justifyContent: "center", padding: Spacing.xl },
  title: { fontSize: FontSizes.xxl, fontWeight: "800", color: Colors.textPrimary, textAlign: "center", letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { fontSize: FontSizes.sm, color: Colors.textSecondary, textAlign: "center", marginBottom: Spacing.xxl },
  input: { backgroundColor: Colors.bgInput, borderRadius: Radius.md, padding: 16, fontSize: FontSizes.base, color: Colors.textPrimary, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
});
