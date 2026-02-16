import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

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
    // Validate @pdsb.net email
    if (!email.trim().toLowerCase().endsWith("@pdsb.net")) {
      Alert.alert("Invalid Email", "You must use your @pdsb.net school email to sign up.");
      return;
    }

    if (!name || !password || !grade) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    setLoading(true);

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setLoading(false);
      Alert.alert("Signup Failed", authError.message);
      return;
    }

    // Get the school (pilot school for now)
    const { data: school } = await supabase
      .from("schools")
      .select("id")
      .eq("pdsb_code", "PILOT01")
      .single();

    // Create student profile
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

    Alert.alert(
      "Check Your Email",
      "We sent a verification link to your @pdsb.net email. Please verify to log in.",
      [{ text: "OK", onPress: () => router.replace("/") }]
    );
  };

  const handleParentSignup = async () => {
    if (!name || !email || !password || !phone) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }

    setLoading(true);

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setLoading(false);
      Alert.alert("Signup Failed", authError.message);
      return;
    }

    // Find the linked student if child email was provided
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
        Alert.alert("Error", "No student found with that email. Make sure your child signs up first.");
        return;
      }
    }

    // Create parent profile
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

    Alert.alert(
      "Check Your Email",
      "We sent a verification link. Please verify to log in.",
      [{ text: "OK", onPress: () => router.replace("/") }]
    );
  };

  // Role selection screen
  if (!role) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.title}>Join RidePool</Text>
          <Text style={styles.subtitle}>I am a...</Text>

          <TouchableOpacity
            style={styles.roleButton}
            onPress={() => setRole("student")}
          >
            <Text style={styles.roleEmoji}>🎒</Text>
            <Text style={styles.roleTitle}>Student</Text>
            <Text style={styles.roleDesc}>I need rides to and from school</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.roleButton}
            onPress={() => setRole("parent")}
          >
            <Text style={styles.roleEmoji}>🚗</Text>
            <Text style={styles.roleTitle}>Parent / Driver</Text>
            <Text style={styles.roleDesc}>I can drive students to school</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.linkText}>Already have an account? <Text style={styles.link}>Log In</Text></Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Student signup form
  if (role === "student") {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.scrollInner}>
          <TouchableOpacity onPress={() => setRole(null)}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Student Sign Up</Text>
          <Text style={styles.subtitle}>Use your @pdsb.net school email</Text>

          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#999"
            value={name}
            onChangeText={setName}
          />

          <TextInput
            style={styles.input}
            placeholder="School Email (@pdsb.net)"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Grade (9-12)"
            placeholderTextColor="#999"
            value={grade}
            onChangeText={setGrade}
            keyboardType="number-pad"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleStudentSignup}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Creating Account..." : "Sign Up"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Parent signup form
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollInner}>
        <TouchableOpacity onPress={() => setRole(null)}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Parent Sign Up</Text>
        <Text style={styles.subtitle}>Link to your child's account</Text>

        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={styles.input}
          placeholder="Your Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Phone Number"
          placeholderTextColor="#999"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <TextInput
          style={styles.input}
          placeholder="Child's School Email (@pdsb.net)"
          placeholderTextColor="#999"
          value={childEmail}
          onChangeText={setChildEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleParentSignup}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Creating Account..." : "Sign Up"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  scrollInner: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#00d4aa",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#ccc",
    textAlign: "center",
    marginBottom: 36,
  },
  roleButton: {
    backgroundColor: "#16213e",
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2a2a4a",
    alignItems: "center",
  },
  roleEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  roleTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  roleDesc: {
    fontSize: 14,
    color: "#999",
  },
  input: {
    backgroundColor: "#16213e",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#fff",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  button: {
    backgroundColor: "#00d4aa",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#1a1a2e",
    fontSize: 18,
    fontWeight: "bold",
  },
  backText: {
    color: "#00d4aa",
    fontSize: 16,
    marginBottom: 24,
  },
  linkText: {
    color: "#ccc",
    textAlign: "center",
    fontSize: 14,
    marginTop: 16,
  },
  link: {
    color: "#00d4aa",
    fontWeight: "bold",
  },
});