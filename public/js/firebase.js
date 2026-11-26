// Configuração do Firebase (projeto hyper-9e023)
// Estes valores não são secretos: ficam visíveis no site de qualquer forma.
// A proteção dos dados é feita pelas regras de segurança (firestore.rules).
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";
export { firebaseConfig };

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
