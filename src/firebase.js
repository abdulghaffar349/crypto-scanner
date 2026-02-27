import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

const FIREBASE_ENABLED =
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_DB_URL;

let db = null;

if (FIREBASE_ENABLED) {
  const firebaseConfig = {
    apiKey:        import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain:    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL:   import.meta.env.VITE_FIREBASE_DB_URL,
    projectId:     import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId:         import.meta.env.VITE_FIREBASE_APP_ID,
  };
  try {
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
  } catch (e) {
    console.warn("[Firebase] init failed:", e.message);
  }
}

export { db, ref, set, onValue, FIREBASE_ENABLED };
