import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDHnbKm7gPwLEyh75W0LcLaZB9zcjFdICY",
  authDomain: "apt-construction-qc.firebaseapp.com",
  projectId: "apt-construction-qc",
  storageBucket: "apt-construction-qc.firebasestorage.app",
  messagingSenderId: "1045811083465",
  appId: "1:1045811083465:web:547368ee25d396c6c3f518",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);