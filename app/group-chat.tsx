import { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { supabase } from "../lib/supabase";
import { getValidUser, handleLogout } from "../lib/helpers";
import { notifyGroupMembers } from "../lib/notifications";
import { Colors, Spacing, Radius, FontSizes } from "../lib/theme";
import { FadeIn, PressableScale, LoadingScreen } from "../components/UI";

export default function GroupChat() {
  const router = useRouter();
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

  useEffect(() => { loadChat(); const interval = setInterval(loadMessages, 5000); return () => clearInterval(interval); }, []);

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
        Alert.alert("Error", "Couldn't load chat.", [{ text: "Retry", onPress: () => loadChat() }, { text: "Go Back", onPress: () => router.back() }]);
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
      notifyGroupMembers(groupId as string, currentUserId!, `💬 ${currentUserName}`, newMessage.trim());
      setNewMessage("");
      await loadMessages();
      setSending(false);
    } catch (err: any) {
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

  if (loading) return <LoadingScreen />;

  const canSend = newMessage.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Chat</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Messages */}
      <ScrollView ref={scrollRef} style={styles.messageList} contentContainerStyle={styles.messageContent} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="chatbubbles-outline" size={36} color={Colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>Start the conversation with your carpool group</Text>
          </View>
        ) : (
          messages.map((msg: any) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <View key={msg.id} style={[styles.row, isMe && styles.rowMe]}>
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                  {!isMe && (
                    <View style={styles.senderRow}>
                      <Text style={styles.senderName}>
                        {nameMap[msg.sender_id] || "Unknown"}
                      </Text>
                      <Text style={styles.senderRole}>{msg.sender_role}</Text>
                    </View>
                  )}
                  <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{msg.message}</Text>
                  <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>{formatTime(msg.created_at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputArea}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor={Colors.textTertiary}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={500}
          />
        </View>
        <PressableScale
          onPress={handleSend}
          disabled={!canSend}
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
        >
          <Ionicons name="send" size={18} color={!canSend ? Colors.textTertiary : Colors.bg} />
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },

  /* Header */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 58,
    paddingBottom: 14,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.base,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 36,
  },

  /* Messages */
  messageList: {
    flex: 1,
  },
  messageContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },

  /* Empty */
  emptyContainer: {
    alignItems: "center",
    marginTop: 100,
    paddingHorizontal: Spacing.xl,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: FontSizes.lg,
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  emptyText: {
    color: Colors.textTertiary,
    fontSize: FontSizes.sm,
    textAlign: "center",
    lineHeight: 19,
  },

  /* Bubble layout */
  row: {
    flexDirection: "row",
    marginBottom: 10,
    justifyContent: "flex-start",
  },
  rowMe: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: Radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleOther: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderTopLeftRadius: Radius.xs,
  },
  bubbleMe: {
    backgroundColor: '#2A9D6F',
    borderTopRightRadius: Radius.xs,
  },

  /* Sender */
  senderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  senderName: {
    color: Colors.primary,
    fontSize: FontSizes.xs,
    fontWeight: "600",
  },
  senderRole: {
    color: Colors.textTertiary,
    fontSize: FontSizes.xs,
    fontWeight: "400",
  },

  /* Message text */
  msgText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    lineHeight: 21,
  },
  msgTextMe: {
    color: "#F0FDF4",
  },
  msgTime: {
    color: Colors.textTertiary,
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
  },
  msgTimeMe: {
    color: "rgba(240, 253, 244, 0.50)",
  },

  /* Input area */
  inputArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: 34,
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: Colors.bgInput,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  input: {
    paddingHorizontal: Spacing.base,
    paddingTop: 11,
    paddingBottom: 11,
    color: Colors.textPrimary,
    fontSize: FontSizes.md,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.bgElevated,
  },
});
