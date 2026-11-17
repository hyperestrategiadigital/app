// Camada de dados: todas as coleções ficam em users/{uid}/..., carregadas em memória e
// mantidas atualizadas em tempo real. As telas leem de `dados` e escrevem pelas funções abaixo.
import { db } from "./firebase.js";
import {
  collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

export const COLECOES = [
  "clientes", "tarefas", "recorrencias", "conteudos",
  "financeiro", "orcamentos", "contasAds", "manutencoes"
];

/** Dados em memória: dados.clientes = [{ id, ...campos }] */
export const dados = Object.fromEntries(COLECOES.map((c) => [c, []]));

let uidAtual = null;
let cancelamentos = [];
const ouvintes = new Set();

/** Registra uma função chamada sempre que algum dado muda. */
export function aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }

let agendado = false;
function notificar() {
  if (agendado) return;
  agendado = true;
  queueMicrotask(() => { agendado = false; ouvintes.forEach((fn) => fn()); });
}

const ref = (col) => collection(db, "users", uidAtual, col);

/** Começa a ouvir todas as coleções do usuário. Resolve quando tudo carregou uma vez. */
export function conectar(uid, aoErro) {
  desconectar();
  uidAtual = uid;
  return Promise.all(COLECOES.map((col) => new Promise((pronto) => {
    let primeira = true;
    cancelamentos.push(onSnapshot(ref(col), (snap) => {
      dados[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (primeira) { primeira = false; pronto(); }
      notificar();
    }, (erro) => { aoErro?.(erro); if (primeira) { primeira = false; pronto(); } }));
  })));
}

export function desconectar() {
  cancelamentos.forEach((c) => c());
  cancelamentos = [];
  uidAtual = null;
  COLECOES.forEach((c) => (dados[c] = []));
}

export const criar = (col, valores) => addDoc(ref(col), { ...valores, criadoEm: Date.now() });
export const salvarComId = (col, id, valores) => setDoc(doc(ref(col), id), valores, { merge: true });
export const atualizar = (col, id, valores) => updateDoc(doc(ref(col), id), { ...valores, atualizadoEm: Date.now() });
export const excluir = (col, id) => deleteDoc(doc(ref(col), id));

/** Grava muitos documentos em lotes de 400 (limite do Firestore é 500 por lote). */
export async function gravarEmLote(col, itens, aoProgredir) {
  for (let i = 0; i < itens.length; i += 400) {
    const lote = writeBatch(db);
    for (const item of itens.slice(i, i + 400)) {
      const { id, ...valores } = item;
      lote.set(id ? doc(ref(col), id) : doc(ref(col)), valores);
    }
    await lote.commit();
    aoProgredir?.(Math.min(i + 400, itens.length), itens.length);
  }
}

/* ---------------- Consultas de conveniência ---------------- */
export const porId = (col, id) => dados[col].find((x) => x.id === id);
export const nomeCliente = (id) => porId("clientes", id)?.nome || "Sem cliente";
export const clientesAtivos = () =>
  dados.clientes.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
export const opcoesClientes = (incluirVazio = true) => [
  ...(incluirVazio ? [["", "— Sem cliente —"]] : []),
  ...clientesAtivos().map((c) => [c.id, c.nome])
];
