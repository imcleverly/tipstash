import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().some((candidate) => candidate.name === "tipstash-server")
  ? getApp("tipstash-server")
  : initializeApp(config, "tipstash-server");

// This is the Firebase Web SDK, so server reads still pass through Firestore rules.
export const publicDb = getFirestore(app);
