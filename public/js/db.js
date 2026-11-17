// Camada de dados: todas as coleções ficam em users/{uid}/..., carregadas em memória e
// mantidas atualizadas em tempo real. As telas leem de `dados` e escrevem pelas funções abaixo.
import { app } from "./firebase.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, getDocs
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// O console do Firebase pode criar o banco com o id "(default)" ou com o nome "default".
// Testamos os dois e guardamos o que funcionou.
const BANCOS = ["(default)", "default"];
let db = null;
const abrirBanco = (id) => (id === "(default)" ? getFirestore(app) : getFirestore(app, id));

export const COLECOES = [
  "clientes", "tarefas", "recorrencias", "conteudos",
  "financeiro", "orcamentos", "contasAds", "manutencoes", "config", "compromissos"
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

/** Descobre qual banco existe lendo a coleção de clientes do usuário. */
async function escolherBanco(uid) {
  let salvo = null;
  try { salvo = localStorage.getItem("hyper-banco"); } catch {}
  const ordem = salvo && BANCOS.includes(salvo) ? [salvo, ...BANCOS.filter((b) => b !== salvo)] : BANCOS;
  let ultimoErro = null;
  for (const id of ordem) {
    const candidato = abrirBanco(id);
    const resultado = await new Promise((ok) => {
      const tempo = setTimeout(() => { parar(); ok({ erro: { code: "timeout", message: "O banco não respondeu em 15 segundos." } }); }, 15000);
      const parar = onSnapshot(collection(candidato, "users", uid, "clientes"),
        () => { clearTimeout(tempo); parar(); ok({}); },
        (erro) => { clearTimeout(tempo); ok({ erro }); });
    });
    if (!resultado.erro) {
      try { localStorage.setItem("hyper-banco", id); } catch {}
      return candidato;
    }
    console.warn(`Banco ${id}:`, resultado.erro.code, resultado.erro.message);
    ultimoErro = resultado.erro;
    // Sem permissão = o banco existe, mas as regras estão erradas: não adianta tentar o outro
    if (resultado.erro.code === "permission-denied") break;
  }
  throw traduzirErro(ultimoErro);
}

export function traduzirErro(erro) {
  const codigo = erro?.code || "";
  let msg = erro?.message || String(erro);
  if (codigo === "permission-denied")
    msg = "Sem permissão no banco de dados. Cole as regras novas em Firestore → Segurança e clique em Publicar.";
  else if (codigo === "not-found" || /does not exist|not found/i.test(msg))
    msg = "Banco de dados não encontrado. Confira se o Firestore foi criado no console do Firebase.";
  else if (codigo === "timeout" || codigo === "unavailable")
    msg = "O banco de dados não respondeu. Confira sua internet e recarregue a página.";
  const e = new Error(msg);
  e.code = codigo;
  return e;
}

/** Garante que uma gravação termina ou dá erro em até 30 segundos (nunca fica carregando para sempre). */
function comPrazo(promessa, segundos = 30) {
  return Promise.race([
    promessa.catch((e) => { throw traduzirErro(e); }),
    new Promise((_, falha) => setTimeout(() => falha(traduzirErro({ code: "timeout" })), segundos * 1000))
  ]);
}

/** Começa a ouvir todas as coleções do usuário. Resolve quando tudo carregou uma vez. */
export async function conectar(uid, aoErro) {
  desconectar();
  db = await escolherBanco(uid);
  uidAtual = uid;
  return Promise.all(COLECOES.map((col) => new Promise((pronto) => {
    let primeira = true;
    cancelamentos.push(onSnapshot(ref(col), (snap) => {
      dados[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (primeira) { primeira = false; pronto(); }
      notificar();
    }, (erro) => { aoErro?.(traduzirErro(erro)); if (primeira) { primeira = false; pronto(); } }));
  })));
}

export function desconectar() {
  cancelamentos.forEach((c) => c());
  cancelamentos = [];
  uidAtual = null;
  COLECOES.forEach((c) => (dados[c] = []));
}

/** Cria um documento. O id é gerado na hora, então ele já pode ser usado antes do servidor confirmar. */
export async function criar(col, valores) {
  const novo = doc(ref(col));
  await comPrazo(setDoc(novo, { ...valores, criadoEm: Date.now() }));
  return novo;
}
export const novoId = (col) => doc(ref(col)).id;
export const salvarComId = (col, id, valores) => comPrazo(setDoc(doc(ref(col), id), valores, { merge: true }));
export const atualizar = (col, id, valores) => comPrazo(updateDoc(doc(ref(col), id), { ...valores, atualizadoEm: Date.now() }));
export const excluir = (col, id) => comPrazo(deleteDoc(doc(ref(col), id)));

/** Grava muitos documentos em lotes de 400 (limite do Firestore é 500 por lote). */
export async function gravarEmLote(col, itens, aoProgredir) {
  for (let i = 0; i < itens.length; i += 400) {
    const lote = writeBatch(db);
    for (const item of itens.slice(i, i + 400)) {
      const { id, ...valores } = item;
      lote.set(id ? doc(ref(col), id) : doc(ref(col)), valores);
    }
    await comPrazo(lote.commit(), 60);
    aoProgredir?.(Math.min(i + 400, itens.length), itens.length);
  }
}

/* ---------------- Subcoleções sob demanda (arquivos pesados, não ficam em memória) ---------------- */
// caminho: ex. ["clientes", clienteId, "arquivos"]
const refSub = (caminho) => collection(db, "users", uidAtual, ...caminho);
export async function listarSub(caminho) {
  const snap = await comPrazo(getDocs(refSub(caminho)), 60);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function salvarSub(caminho, valores, id) {
  const r = id ? doc(refSub(caminho), id) : doc(refSub(caminho));
  await comPrazo(setDoc(r, { ...valores, criadoEm: Date.now() }, { merge: true }), 60);
  return r.id;
}
export const excluirSub = (caminho, id) => comPrazo(deleteDoc(doc(refSub(caminho), id)));

/* ---------------- Consultas de conveniência ---------------- */
export const porId = (col, id) => dados[col].find((x) => x.id === id);
export const nomeCliente = (id) => porId("clientes", id)?.nome || "Sem cliente";
export const clientesAtivos = () =>
  dados.clientes.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
export const opcoesClientes = (incluirVazio = true) => [
  ...(incluirVazio ? [["", "— Sem cliente —"]] : []),
  ...clientesAtivos().map((c) => [c.id, c.nome])
];
