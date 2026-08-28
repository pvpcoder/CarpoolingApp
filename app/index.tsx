import { registerForPushNotifications } from "../lib/notifications";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { linkParentToChildByEmail } from "../lib/parentLinking";
import { track } from "../lib/analytics";
import { useTheme, Fonts } from "../lib/theme";
import { PrimaryButton, ScaleIn, FadeIn, Watermark, TitleRule } from "../components/UI";

export default function LoginScreen() {
  const router = useRouter();
  const c = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

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
      if (student) { track(userId, "login", { role: "student" }); setLoading(false); router.replace("/(tabs)/home"); return; }

      const { data: parent } = await supabase.from("parents").select("id").eq("id", userId).maybeSingle();
      if (parent) { track(userId, "login", { role: "parent" }); setLoading(false); router.replace("/(tabs)/home"); return; }

      const meta = data.user?.user_metadata;
      if (meta?.role === "student") {
        const { data: school } = await supabase.from("schools").select("id").eq("pdsb_code", "PILOT01").single();
        const { error: profileError } = await supabase.from("students").insert({
          id: userId, email: data.user?.email, name: meta.name, grade: meta.grade, school_id: school?.id,
        });
        setLoading(false);
        if (profileError) { Alert.alert("Error", "Couldn't set up your profile. Please contact support."); return; }
        track(userId, "signup_completed", { role: "student" });
        router.replace("/(tabs)/home");
        return;
      }

      if (meta?.role === "parent") {
        const { error: profileError } = await supabase.from("parents").insert({
          id: userId, email: data.user?.email, name: meta.name, phone: meta.phone,
        });
        if (profileError) { setLoading(false); Alert.alert("Error", "Couldn't set up your profile. Please contact support."); return; }
        if (meta.child_email) {
          const linkResult = await linkParentToChildByEmail(userId!, meta.child_email);
          if (!linkResult.success) {
            Alert.alert("Couldn't link child", `${linkResult.error} You can try again from Profile > Link a child.`);
          }
        }
        track(userId, "signup_completed", { role: "parent" });
        setLoading(false);
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
                { redirectTo: "schoolloop://reset-password" }
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
    <View style={[styles.root, { backgroundColor: c.paper }]}>
      <Watermark />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.inner}>
          {/* Wordmark */}
          <ScaleIn style={styles.wordmark}>
            <Text style={[styles.brand, { color: c.textPrimary, fontFamily: Fonts.display }]}>SchoolLoop</Text>
            <TitleRule />
            <Text style={[styles.tagline, { color: c.textMuted, fontFamily: Fonts.body }]}>PDSB carpool groups</Text>
          </ScaleIn>

          {/* Form */}
          <FadeIn delay={80} style={styles.form}>
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
          </FadeIn>

          {/* Footer */}
          <FadeIn delay={140} style={styles.footer}>
            <View style={[styles.footerDivider, { backgroundColor: c.line }]} />
            <Pressable onPress={() => router.push("/signup")} hitSlop={12}>
              <Text style={[styles.footerText, { color: c.textSecondary, fontFamily: Fonts.body }]}>
                New to SchoolLoop?{"  "}
                <Text style={{ color: c.dawn, fontFamily: Fonts.bodySemiBold }}>Create account</Text>
              </Text>
            </Pressable>
          </FadeIn>
        </View>
      </KeyboardAvoidingView>
    </View>
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
    fontSize: 46,
    letterSpacing: -2,
    lineHeight: 48,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 14,
    letterSpacing: -0.1,
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
