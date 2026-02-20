import { registerForPushNotifications } from "../lib/notifications";
import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { supabase } from "../lib/supabase";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import { PrimaryButton, PressableScale, FadeIn, ScaleIn } from "../components/UI";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Entrance animations
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(formOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(formTranslateY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setLoading(false);
        if (error.message.includes("Invalid login credentials")) {
          Alert.alert(
            "Login Failed",
            "Wrong email or password. Please try again."
          );
        } else if (error.message.includes("Email not confirmed")) {
          Alert.alert(
            "Email Not Verified",
            "Please check your email and click the verification link."
          );
        } else {
          Alert.alert("Login Failed", error.message);
        }
        return;
      }

      const userId = data.user?.id;
      registerForPushNotifications(userId!);

      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (student) {
        setLoading(false);
        router.replace("/student-home");
        return;
      }

      const { data: parent } = await supabase
        .from("parents")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (parent) {
        setLoading(false);
        router.replace("/parent-home");
        return;
      }

      setLoading(false);
      Alert.alert("Error", "Account not found. Please sign up first.");
    } catch (err: any) {
      setLoading(false);
      if (
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("Network request failed")
      ) {
        Alert.alert(
          "No Internet",
          "Please check your internet connection and try again."
        );
      } else {
        Alert.alert("Error", "Something went wrong. Please try again.");
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert(
        "Enter Email",
        "Please enter your email address first, then tap Forgot Password."
      );
      return;
    }

    Alert.alert(
      "Reset Password",
      `Send a password reset link to ${email.trim().toLowerCase()}?`,
      [
        { text: "Cancel" },
        {
          text: "Send",
          onPress: async () => {
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(
                email.trim().toLowerCase(),
                { redirectTo: "ridepool://reset-password" }
              );
              if (error) {
                Alert.alert("Error", error.message);
                return;
              }
              Alert.alert(
                "Check Your Email",
                "We sent you a password reset link. Open it to set a new password."
              );
            } catch (err: any) {
              if (
                err?.message?.includes("Failed to fetch") ||
                err?.message?.includes("Network request failed")
              ) {
                Alert.alert(
                  "No Internet",
                  "Please check your internet connection and try again."
                );
              } else {
                Alert.alert("Error", "Something went wrong. Please try again.");
              }
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        {/* Logo area */}
        <Animated.View
          style={[
            styles.logoContainer,
            { opacity: logoOpacity, transform: [{ scale: logoScale }] },
          ]}
        >
          <View style={styles.logoGlow}>
            <View style={styles.logoIcon}>
              <Ionicons name="car-sport" size={36} color={Colors.bg} />
            </View>
          </View>
          <Text style={styles.title}>RidePool</Text>
          <Text style={styles.subtitle}>CARPOOLING FOR YOUR SCHOOL</Text>
        </Animated.View>

        {/* Form */}
        <Animated.View
          style={[
            styles.formContainer,
            {
              opacity: formOpacity,
              transform: [{ translateY: formTranslateY }],
            },
          ]}
        >
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@school.edu"
              placeholderTextColor={Colors.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={Colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <PressableScale onPress={handleForgotPassword} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </PressableScale>

          <PrimaryButton
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.ctaButton}
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
          </View>

          <PressableScale onPress={() => router.push("/signup")} style={styles.signupBtn}>
            <Text style={styles.signupText}>
              Don't have an account?{"  "}
              <Text style={styles.signupLink}>Create one</Text>
            </Text>
          </PressableScale>
        </Animated.View>
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
    paddingHorizontal: 28,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 56,
  },
  logoGlow: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: Colors.primaryGlow,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 40,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -1.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textTertiary,
    letterSpacing: 3,
  },
  formContainer: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: Spacing.base,
  },
  inputLabel: {
    fontSize: FontSizes.xs,
    fontWeight: "600",
    color: Colors.textTertiary,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginLeft: 2,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.sm,
    height: 52,
    paddingHorizontal: 16,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  forgotBtn: {
    alignSelf: "flex-end",
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  forgotText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    fontWeight: "500",
  },
  ctaButton: {
    marginTop: Spacing.xs,
    height: 54,
    borderRadius: Radius.sm,
  },
  divider: {
    alignItems: "center",
    marginVertical: 28,
  },
  dividerLine: {
    width: 40,
    height: 1,
    backgroundColor: Colors.border,
  },
  signupBtn: {
    alignSelf: "center",
    paddingVertical: Spacing.sm,
  },
  signupText: {
    color: Colors.textMuted,
    fontSize: FontSizes.sm,
    fontWeight: "400",
  },
  signupLink: {
    color: Colors.textSecondary,
    fontWeight: "600",
  },
});
