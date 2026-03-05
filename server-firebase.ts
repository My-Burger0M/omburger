import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA7RhEbX_TbcPh0LMR-_mlxNZ4ruxvkwcc",
  authDomain: "baseom-5a3d6.firebaseapp.com",
  projectId: "baseom-5a3d6",
  storageBucket: "baseom-5a3d6.firebasestorage.app",
  messagingSenderId: "655313290345",
  appId: "1:655313290345:web:364516d74b1ffde6d40ef8"
};

const app = initializeApp(firebaseConfig);

// Use initializeFirestore to force long polling which is more reliable in this environment
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export const auth = getAuth(app);
