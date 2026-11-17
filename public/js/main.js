import { auth, db } from "./firebase.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
let pararDeOuvir = null;

$("btn-entrar").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (erro) {
    mostrarErro("Não foi possível entrar: " + erro.message);
  }
});

$("btn-sair").addEventListener("click", () => signOut(auth));

$("form-nota").addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = $("texto-nota").value.trim();
  if (!texto || !auth.currentUser) return;
  try {
    await addDoc(collection(db, "notas"), {
      texto,
      uid: auth.currentUser.uid,
      criadoEm: serverTimestamp()
    });
    $("texto-nota").value = "";
  } catch (erro) {
    mostrarErro("Erro ao salvar: " + erro.message);
  }
});

onAuthStateChanged(auth, (usuario) => {
  $("area-login").hidden = !!usuario;
  $("area-app").hidden = !usuario;
  if (pararDeOuvir) { pararDeOuvir(); pararDeOuvir = null; }
  if (!usuario) return;

  $("nome-usuario").textContent = usuario.displayName || usuario.email;

  const q = query(
    collection(db, "notas"),
    where("uid", "==", usuario.uid)
  );
  pararDeOuvir = onSnapshot(q, (snap) => {
    const lista = $("lista-notas");
    lista.innerHTML = "";
    const notas = snap.docs
      .map((d) => d.data())
      .sort((a, b) => (b.criadoEm?.toMillis?.() ?? Date.now()) - (a.criadoEm?.toMillis?.() ?? Date.now()));
    notas.forEach((nota) => {
      const li = document.createElement("li");
      li.textContent = nota.texto;
      lista.appendChild(li);
    });
  }, (erro) => mostrarErro("Erro ao carregar: " + erro.message));
});

function mostrarErro(msg) {
  const el = $("erro");
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 6000);
}
