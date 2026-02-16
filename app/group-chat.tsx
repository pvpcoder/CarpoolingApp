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
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { getValidUser, handleLogout } from "../lib/helpers";
import { notifyGroupMembers } from "../lib/notifications";

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

  useEffect(() => {
    loadChat();
    const interval = setInterval(loadMessages, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadChat = async () => {
    try {
      const user = await getValidUser();
      if (!user) {
        handleLogout(router);
        return;
      }
      setCurrentUserId(user.id);

      // Check if student or parent
      const { data: student } = await supabase
        .from("students")
        .select("id, name")
        .eq("id", user.id)
        .single();

      if (student) {
        setCurrentUserRole("student");
        setCurrentUserName(student.name);
      } else {
        const { data: parent } = await supabase
          .from("parents")
          .select("id, name")
          .eq("id", user.id)
          .single();

        if (parent) {
          setCurrentUserRole("parent");
          setCurrentUserName(parent.name);
        }
      }

      // Build name map from group members
      const { data: members } = await supabase
        .from("group_members")
        .select(
          `
        student_id, parent_id,
        students ( name ),
        parents ( name )
      `
        )
        .eq("group_id", groupId)
        .eq("status", "active");

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
      if (
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("Network request failed")
      ) {
        Alert.alert(
          "No Internet",
          "Please check your internet connection and try again.",
          [{ text: "Retry", onPress: () => loadChat() }]
        );
      } else {
        Alert.alert("Error", "Couldn't load chat. Please try again.", [
          { text: "Retry", onPress: () => loadChat() },
          { text: "Go Back", onPress: () => router.back() },
        ]);
      }
    }
  };

  const loadMessages = async () => {
    try {
      const { data } = await supabase
        .from("group_messages")
        .select("id, sender_id, sender_role, message, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(100);

      setMessages(data || []);
      setTimeout(
        () => scrollRef.current?.scrollToEnd({ animated: false }),
        100
      );
    } catch {
      // Silently fail on polling — don't spam alerts every 5 seconds
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !currentUserId || !currentUserRole) return;

    setSending(true);

    try {
      const { error } = await supabase.from("group_messages").insert({
        group_id: groupId,
        sender_id: currentUserId,
        sender_role: currentUserRole,
        message: newMessage.trim(),
      });

      if (error) {
        setSending(false);
        Alert.alert("Error", "Couldn't send message. Please try again.");
        return;
      }

      // Notify group members
      notifyGroupMembers(
        groupId as string,
        currentUserId!,
        `💬 ${currentUserName}`,
        newMessage.trim()
      );

      setNewMessage("");
      await loadMessages();
      setSending(false);
    } catch (err: any) {
      setSending(false);
      if (
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("Network request failed")
      ) {
        Alert.alert(
          "No Internet",
          "Please check your internet connection and try again."
        );
      } else {
        Alert.alert("Error", "Couldn't send message. Please try again.");
      }
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
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00d4aa" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Chat</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: false })
        }
      >
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>💬</Text>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>
              Start the conversation with your carpool group!
            </Text>
          </View>
        ) : (
          messages.map((msg: any) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <View
                key={msg.id}
                style={[
                  styles.messageBubbleRow,
                  isMe && styles.messageBubbleRowMe,
                ]}
              >
                <View
                  style={[
                    styles.messageBubble,
                    isMe ? styles.bubbleMe : styles.bubbleOther,
                  ]}
                >
                  {!isMe && (
                    <Text style={styles.senderName}>
                      {nameMap[msg.sender_id] || "Unknown"}{" "}
                      <Text style={styles.senderRole}>
                        ({msg.sender_role})
                      </Text>
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.messageText,
                      isMe && styles.messageTextMe,
                    ]}
                  >
                    {msg.message}
                  </Text>
                  <Text
                    style={[
                      styles.messageTime,
                      isMe && styles.messageTimeMe,
                    ]}
                  >
                    {formatTime(msg.created_at)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#666"
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!newMessage.trim() || sending) && styles.sendDisabled,
          ]}
          onPress={handleSend}
          disabled={!newMessage.trim() || sending}
        >
          <Text style={styles.sendText}>
            {sending ? "..." : "Send"}
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
  loadingContainer: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: "#16213e",
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a4a",
  },
  backText: {
    color: "#00d4aa",
    fontSize: 16,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyContainer: {
    alignItems: "center",
    marginTop: 80,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
  },
  messageBubbleRow: {
    flexDirection: "row",
    marginBottom: 12,
    justifyContent: "flex-start",
  },
  messageBubbleRowMe: {
    justifyContent: "flex-end",
  },
  messageBubble: {
    maxWidth: "75%",
    borderRadius: 16,
    padding: 12,
  },
  bubbleOther: {
    backgroundColor: "#16213e",
    borderTopLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: "#00d4aa",
    borderTopRightRadius: 4,
  },
  senderName: {
    color: "#00d4aa",
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 4,
  },
  senderRole: {
    color: "#999",
    fontSize: 11,
    fontWeight: "normal",
  },
  messageText: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextMe: {
    color: "#1a1a2e",
  },
  messageTime: {
    color: "#999",
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
  },
  messageTimeMe: {
    color: "#1a6a5a",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    paddingBottom: 32,
    backgroundColor: "#16213e",
    borderTopWidth: 1,
    borderTopColor: "#2a2a4a",
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: "#2a2a4a",
  },
  sendButton: {
    backgroundColor: "#00d4aa",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendText: {
    color: "#1a1a2e",
    fontSize: 15,
    fontWeight: "bold",
  },
});
