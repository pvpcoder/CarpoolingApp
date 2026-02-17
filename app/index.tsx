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
        {/* Logo */}
        <Animated.View
          style={[
            styles.logoContainer,
            { opacity: logoOpacity, transform: [{ scale: logoScale }] },
          ]}
        >
          <View style={styles.logoIcon}>
            <Text style={styles.logoIconText}>R</Text>
          </View>
          <Text style={styles.title}>RidePool</Text>
          <Text style={styles.subtitle}>Carpooling for your school</Text>
        </Animated.View>

        {/* Form */}
        <Animated.View
          style={{
            opacity: formOpacity,
            transform: [{ translateY: formTranslateY }],
          }}
        >
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textTertiary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <PrimaryButton
            title={loading ? "Logging in..." : "Log In"}
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={{ marginTop: Spacing.sm, marginBottom: Spacing.xl }}
          />

          <PressableScale onPress={handleForgotPassword} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </PressableScale>

          <PressableScale onPress={() => router.push("/signup")} style={styles.signupBtn}>
            <Text style={styles.linkText}>
              Don't have an account?{" "}
              <Text style={styles.link}>Sign Up</Text>
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
    padding: Spacing.xl,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 48,
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.base,
  },
  logoIconText: {
    fontSize: 30,
    fontWeight: "900",
    color: Colors.bg,
  },
  title: {
    fontSize: FontSizes.hero,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -1,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  input: {
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.md,
    padding: 16,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  forgotBtn: {
    alignSelf: "center",
    paddingVertical: Spacing.sm,
  },
  forgotText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: "600",
  },
  signupBtn: {
    alignSelf: "center",
    paddingVertical: Spacing.md,
  },
  linkText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  link: {
    color: Colors.primary,
    fontWeight: "700",
  },
});
