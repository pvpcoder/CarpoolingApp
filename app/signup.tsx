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
            <Text style={styles.subtitle}>I am a...</Text>
          </ScaleIn>

          <FadeIn delay={200}>
            <PressableScale onPress={() => setRole("student")} style={styles.roleCard}>
              <View style={styles.roleIconWrap}>
                <Text style={styles.roleEmoji}>🎒</Text>
              </View>
              <View style={styles.roleTextWrap}>
                <Text style={styles.roleTitle}>Student</Text>
                <Text style={styles.roleDesc}>I need rides to and from school</Text>
              </View>
              <Text style={styles.roleArrow}>→</Text>
            </PressableScale>
          </FadeIn>

          <FadeIn delay={350}>
            <PressableScale onPress={() => setRole("parent")} style={styles.roleCard}>
              <View style={styles.roleIconWrap}>
                <Text style={styles.roleEmoji}>🚗</Text>
              </View>
              <View style={styles.roleTextWrap}>
                <Text style={styles.roleTitle}>Parent / Driver</Text>
                <Text style={styles.roleDesc}>I can drive students to school</Text>
              </View>
              <Text style={styles.roleArrow}>→</Text>
            </PressableScale>
          </FadeIn>

          <FadeIn delay={500}>
            <PressableScale onPress={() => router.back()} style={styles.loginLink}>
              <Text style={styles.linkText}>
                Already have an account?{" "}
                <Text style={styles.link}>Log In</Text>
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
        <ScrollView contentContainerStyle={styles.scrollInner}>
          <BackButton onPress={() => setRole(null)} />

          <FadeIn>
            <Text style={styles.formTitle}>Student Sign Up</Text>
            <Text style={styles.formSubtitle}>Use your @pdsb.net school email</Text>
          </FadeIn>

          <FadeIn delay={100}>
            <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor={Colors.textTertiary} value={name} onChangeText={setName} />
          </FadeIn>
          <FadeIn delay={150}>
            <TextInput style={styles.input} placeholder="School Email (@pdsb.net)" placeholderTextColor={Colors.textTertiary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </FadeIn>
          <FadeIn delay={200}>
            <TextInput style={styles.input} placeholder="Grade (9-12)" placeholderTextColor={Colors.textTertiary} value={grade} onChangeText={setGrade} keyboardType="number-pad" />
          </FadeIn>
          <FadeIn delay={250}>
            <TextInput style={styles.input} placeholder="Password" placeholderTextColor={Colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry />
          </FadeIn>

          <FadeIn delay={300}>
            <PrimaryButton
              title={loading ? "Creating Account..." : "Sign Up"}
              onPress={handleStudentSignup}
              loading={loading}
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
      <ScrollView contentContainerStyle={styles.scrollInner}>
        <BackButton onPress={() => setRole(null)} />

        <FadeIn>
          <Text style={styles.formTitle}>Parent Sign Up</Text>
          <Text style={styles.formSubtitle}>Link to your child's account</Text>
        </FadeIn>

        <FadeIn delay={100}>
          <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor={Colors.textTertiary} value={name} onChangeText={setName} />
        </FadeIn>
        <FadeIn delay={150}>
          <TextInput style={styles.input} placeholder="Your Email" placeholderTextColor={Colors.textTertiary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        </FadeIn>
        <FadeIn delay={200}>
          <TextInput style={styles.input} placeholder="Phone Number" placeholderTextColor={Colors.textTertiary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        </FadeIn>
        <FadeIn delay={250}>
          <TextInput style={styles.input} placeholder="Child's School Email (@pdsb.net)" placeholderTextColor={Colors.textTertiary} value={childEmail} onChangeText={setChildEmail} keyboardType="email-address" autoCapitalize="none" />
        </FadeIn>
        <FadeIn delay={300}>
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor={Colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry />
        </FadeIn>

        <FadeIn delay={350}>
          <PrimaryButton
            title={loading ? "Creating Account..." : "Sign Up"}
            onPress={handleParentSignup}
            loading={loading}
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
    padding: Spacing.xl,
  },
  scrollInner: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.xl,
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
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 36,
  },
  roleCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  roleIconWrap: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.base,
  },
  roleEmoji: {
    fontSize: 26,
  },
  roleTextWrap: {
    flex: 1,
  },
  roleTitle: {
    fontSize: FontSizes.lg,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  roleDesc: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  roleArrow: {
    fontSize: 20,
    color: Colors.primary,
    fontWeight: "600",
  },
  loginLink: {
    alignSelf: "center",
    paddingVertical: Spacing.base,
    marginTop: Spacing.sm,
  },
  linkText: {
    color: Colors.textSecondary,
    fontSize: FontSizes.sm,
  },
  link: {
    color: Colors.primary,
    fontWeight: "700",
  },
  formTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  formSubtitle: {
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    marginBottom: 28,
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
});
