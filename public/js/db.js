// Camada de dados. Tudo da agência fica no espaço compartilhado espacos/hyper/...; cada pessoa
// entra com o próprio Google e vê o que as permissões dela deixam (regras em firestore.rules).
// As coleções ficam em memória e atualizadas em tempo real; as telas leem de `dados`.
import { app } from "./firebase.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, getDocs, getDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { eu, definirEu, colecoesPermitidas, pode } from "./permissoes.js";

export const ESPACO = "hyper";
/** Dados do documento do espaço (ex.: uid do dono). */
export const espacoInfo = { dono: "" };

// O console do Firebase pode criar o banco com o id "(default)" ou com o nome "default".
const BANCOS = ["(default)", "default"];
let db = null;
const abrirBanco = (id) => (id === "(default)" ? getFirestore(app) : getFirestore(app, id));

const TODAS = [
  "clientes", "tarefas", "recorrencias", "compromissos", "membros",
  "financeiro", "orcamentos", "contratos", "contasAds", "manutencoes", "config", "conteudos"
];

/** Dados em memória: dados.clientes = [{ id, ...campos }]. `config` reúne documentos avulsos (openai, equipe, agenda). */
export const dados = Object.fromEntries(TODAS.map((c) => [c, []]));

let cancelamentos = [];
const ouvintes = new Set();
export function aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
let agendado = false;
function notificar() {
  if (agendado) return;
  agendado = true;
  queueMicrotask(() => { agendado = false; ouvintes.forEach((fn) => fn()); });
}

const ref = (col) => collection(db, "espacos", ESPACO, col);
// Documentos pessoais (só a própria pessoa lê): ex. a Google Agenda conectada
const refPessoal = (...caminho) => doc(db, "espacos", ESPACO, "pessoal", eu.uid, ...caminho);
const docConfig = (id) => (id === "agenda" ? refPessoal("config", "agenda") : doc(ref("config"), id));

export function traduzirErro(erro) {
  const codigo = erro?.code || "";
  let msg = erro?.message || String(erro);
  if (codigo === "permission-denied")
    msg = "Sem permissão para isso. Se você é o administrador, confira se as regras novas foram coladas em Firestore → Segurança.";
  else if (codigo === "not-found" || /does not exist|not found/i.test(msg))
    msg = "Banco de dados não encontrado. Confira se o Firestore foi criado no console do Firebase.";
  else if (codigo === "timeout" || codigo === "unavailable")
    msg = "O banco de dados não respondeu. Confira sua internet e recarregue a página.";
  const e = new Error(msg);
  e.code = codigo;
  return e;
}

/** Garante que uma operação termina ou dá erro (nunca fica carregando para sempre). */
function comPrazo(promessa, segundos = 30) {
  return Promise.race([
    promessa.catch((e) => { throw traduzirErro(e); }),
    new Promise((_, falha) => setTimeout(() => falha(traduzirErro({ code: "timeout" })), segundos * 1000))
  ]);
}

/** Descobre qual banco existe (lendo o documento do espaço, que qualquer pessoa logada pode ler). */
async function escolherBanco() {
  let salvo = null;
  try { salvo = localStorage.getItem("hyper-banco"); } catch {}
  const ordem = salvo && BANCOS.includes(salvo) ? [salvo, ...BANCOS.filter((b) => b !== salvo)] : BANCOS;
  let ultimoErro = null;
  for (const id of ordem) {
    const candidato = abrirBanco(id);
    try {
      const espaco = await comPrazo(getDoc(doc(candidato, "espacos", ESPACO)), 15);
      try { localStorage.setItem("hyper-banco", id); } catch {}
      return { banco: candidato, espaco };
    } catch (e) {
      console.warn(`Banco ${id}:`, e.code, e.message);
      ultimoErro = e;
      if (e.code === "permission-denied") break;
    }
  }
  throw ultimoErro;
}

