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
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import {
  PrimaryButton,
  PressableScale,
  FadeIn,
  ScaleIn,
  BackButton,
} from "../components/UI";

export default function SignupScreen() {
  const router = useRouter();
  const [role, setRole] = useState<"student" | "parent" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [phone, setPhone] = useState("");
  const [childEmail, setChildEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleStudentSignup = async () => {
    if (!email.trim().toLowerCase().endsWith("@pdsb.net")) {
      Alert.alert("Invalid Email", "You must use your @pdsb.net school email to sign up.");
      return;
    }
    if (!name || !password || !grade) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setLoading(false);
        if (authError.message.includes("already registered")) {
          Alert.alert("Account Exists", "An account with this email already exists. Try logging in instead.");
        } else {
          Alert.alert("Signup Failed", authError.message);
        }
        return;
      }

      const { data: school } = await supabase
        .from("schools")
        .select("id")
        .eq("pdsb_code", "PILOT01")
        .single();

      const { error: profileError } = await supabase.from("students").insert({
        id: authData.user?.id,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        grade: parseInt(grade),
        school_id: school?.id,
      });

      setLoading(false);
      if (profileError) {
        Alert.alert("Error", profileError.message);
        return;
      }

      Alert.alert("Account Created!", "You can now log in with your email and password.", [
        { text: "OK", onPress: () => router.replace("/") },
      ]);
    } catch (err: any) {
      setLoading(false);
      if (err?.message?.includes("Failed to fetch") || err?.message?.includes("Network request failed")) {
        Alert.alert("No Internet", "Please check your internet connection and try again.");
      } else {
        Alert.alert("Error", "Something went wrong. Please try again.");
      }
    }
  };

  const handleParentSignup = async () => {
    if (!name || !email || !password || !phone) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setLoading(false);
        if (authError.message.includes("already registered")) {
          Alert.alert("Account Exists", "An account with this email already exists. Try logging in instead.");
        } else {
          Alert.alert("Signup Failed", authError.message);
        }
        return;
      }

      let studentId = null;
      if (childEmail) {
        const { data: student } = await supabase
          .from("students")
          .select("id")
          .eq("email", childEmail.trim().toLowerCase())
          .single();

        if (student) {
          studentId = student.id;
        } else {
          setLoading(false);
          Alert.alert("Student Not Found", "No student found with that email. Make sure your child signs up first with their @pdsb.net email.");
          return;
        }
      }

      const { error: profileError } = await supabase.from("parents").insert({
        id: authData.user?.id,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        phone: phone.trim(),
        student_id: studentId,
      });

      setLoading(false);
      if (profileError) {
        Alert.alert("Error", profileError.message);
        return;
      }

      Alert.alert("Account Created!", "You can now log in with your email and password.", [
        { text: "OK", onPress: () => router.replace("/") },
      ]);
    } catch (err: any) {
      setLoading(false);
      if (err?.message?.includes("Failed to fetch") || err?.message?.includes("Network request failed")) {
        Alert.alert("No Internet", "Please check your internet connection and try again.");
      } else {
        Alert.alert("Error", "Something went wrong. Please try again.");
      }
    }
  };

  // ─── Role Selection ───────────────────────────────────────
  if (!role) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <ScaleIn>
            <Text style={styles.title}>Join RidePool</Text>
            <Text style={styles.subtitle}>Select your account type</Text>
          </ScaleIn>

          <FadeIn delay={200}>
            <PressableScale onPress={() => setRole("student")} style={styles.roleCard}>
              <View style={styles.roleAccent} />
              <View style={styles.roleContent}>
                <Text style={styles.roleTitle}>Student</Text>
                <Text style={styles.roleDesc}>I need rides to and from school</Text>
              </View>
              <Text style={styles.roleChevron}>{"\u203A"}</Text>
            </PressableScale>
          </FadeIn>

          <FadeIn delay={350}>
            <PressableScale onPress={() => setRole("parent")} style={styles.roleCard}>
              <View style={[styles.roleAccent, styles.roleAccentWarm]} />
              <View style={styles.roleContent}>
                <Text style={styles.roleTitle}>Parent / Driver</Text>
                <Text style={styles.roleDesc}>I can drive students to school</Text>
              </View>
              <Text style={styles.roleChevron}>{"\u203A"}</Text>
            </PressableScale>
          </FadeIn>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
          </View>

          <FadeIn delay={500}>
            <PressableScale onPress={() => router.back()} style={styles.loginLink}>
              <Text style={styles.linkText}>
                Already have an account?{"  "}
                <Text style={styles.link}>Sign in</Text>
              </Text>
            </PressableScale>
          </FadeIn>
        </View>
      </View>
    );
  }

  // ─── Student Form ─────────────────────────────────────────
  if (role === "student") {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
          <BackButton onPress={() => setRole(null)} />

          <FadeIn>
            <Text style={styles.formTitle}>Student Account</Text>
            <Text style={styles.formSubtitle}>Use your @pdsb.net school email</Text>
          </FadeIn>

          <View style={styles.formSection}>
            <FadeIn delay={100}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your full name"
                  placeholderTextColor={Colors.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>
            </FadeIn>

            <FadeIn delay={150}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>School Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@pdsb.net"
                  placeholderTextColor={Colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </FadeIn>

            <FadeIn delay={200}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Grade</Text>
                <TextInput
                  style={styles.input}
                  placeholder="9 - 12"
                  placeholderTextColor={Colors.textMuted}
                  value={grade}
                  onChangeText={setGrade}
                  keyboardType="number-pad"
                />
              </View>
            </FadeIn>

            <FadeIn delay={250}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Min. 6 characters"
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
            </FadeIn>
          </View>

          <FadeIn delay={300}>
            <PrimaryButton
              title="Create Account"
              onPress={handleStudentSignup}
              loading={loading}
              disabled={loading}
              style={styles.ctaButton}
            />
          </FadeIn>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─── Parent Form ──────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
        <BackButton onPress={() => setRole(null)} />

        <FadeIn>
          <Text style={styles.formTitle}>Parent Account</Text>
          <Text style={styles.formSubtitle}>Link to your child's student account</Text>
        </FadeIn>

        <View style={styles.formSection}>
          <FadeIn delay={100}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Your full name"
                placeholderTextColor={Colors.textMuted}
                value={name}
                onChangeText={setName}
              />
            </View>
          </FadeIn>

          <FadeIn delay={150}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@email.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </FadeIn>

          <FadeIn delay={200}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="(123) 456-7890"
                placeholderTextColor={Colors.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          </FadeIn>

          <FadeIn delay={250}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Child's School Email</Text>
              <TextInput
                style={styles.input}
                placeholder="child@pdsb.net (optional)"
                placeholderTextColor={Colors.textMuted}
                value={childEmail}
                onChangeText={setChildEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </FadeIn>

          <FadeIn delay={300}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Min. 6 characters"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>
          </FadeIn>
        </View>

        <FadeIn delay={350}>
          <PrimaryButton
            title="Create Account"
            onPress={handleParentSignup}
            loading={loading}
            disabled={loading}
            style={styles.ctaButton}
          />
        </FadeIn>
      </ScrollView>
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
  scrollInner: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
  },

  // ─── Role selection header
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -1,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: FontSizes.md,
    color: Colors.textTertiary,
    marginBottom: 36,
  },

  // ─── Role cards
  roleCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    paddingVertical: 20,
    paddingRight: 20,
    paddingLeft: 0,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  roleAccent: {
    width: 3,
    height: 32,
    backgroundColor: Colors.primary,
    borderRadius: 2,
    marginLeft: 16,
    marginRight: 16,
  },
  roleAccentWarm: {
    backgroundColor: Colors.info,
  },
  roleContent: {
    flex: 1,
  },
  roleTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  roleDesc: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    lineHeight: 18,
  },
  roleChevron: {
    fontSize: 24,
    color: Colors.textMuted,
    fontWeight: "300",
    marginLeft: Spacing.sm,
  },

  // ─── Divider
  divider: {
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    width: 40,
    height: 1,
    backgroundColor: Colors.border,
  },

  // ─── Login link
  loginLink: {
    alignSelf: "center",
    paddingVertical: Spacing.sm,
  },
  linkText: {
    color: Colors.textMuted,
    fontSize: FontSizes.sm,
    fontWeight: "400",
  },
  link: {
    color: Colors.textSecondary,
    fontWeight: "600",
  },

  // ─── Form headers
  formTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  formSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textTertiary,
    marginBottom: 8,
  },

  // ─── Form section
  formSection: {
    marginTop: 24,
    marginBottom: 8,
  },

  // ─── Inputs
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

  // ─── CTA
  ctaButton: {
    marginTop: Spacing.sm,
    height: 54,
    borderRadius: Radius.sm,
  },
});
