import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { getValidUser, handleLogout } from "../lib/helpers";
import { notifyGroupMembers } from "../lib/notifications";
import { useTheme, Fonts } from "../lib/theme";
import { LoadingScreen, FadeIn } from "../components/UI";

export default function GroupChat() {
  const router = useRouter();
  const c = useTheme();

  const { groupId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const scrollRef = useRef<ScrollView>(null);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    loadChat();
    subscriptionRef.current = supabase
      .channel(`group-chat-${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` }, (payload) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      })
      .subscribe();
    return () => { subscriptionRef.current?.unsubscribe(); };
  }, []);

  const loadChat = async () => {
    try {
      const user = await getValidUser();
      if (!user) { handleLogout(router); return; }
      setCurrentUserId(user.id);

      const { data: student } = await supabase.from("students").select("id, name").eq("id", user.id).single();
      if (student) { setCurrentUserRole("student"); setCurrentUserName(student.name); }
      else {
        const { data: parent } = await supabase.from("parents").select("id, name").eq("id", user.id).single();
        if (parent) { setCurrentUserRole("parent"); setCurrentUserName(parent.name); }
      }

      const { data: members } = await supabase.from("group_members").select(`student_id, parent_id, students ( name ), parents ( name )`).eq("group_id", groupId).eq("status", "active");
      const nMap: Record<string, string> = {};
      (members || []).forEach((m: any) => {
        if (m.student_id && m.students) nMap[m.student_id] = m.students.name;
        if (m.parent_id && m.parents) nMap[m.parent_id] = m.parents.name;
      });
      setNameMap(nMap);
      await loadMessages();
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      if (err?.message?.includes("Failed to fetch") || err?.message?.includes("Network request failed")) {
        Alert.alert("No Internet", "Please check your connection.", [{ text: "Retry", onPress: () => loadChat() }]);
      } else {
        Alert.alert("Error", "Couldn't load chat.", [{ text: "Retry", onPress: () => loadChat() }, { text: "Go back", onPress: () => router.back() }]);
      }
    }
  };

  const loadMessages = async () => {
    try {
      const { data } = await supabase.from("group_messages").select("id, sender_id, sender_role, message, created_at").eq("group_id", groupId).order("created_at", { ascending: true }).limit(100);
      setMessages(data || []);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    } catch {}
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !currentUserId || !currentUserRole) return;
    setSending(true);
    try {
      const { error } = await supabase.from("group_messages").insert({ group_id: groupId, sender_id: currentUserId, sender_role: currentUserRole, message: newMessage.trim() });
      if (error) { setSending(false); Alert.alert("Error", "Couldn't send message."); return; }
      notifyGroupMembers(groupId as string, currentUserId!, `${currentUserName}`, newMessage.trim());
      setNewMessage("");
      await loadMessages();
      setSending(false);
    } catch {
      setSending(false);
      Alert.alert("Error", "Couldn't send message.");
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const hours = d.getHours();
    const mins = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const time = `${displayHour}:${mins} ${ampm}`;
    if (isToday) return time;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[d.getDay()]} ${time}`;
  };

  if (loading) {
    return <LoadingScreen />;
  }

  const canSend = newMessage.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.paper }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: c.paperElevated, borderBottomColor: c.line }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={20} color={c.textSecondary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary, fontFamily: Fonts.bodySemiBold }]}>Group Chat</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyTitle, { color: c.textPrimary, fontFamily: Fonts.displaySemiBold }]}>No messages yet</Text>
            <Text style={[styles.emptyText, { color: c.textSecondary, fontFamily: Fonts.body }]}>Start the conversation with your carpool group.</Text>
          </View>
        ) : (
          messages.map((msg: any) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <FadeIn key={msg.id} duration={220} distance={6} style={[styles.row, isMe && styles.rowMe]}>
                <View style={[styles.bubble, { backgroundColor: isMe ? c.dawn : c.paperElevated, borderColor: c.line }, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                  {!isMe && (
                    <View style={styles.senderRow}>
                      <Text style={[styles.senderName, { color: c.dawn, fontFamily: Fonts.bodyBold }]}>{nameMap[msg.sender_id] || "Unknown"}</Text>
                      <Text style={[styles.senderRole, { color: c.textMuted, fontFamily: Fonts.body }]}>{msg.sender_role}</Text>
                    </View>
                  )}
                  <Text style={[styles.msgText, { color: isMe ? "#FFFFFF" : c.textPrimary, fontFamily: Fonts.body }]}>{msg.message}</Text>
                  <Text style={[styles.msgTime, { color: isMe ? "rgba(255,255,255,0.5)" : c.textMuted, fontFamily: Fonts.mono }]}>{formatTime(msg.created_at)}</Text>
                </View>
              </FadeIn>
            );
          })
        )}
      </ScrollView>

      {/* Input */}
      <View style={[styles.inputArea, { backgroundColor: c.paperElevated, borderTopColor: c.line }]}>
        <View style={[styles.inputWrapper, { backgroundColor: c.paper, borderColor: c.line }]}>
          <TextInput
            style={[styles.input, { color: c.textPrimary, fontFamily: Fonts.body }]}
            placeholder="Message..."
            placeholderTextColor={c.textMuted}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={500}
          />
        </View>
        <TouchableOpacity
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.7}
          style={[styles.sendBtn, { backgroundColor: canSend ? c.dawn : c.line }]}
        >
          <Ionicons name="send" size={16} color={canSend ? "#FFFFFF" : c.textMuted} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  headerSpacer: { width: 40 },

  messageList: { flex: 1 },
  messageContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  emptyContainer: {
    alignItems: "center",
    marginTop: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },

  row: {
    flexDirection: "row",
    marginBottom: 10,
    justifyContent: "flex-start",
  },
  rowMe: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleMe: {
    borderTopRightRadius: 4,
    borderWidth: 0,
  },
  bubbleOther: {
    borderTopLeftRadius: 4,
  },

  senderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  senderName: {
    fontSize: 11,
  },
  senderRole: {
    fontSize: 11,
    textTransform: "capitalize",
  },
  msgText: {
    fontSize: 15,
    lineHeight: 21,
  },
  msgTime: {
    fontSize: 10,
    marginTop: 4,
  },

  inputArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
    borderTopWidth: 1,
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 20,
    overflow: "hidden",
  },
  input: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
