import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { useTheme, Fonts, ThemeTokens } from "../lib/theme";
import { PrimaryButton, PressableScale, BackButton } from "../components/UI";

type Role = "student" | "parent" | null;

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  c,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  c: ThemeTokens;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, { borderColor: focused ? c.dawn : c.line }]}>
      <Text style={[styles.fieldLabel, { color: focused ? c.dawn : c.textMuted, fontFamily: Fonts.bodySemiBold }]}>
        {label}
      </Text>
      <TextInput
        style={[styles.fieldInput, { color: c.textPrimary, fontFamily: Fonts.body }]}
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "words"}
        autoCorrect={false}
      />
    </View>
  );
}

export default function SignupScreen() {
  const router = useRouter();
  const c = useTheme();

  const [role, setRole] = useState<Role>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState("");
  const [phone, setPhone] = useState("");
  const [childEmail, setChildEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setName(""); setEmail(""); setPassword("");
    setGrade(""); setPhone(""); setChildEmail("");
  };

  const handleStudentSignup = async () => {
    if (!email.trim().toLowerCase().endsWith("@pdsb.net")) {
      Alert.alert("Invalid email", "Use your @pdsb.net school email to sign up.");
      return;
    }
    if (!name || !password || !grade) {
      Alert.alert("Missing fields", "Fill in all fields to continue.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Password too short", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { role: "student", name: name.trim(), grade: parseInt(grade) },
        },
      });

      setLoading(false);
      if (authError) {
        if (authError.message.includes("already registered")) {
          Alert.alert("Account exists", "An account with this email already exists. Try signing in instead.");
        } else {
          Alert.alert("Sign up failed", authError.message);
        }
        return;
      }

      Alert.alert(
        "Check your email",
        `We sent a verification link to ${email.trim().toLowerCase()}. Click it to verify your account, then come back here and sign in.`,
        [{ text: "OK", onPress: () => router.replace("/") }]
      );
    } catch (err: any) {
      setLoading(false);
      if (err?.message?.includes("Failed to fetch") || err?.message?.includes("Network request failed")) {
        Alert.alert("No connection", "Check your internet and try again.");
      } else {
        Alert.alert("Something went wrong", "Please try again.");
      }
    }
  };

  const handleParentSignup = async () => {
    if (!name || !email || !password || !phone) {
      Alert.alert("Missing fields", "Fill in all fields to continue.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Password too short", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (childEmail) {
        const { data: student } = await supabase
          .from("students")
          .select("id")
          .eq("email", childEmail.trim().toLowerCase())
          .single();

        if (!student) {
          setLoading(false);
          Alert.alert("Student not found", "No student found with that email. Make sure your child signs up first with their school email.");
          return;
        }
      }

      const { error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            role: "parent",
            name: name.trim(),
            phone: phone.trim(),
            child_email: childEmail.trim().toLowerCase(),
          },
        },
      });

      setLoading(false);
      if (authError) {
        if (authError.message.includes("already registered")) {
          Alert.alert("Account exists", "An account with this email already exists. Try signing in instead.");
        } else {
          Alert.alert("Sign up failed", authError.message);
        }
        return;
      }

      Alert.alert(
        "Check your email",
        `We sent a verification link to ${email.trim().toLowerCase()}. Click it to verify your account, then come back here and sign in.`,
        [{ text: "OK", onPress: () => router.replace("/") }]
      );
    } catch (err: any) {
      setLoading(false);
      if (err?.message?.includes("Failed to fetch") || err?.message?.includes("Network request failed")) {
        Alert.alert("No connection", "Check your internet and try again.");
      } else {
        Alert.alert("Something went wrong", "Please try again.");
      }
    }
  };

  // ── Role selection ─────────────────────────────────────────
  if (!role) {
    return (
      <View style={[styles.root, { backgroundColor: c.paper }]}>
        <View style={styles.inner}>
          <BackButton onPress={() => router.back()} />

          <View style={styles.heading}>
            <Text style={[styles.title, { color: c.textPrimary, fontFamily: Fonts.display }]}>Join SchoolLoop</Text>
            <Text style={[styles.subtitle, { color: c.textMuted, fontFamily: Fonts.body }]}>I'm a…</Text>
          </View>

          <View style={styles.roleList}>
            <PressableScale
              onPress={() => { resetForm(); setRole("student"); }}
              style={[styles.roleRow, { backgroundColor: c.paperElevated, borderColor: c.line }]}
            >
              <View style={styles.roleText}>
                <Text style={[styles.roleTitle, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>Student</Text>
                <Text style={[styles.roleDesc, { color: c.textMuted, fontFamily: Fonts.body }]}>I need rides to and from school</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
            </PressableScale>

            <PressableScale
              onPress={() => { resetForm(); setRole("parent"); }}
              style={[styles.roleRow, { backgroundColor: c.paperElevated, borderColor: c.line }]}
            >
              <View style={styles.roleText}>
                <Text style={[styles.roleTitle, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>Parent / Driver</Text>
                <Text style={[styles.roleDesc, { color: c.textMuted, fontFamily: Fonts.body }]}>I can drive students to school</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
            </PressableScale>
          </View>

          <View style={styles.roleFooter}>
            <PressableScale onPress={() => router.back()} style={styles.footerPress}>
              <Text style={[styles.footerText, { color: c.textSecondary, fontFamily: Fonts.body }]}>
                Already have an account?{"  "}
                <Text style={{ color: c.dawn, fontFamily: Fonts.bodySemiBold }}>Sign in</Text>
              </Text>
            </PressableScale>
          </View>
        </View>
      </View>
    );
  }

  // ── Shared form shell ──────────────────────────────────────
  const isStudent = role === "student";

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: c.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackButton onPress={() => setRole(null)} />

        <View style={styles.heading}>
          <Text style={[styles.title, { color: c.textPrimary, fontFamily: Fonts.display }]}>
            {isStudent ? "Student account" : "Parent account"}
          </Text>
          <Text style={[styles.subtitle, { color: c.textMuted, fontFamily: Fonts.body }]}>
            {isStudent ? "Use your @pdsb.net school email" : "Link to your child's student account"}
          </Text>
        </View>

        <View style={styles.form}>
          <Field label="FULL NAME" value={name} onChangeText={setName} placeholder="Your full name" c={c} />

          <Field
            label="EMAIL"
            value={email}
            onChangeText={setEmail}
            placeholder={isStudent ? "123456@pdsb.net" : "you@email.com"}
            keyboardType="email-address"
            autoCapitalize="none"
            c={c}
          />

          {isStudent ? (
            <Field
              label="GRADE"
              value={grade}
              onChangeText={setGrade}
              placeholder="9 – 12"
              keyboardType="number-pad"
              autoCapitalize="none"
              c={c}
            />
          ) : (
            <>
              <Field
                label="PHONE"
                value={phone}
                onChangeText={setPhone}
                placeholder="(123) 456-7890"
                keyboardType="phone-pad"
                autoCapitalize="none"
                c={c}
              />
              <Field
                label="CHILD'S SCHOOL EMAIL"
                value={childEmail}
                onChangeText={setChildEmail}
                placeholder="child@pdsb.net (optional)"
                keyboardType="email-address"
                autoCapitalize="none"
                c={c}
              />
            </>
          )}

          <Field
            label="PASSWORD"
            value={password}
            onChangeText={setPassword}
            placeholder="Min. 6 characters"
            secureTextEntry
            autoCapitalize="none"
            c={c}
          />
        </View>

        <PrimaryButton
          title="Create account"
          onPress={isStudent ? handleStudentSignup : handleParentSignup}
          loading={loading}
          style={styles.submitBtn}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  inner: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 48,
  },
  scrollInner: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 48,
  },

  heading: { marginBottom: 40 },
  title: {
    fontSize: 46,
    letterSpacing: -2,
    lineHeight: 48,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },

  // Role selection
  roleList: { gap: 10 },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  roleText: { flex: 1 },
  roleTitle: {
    fontSize: 16,
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  roleDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  roleFooter: {
    marginTop: "auto" as any,
    alignItems: "center",
  },
  footerPress: {
    alignSelf: "center",
  },
  footerText: {
    fontSize: 14,
  },

  // Form
  form: { gap: 12 },
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
    marginTop: 28,
    alignSelf: "stretch",
  },
});