/**
 * Entra no espaço. Resolve com o estado:
 *  - "ok": membro, dados carregando
 *  - "migrar": o espaço ainda não existe e esta conta tem dados antigos (conta da Hyper)
 *  - "sem-espaco": o espaço ainda não existe e esta conta não tem dados
 *  - "novo": o espaço existe, mas esta pessoa ainda não é membro (pedir acesso)
 *  - "pendente": pediu acesso e o administrador ainda não liberou
 */
export async function conectar(usuario, aoErro) {
  desconectar();
  const { banco, espaco } = await escolherBanco();
  db = banco;
  definirEu({ uid: usuario.uid, email: usuario.email, nome: usuario.displayName || usuario.email });
  if (!espaco.exists()) {
    const antigos = await comPrazo(getDocs(collection(db, "users", usuario.uid, "clientes")), 30).catch(() => null);
    return antigos && !antigos.empty ? "migrar" : "sem-espaco";
  }
  espacoInfo.dono = espaco.data().dono;
  const dono = espaco.data().dono === usuario.uid;
  const membro = await comPrazo(getDoc(doc(ref("membros"), usuario.uid)), 15);
  if (!membro.exists() && !dono) return "novo";
  if (!dono && membro.data().status !== "ativo") {
    // Recarrega sozinho quando o administrador liberar
    cancelamentos.push(onSnapshot(doc(ref("membros"), usuario.uid), (s) => { if (s.data()?.status === "ativo") location.reload(); }, () => {}));
    definirEu({ uid: usuario.uid, email: usuario.email, ...membro.data() });
    return "pendente";
  }
  definirEu({ uid: usuario.uid, email: usuario.email, nome: usuario.displayName || usuario.email, ...(membro.data() || {}), dono, ...(dono ? { papel: "admin" } : {}) });
  await ouvirTudo(aoErro);
  return "ok";
}

