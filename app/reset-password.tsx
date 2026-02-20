import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
          <View style={styles.lockIconWrap}>
            <Ionicons name="lock-closed-outline" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>Enter your new password below.</Text>
        </FadeIn>

        <FadeIn delay={100}>
          <Text style={styles.inputLabel}>NEW PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="New Password"
            placeholderTextColor={Colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </FadeIn>

        <FadeIn delay={150}>
          <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="Confirm New Password"
            placeholderTextColor={Colors.textTertiary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </FadeIn>

        <FadeIn delay={200}>
          <PrimaryButton
            title={loading ? "Updating..." : "Update Password"}
            onPress={handleReset}
            loading={loading}
            icon="lock-closed"
            style={{ marginBottom: Spacing.xxl }}
          />
          <PressableScale
            onPress={() => router.replace("/")}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>Back to Login</Text>
          </PressableScale>
        </FadeIn>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: Spacing.xl,
  },
  lockIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: Colors.primaryFaded,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: "800",
    color: Colors.textPrimary,
    textAlign: "center",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xxl,
  },
  inputLabel: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    padding: 16,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backLink: {
    alignSelf: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  backLinkText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
});
