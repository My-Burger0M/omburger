import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, setLogLevel } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA7RhEbX_TbcPh0LMR-_mlxNZ4ruxvkwcc",
  authDomain: "baseom-5a3d6.firebaseapp.com",
  projectId: "baseom-5a3d6",
  storageBucket: "baseom-5a3d6.firebasestorage.app",
  messagingSenderId: "655313290345",
  appId: "1:655313290345:web:364516d74b1ffde6d40ef8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Suppress internal firestore logs
setLogLevel('silent');

// Use initializeFirestore to configure settings for better stability in restricted environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
export const storage = getStorage(app);
