// Configuração do Firebase (projeto hyper-9e023)
// Estes valores não são secretos: ficam visíveis no site de qualquer forma.
// A proteção dos dados é feita pelas regras de segurança (firestore.rules).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyA2zjfPUnIglM1SUWTeSh7QQlJyeucNbmA",
  authDomain: "hyper-9e023.firebaseapp.com",
  projectId: "hyper-9e023",
  storageBucket: "hyper-9e023.firebasestorage.app",
  messagingSenderId: "841546124951",
  appId: "1:841546124951:web:3b03142a6e0c0f773ba3d2",
  measurementId: "G-VE962KJH9K"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