function ouvirTudo(aoErro) {
  const permitidas = colecoesPermitidas();
  const colecoes = permitidas.map((col) => new Promise((pronto) => {
    let primeira = true;
    cancelamentos.push(onSnapshot(ref(col), (snap) => {
      dados[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (col === "membros") {
        const meu = dados.membros.find((m) => m.id === eu.uid);
        if (meu && !eu.dono) { const antes = JSON.stringify([eu.papel, eu.permissoes]); definirEu({ ...eu, ...meu }); if (antes !== JSON.stringify([eu.papel, eu.permissoes])) location.reload(); }
      }
      if (primeira) { primeira = false; pronto(); }
      notificar();
    }, (erro) => { aoErro?.(traduzirErro(erro)); if (primeira) { primeira = false; pronto(); } }));
  }));
  // Documentos de configuração (lidos um a um, porque cada um tem uma regra)
  const docs = ["equipe", "agenda", ...(pode("conteudo") ? ["openai"] : [])].map((id) => new Promise((pronto) => {
    let primeira = true;
    cancelamentos.push(onSnapshot(docConfig(id), (snap) => {
      dados.config = [...dados.config.filter((c) => c.id !== id), ...(snap.exists() ? [{ id, ...snap.data() }] : [])];
      if (primeira) { primeira = false; pronto(); }
      notificar();
    }, (erro) => { console.warn("config", id, erro); if (primeira) { primeira = false; pronto(); } }));
  }));
  return Promise.all([...colecoes, ...docs]);
}

export function desconectar() {
  cancelamentos.forEach((c) => c());
  cancelamentos = [];
  TODAS.forEach((c) => (dados[c] = []));
}

/** Pessoa nova pede acesso: entra como básica e o admin libera as áreas depois. */
export async function pedirAcesso({ nome, funcoes }) {
  await comPrazo(setDoc(doc(ref("membros"), eu.uid), {
    nome, email: eu.email, papel: "basico", permissoes: [], funcoesPedidas: funcoes || [], status: "pendente", criadoEm: Date.now()
  }));
}

/* ---------------- Escrita ---------------- */
export async function criar(col, valores) {
  const novo = doc(ref(col));
  await comPrazo(setDoc(novo, { ...valores, criadoEm: Date.now() }));
  return novo;
}
export const novoId = (col) => doc(ref(col)).id;
export const salvarComId = (col, id, valores) =>
  comPrazo(setDoc(col === "config" ? docConfig(id) : doc(ref(col), id), valores, { merge: true }));
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
const refSub = (caminho) => collection(db, "espacos", ESPACO, ...caminho);
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

/* ---------------- Migração: dados antigos (users/{uid}) → espaço compartilhado ---------------- */
const ANTIGAS = ["clientes", "tarefas", "recorrencias", "compromissos", "financeiro", "orcamentos", "contasAds", "manutencoes", "conteudos"];
const CAMPOS_CONTRATO = ["mensalidade", "diaVencimento"];

export async function migrarParaEspaco(usuario, aoProgredir = () => {}) {
  const uid = usuario.uid;
  const antigo = (...c) => collection(db, "users", uid, ...c);
  // 1) Cria o espaço e o dono como administrador
  await comPrazo(setDoc(doc(db, "espacos", ESPACO), { nome: "Hyper", dono: uid, criadoEm: Date.now(), migradoDe: uid }));
  await comPrazo(setDoc(doc(ref("membros"), uid), {
    nome: usuario.displayName || "Hyper", email: usuario.email, papel: "admin", permissoes: ["conteudo", "trafego", "financeiro"], status: "ativo", criadoEm: Date.now()
  }));
  definirEu({ uid, email: usuario.email, nome: usuario.displayName, papel: "admin", dono: true });
  espacoInfo.dono = uid;
  // 2) Copia as coleções
  const contratos = [];
  for (const col of ANTIGAS) {
    aoProgredir(`Copiando ${col}…`);
    const snap = await comPrazo(getDocs(antigo(col)), 120);
    const itens = snap.docs.map((d) => {
      const v = { id: d.id, ...d.data() };
      if (col === "clientes") {
        // Valores do contrato saem da ficha (todos veem) e vão para "contratos" (só financeiro vê)
        const contrato = Object.fromEntries(CAMPOS_CONTRATO.filter((k) => v[k] != null && v[k] !== "").map((k) => [k, v[k]]));
        if (Object.keys(contrato).length) contratos.push({ id: d.id, clienteId: d.id, ...contrato });
        CAMPOS_CONTRATO.forEach((k) => delete v[k]);
      }
      return v;
    });
    if (itens.length) await gravarEmLote(col, itens);
    if (col === "clientes") {
      for (const c of itens) {
        const artes = await comPrazo(getDocs(antigo("clientes", c.id, "artes")), 120).catch(() => null);
        if (artes && !artes.empty) {
          aoProgredir(`Copiando criativos de ${c.nome}…`);
          for (const a of artes.docs) await salvarSub(["clientes", c.id, "artes"], a.data(), a.id);
        }
      }
    }
  }
  if (contratos.length) await gravarEmLote("contratos", contratos);
  // 3) Configurações
  aoProgredir("Copiando configurações…");
  const cfg = await comPrazo(getDocs(antigo("config")), 60).catch(() => null);
  for (const d of cfg?.docs || []) {
    if (d.id === "agenda") await comPrazo(setDoc(refPessoal("config", "agenda"), d.data()));
    else await comPrazo(setDoc(doc(ref("config"), d.id), d.data()));
  }
}

/* ---------------- Consultas de conveniência ---------------- */
export const porId = (col, id) => dados[col].find((x) => x.id === id);
export const nomeCliente = (id) => porId("clientes", id)?.nome || "Sem cliente";
export const clientesAtivos = () =>
  dados.clientes.filter((c) => c.ativo !== false).sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
export const opcoesClientes = (incluirVazio = true) => [
  ...(incluirVazio ? [["", "— Sem cliente —"]] : []),
  ...clientesAtivos().map((c) => [c.id, c.nome])
];
/** Contrato do cliente (mensalidade, dia de vencimento). Só chega para quem tem acesso ao financeiro. */
export const contrato = (clienteId) => porId("contratos", clienteId) || {};
