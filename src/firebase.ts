import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCf3-lvqA9Yq1UqK2jZaRfU_717e81azPw",
  authDomain: "stock-game-9c4ad.firebaseapp.com",
  projectId: "stock-game-9c4ad",
  storageBucket: "stock-game-9c4ad.firebasestorage.app",
  messagingSenderId: "492817324587",
  appId: "1:492817324587:web:207daf8ab50ee4e21aa86e",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
