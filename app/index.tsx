import { registerForPushNotifications } from "../lib/notifications";
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
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
      console.log("Logged in user ID:", userId);

      // Register for push notifications (non-blocking)
      registerForPushNotifications(userId!);

      // Check if user is a student
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      console.log("Student check:", student, "Error:", studentError);

      if (student) {
        setLoading(false);
        router.replace("/student-home");
        return;
      }

      // Check if user is a parent
      const { data: parent, error: parentError } = await supabase
        .from("parents")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      console.log("Parent check:", parent, "Error:", parentError);

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
                Alert.alert(
                  "Error",
                  "Something went wrong. Please try again."
                );
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
        <Text style={styles.title}>RidePool</Text>
        <Text style={styles.subtitle}>Carpooling for your school</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
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
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Logging in..." : "Log In"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleForgotPassword}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/signup")}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.link}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </View>
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
  title: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#00d4aa",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#ccc",
    textAlign: "center",
    marginBottom: 48,
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
  forgotText: {
    color: "#00d4aa",
    textAlign: "center",
    fontSize: 14,
    marginBottom: 16,
  },
  linkText: {
    color: "#ccc",
    textAlign: "center",
    fontSize: 14,
  },
  link: {
    color: "#00d4aa",
    fontWeight: "bold",
  },
});
