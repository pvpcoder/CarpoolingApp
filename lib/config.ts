import Constants from "expo-constants";

export const GOOGLE_API_KEY = Constants.expoConfig?.extra?.googleApiKey || "";

export const SCHOOL = {
  name: "North Park Secondary School",
  address: "10 North Park Dr, Brampton, ON L6S 3M1",
  lat: 43.7205,
  lng: -79.7471,
};