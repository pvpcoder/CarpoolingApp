import { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
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

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Chat</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView ref={scrollRef} style={styles.messageList} contentContainerStyle={styles.messageContent} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>💬</Text>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>Start the conversation with your carpool group!</Text>
          </View>
        ) : (
          messages.map((msg: any) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <View key={msg.id} style={[styles.row, isMe && styles.rowMe]}>
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                  {!isMe && (
                    <Text style={styles.senderName}>
                      {nameMap[msg.sender_id] || "Unknown"}{" "}
                      <Text style={styles.senderRole}>({msg.sender_role})</Text>
                    </Text>
                  )}
                  <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{msg.message}</Text>
                  <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>{formatTime(msg.created_at)}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput style={styles.input} placeholder="Type a message..." placeholderTextColor={Colors.textTertiary} value={newMessage} onChangeText={setNewMessage} multiline maxLength={500} />
        <PressableScale onPress={handleSend} disabled={!newMessage.trim() || sending} style={[styles.sendBtn, (!newMessage.trim() || sending) ? { opacity: 0.4 } : {}]}>
          <Text style={styles.sendText}>{sending ? "..." : "Send"}</Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: Colors.bgCard, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backText: { color: Colors.primary, fontSize: FontSizes.base, fontWeight: "600" },
  headerTitle: { color: Colors.textPrimary, fontSize: FontSizes.lg, fontWeight: "700" },
  messageList: { flex: 1 },
  messageContent: { padding: 16, paddingBottom: 8 },
  emptyContainer: { alignItems: "center", marginTop: 80 },
  emptyTitle: { color: Colors.textPrimary, fontSize: FontSizes.lg, fontWeight: "700", marginBottom: 8 },
  emptyText: { color: Colors.textSecondary, fontSize: FontSizes.sm },
  row: { flexDirection: "row", marginBottom: 12, justifyContent: "flex-start" },
  rowMe: { justifyContent: "flex-end" },
  bubble: { maxWidth: "75%", borderRadius: 18, padding: 12 },
  bubbleOther: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 4 },
  bubbleMe: { backgroundColor: Colors.primary, borderTopRightRadius: 4 },
  senderName: { color: Colors.primary, fontSize: FontSizes.sm, fontWeight: "700", marginBottom: 4 },
  senderRole: { color: Colors.textTertiary, fontSize: FontSizes.xs, fontWeight: "400" },
  msgText: { color: Colors.textPrimary, fontSize: FontSizes.md, lineHeight: 20 },
  msgTextMe: { color: Colors.bg },
  msgTime: { color: Colors.textTertiary, fontSize: FontSizes.xs, marginTop: 4, textAlign: "right" },
  msgTimeMe: { color: "rgba(15,17,32,0.5)" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", padding: 12, paddingBottom: 32, backgroundColor: Colors.bgCard, borderTopWidth: 1, borderTopColor: Colors.border, gap: 10 },
  input: { flex: 1, backgroundColor: Colors.bg, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: Colors.textPrimary, fontSize: FontSizes.md, maxHeight: 100, borderWidth: 1, borderColor: Colors.border },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 20 },
  sendText: { color: Colors.bg, fontSize: FontSizes.md, fontWeight: "700" },
});
