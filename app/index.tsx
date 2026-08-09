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
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { useTheme, Fonts } from "../lib/theme";
import { PrimaryButton } from "../components/UI";

export default function LoginScreen() {
  const router = useRouter();
  const c = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Missing fields", "Enter your email and password to continue.");
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
          Alert.alert("Incorrect credentials", "Check your email or password and try again.");
        } else if (error.message.includes("Email not confirmed")) {
          Alert.alert("Email not verified", "Check your inbox and click the verification link we sent you.");
        } else {
          Alert.alert("Sign in failed", error.message);
        }
        return;
      }

      const userId = data.user?.id;
      registerForPushNotifications(userId!);

      const { data: student } = await supabase.from("students").select("id").eq("id", userId).maybeSingle();
      if (student) { setLoading(false); router.replace("/(tabs)/home"); return; }

      const { data: parent } = await supabase.from("parents").select("id").eq("id", userId).maybeSingle();
      if (parent) { setLoading(false); router.replace("/(tabs)/home"); return; }

      const meta = data.user?.user_metadata;
      if (meta?.role === "student") {
        const { data: school } = await supabase.from("schools").select("id").eq("pdsb_code", "PILOT01").single();
        const { error: profileError } = await supabase.from("students").insert({
          id: userId, email: data.user?.email, name: meta.name, grade: meta.grade, school_id: school?.id,
        });
        setLoading(false);
        if (profileError) { Alert.alert("Error", "Couldn't set up your profile. Please contact support."); return; }
        router.replace("/(tabs)/home");
        return;
      }

      if (meta?.role === "parent") {
        let studentId = null;
        if (meta.child_email) {
          const { data: linkedStudent } = await supabase.from("students").select("id").eq("email", meta.child_email).single();
          if (linkedStudent) studentId = linkedStudent.id;
        }
        const { error: profileError } = await supabase.from("parents").insert({
          id: userId, email: data.user?.email, name: meta.name, phone: meta.phone, student_id: studentId,
        });
        setLoading(false);
        if (profileError) { Alert.alert("Error", "Couldn't set up your profile. Please contact support."); return; }
        router.replace("/(tabs)/home");
        return;
      }

      setLoading(false);
      Alert.alert("Not found", "No account found. Sign up to get started.");
    } catch (err: any) {
      setLoading(false);
      if (err?.message?.includes("Failed to fetch") || err?.message?.includes("Network request failed")) {
        Alert.alert("No connection", "Check your internet and try again.");
      } else {
        Alert.alert("Something went wrong", "Please try again.");
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert("Enter your email first", "Type your email above, then tap Forgot password.");
      return;
    }
    Alert.alert(
      "Reset password",
      `Send a reset link to ${email.trim().toLowerCase()}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send link",
          onPress: async () => {
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(
                email.trim().toLowerCase(),
                { redirectTo: "hopin://reset-password" }
              );
              if (error) { Alert.alert("Error", error.message); return; }
              Alert.alert("Check your inbox", "We sent a password reset link to your email.");
            } catch {
              Alert.alert("Something went wrong", "Please try again.");
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Animated.View
        style={[styles.inner, { opacity, transform: [{ translateY }] }]}
      >
        {/* Wordmark */}
        <View style={styles.wordmark}>
          <Text style={[styles.brand, { color: c.textPrimary, fontFamily: Fonts.display }]}>HopIn</Text>
          <Text style={[styles.tagline, { color: c.textMuted, fontFamily: Fonts.bodySemiBold }]}>PDSB carpool groups</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={[styles.field, { borderColor: emailFocused ? c.dawn : c.line }]}>
            <Text style={[styles.fieldLabel, { color: emailFocused ? c.dawn : c.textMuted, fontFamily: Fonts.bodySemiBold }]}>
              EMAIL
            </Text>
            <TextInput
              style={[styles.fieldInput, { color: c.textPrimary, fontFamily: Fonts.body }]}
              placeholder="123456@pdsb.net"
              placeholderTextColor={c.textMuted}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={[styles.field, { borderColor: passwordFocused ? c.dawn : c.line, marginTop: 12 }]}>
            <Text style={[styles.fieldLabel, { color: passwordFocused ? c.dawn : c.textMuted, fontFamily: Fonts.bodySemiBold }]}>
              PASSWORD
            </Text>
            <TextInput
              style={[styles.fieldInput, { color: c.textPrimary, fontFamily: Fonts.body }]}
              placeholder="••••••••"
              placeholderTextColor={c.textMuted}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              secureTextEntry
            />
          </View>

          <Pressable onPress={handleForgotPassword} style={styles.forgotRow} hitSlop={12}>
            <Text style={[styles.forgotText, { color: c.textSecondary, fontFamily: Fonts.bodyMedium }]}>Forgot password?</Text>
          </Pressable>

          <PrimaryButton
            title="Sign in"
            onPress={handleLogin}
            loading={loading}
            style={styles.signInBtn}
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={[styles.footerDivider, { backgroundColor: c.line }]} />
          <Pressable onPress={() => router.push("/signup")} hitSlop={12}>
            <Text style={[styles.footerText, { color: c.textSecondary, fontFamily: Fonts.body }]}>
              New to HopIn?{"  "}
              <Text style={{ color: c.dawn, fontFamily: Fonts.bodySemiBold }}>Create account</Text>
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 96,
    paddingBottom: 48,
  },

  wordmark: {
    marginBottom: 72,
  },
  brand: {
    fontSize: 68,
    letterSpacing: -3,
    lineHeight: 70,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 10,
    letterSpacing: 2.5,
    textTransform: "uppercase" as const,
  },

  form: {},
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

  forgotRow: {
    alignSelf: "flex-end",
    marginTop: 16,
    marginBottom: 28,
  },
  forgotText: {
    fontSize: 14,
  },

  signInBtn: {
    alignSelf: "stretch",
  },

  footer: {
    marginTop: "auto" as any,
    alignItems: "center",
    gap: 24,
  },
  footerDivider: {
    width: 32,
    height: 1,
  },
  footerText: {
    fontSize: 14,
  },
});
