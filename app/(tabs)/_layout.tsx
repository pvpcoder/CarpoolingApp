import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

export default function TabLayout() {
  const c = useTheme();
  const [inviteCount, setInviteCount] = useState(0);

  useEffect(() => {
    const fetchInvites = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: student } = await supabase.from("students").select("id").eq("id", user.id).single();
      if (!student) return;
      const { count } = await supabase
        .from("group_invites")
        .select("id", { count: "exact", head: true })
        .eq("invited_student_id", student.id)
        .eq("status", "pending");
      setInviteCount(count || 0);
    };
    fetchInvites();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.paperElevated,
          borderTopWidth: 1,
          borderTopColor: c.line,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: c.dawn,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.2,
        },
      }}
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarBadge: inviteCount > 0 ? inviteCount : undefined,
          tabBarBadgeStyle: { backgroundColor: c.rust, fontSize: 10 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={22}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
