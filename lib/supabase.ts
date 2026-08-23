import "react-native-get-random-values";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import * as aesjs from "aes-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

console.log("SUPABASE URL:", process.env.EXPO_PUBLIC_SUPABASE_URL);
console.log("SUPABASE KEY:", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

// The auth session (access + refresh token) can exceed SecureStore/Keychain's
// ~2048 byte per-item limit on iOS, which silently fails to persist and can
// log users out. Standard Supabase pattern: store the actual (larger) blob
// in AsyncStorage, encrypted with a small random key that itself lives in
// SecureStore (which comfortably fits the key).
class LargeSecureStore {
  private async _encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return await this._decrypt(key, encrypted);
  }

  async setItem(key: string, value: string) {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}

// SecureStore/AsyncStorage don't work on web, so we fall back to localStorage
const WebStorageAdapter = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    localStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
  },
};

const authStorage = Platform.OS === "web" ? WebStorageAdapter : new LargeSecureStore();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
