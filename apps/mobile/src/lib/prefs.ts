import AsyncStorage from "@react-native-async-storage/async-storage";

/** Small on-device settings (not secret): theme, biometric lock, dismissed hints, the push token. */
export const prefs = {
  get: (key: string) => AsyncStorage.getItem(`rx-pref:${key}`),
  set: (key: string, value: string) => AsyncStorage.setItem(`rx-pref:${key}`, value),
  remove: (key: string) => AsyncStorage.removeItem(`rx-pref:${key}`),
};
