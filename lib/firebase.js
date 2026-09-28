import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBnpOsdi-tGPRoG29s9XU41R5Ae_eVRgPY",
  authDomain: "loc-dashboard-1cd02.firebaseapp.com",
  projectId: "loc-dashboard-1cd02",
  storageBucket: "loc-dashboard-1cd02.firebasestorage.app",
  messagingSenderId: "222393185043",
  appId: "1:222393185043:web:c49fea65f1d06025c9a0e6"
};

// Initialize Firebase only once
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
