// Camada de dados. Tudo da agência fica no espaço compartilhado espacos/hyper/...; cada pessoa
// entra com o próprio Google e vê o que as permissões dela deixam (regras em firestore.rules).
// As coleções ficam em memória e atualizadas em tempo real; as telas leem de `dados`.
import { app } from "./firebase.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, getDocs, getDoc, query, where
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { eu, definirEu, colecoesPermitidas, pode, ehAdmin, clientesRestritos } from "./permissoes.js";

export const ESPACO = "hyper";
/** Dados do documento do espaço (ex.: uid do dono). */
export const espacoInfo = { dono: "", emailUrl: "" };

// O console do Firebase pode criar o banco com o id "(default)" ou com o nome "default".
const BANCOS = ["(default)", "default"];
let db = null;
/** Id do banco em uso ("(default)" ou "default"): o script de e-mail precisa saber para ler os dados. */
export const bancoInfo = { id: "" };
// Cache no navegador: abre na hora com os dados da última visita e só busca o que mudou.
function abrirBanco(id) {
  try {
    const opcoes = { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) };
    return id === "(default)" ? initializeFirestore(app, opcoes) : initializeFirestore(app, opcoes, id);
  } catch (e) {
    console.warn("Cache local indisponível:", e.message);
    return id === "(default)" ? getFirestore(app) : getFirestore(app, id);
  }
}

const TODAS = [
  "clientes", "marcas", "tarefas", "recorrencias", "compromissos", "membros",
  "financeiro", "orcamentos", "contratos", "contasAds", "manutencoes", "aprovacoes", "config"
];

/** Dados em memória: dados.clientes = [{ id, ...campos }]. `config` reúne documentos avulsos (openai, equipe, agenda). */
export const dados = Object.fromEntries(TODAS.map((c) => [c, []]));
// Tarefas concluídas há mais de 90 dias ficam em `tarefasArquivo` e só são lidas quando preciso
// (relatórios e PDFs de meses antigos). Assim o app abre rápido mesmo com anos de histórico.
dados.tarefasArquivo = [];

let cancelamentos = [];
const ouvintes = new Set();
export function aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
let agendado = false;
export function notificar() {
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

/**
 * Descobre qual banco usar (lendo o documento do espaço, que qualquer pessoa logada pode ler).
 * Prefere o banco onde o espaço da Hyper já existe: assim uma conta nova nunca cai num banco vazio.
 */
async function escolherBanco() {
  let salvo = null;
  try { salvo = localStorage.getItem("hyper-banco"); } catch {}
  const ordem = salvo && BANCOS.includes(salvo) ? [salvo, ...BANCOS.filter((b) => b !== salvo)] : BANCOS;
  let ultimoErro = null;
  let semEspaco = null; // primeiro banco que respondeu, mas sem o espaço
  for (const id of ordem) {
    const candidato = abrirBanco(id);
    try {
      const espaco = await comPrazo(getDoc(doc(candidato, "espacos", ESPACO)), 15);
      if (espaco.exists()) {
        try { localStorage.setItem("hyper-banco", id); } catch {}
        return { banco: candidato, espaco, id };
      }
      semEspaco ??= { banco: candidato, espaco, id };
    } catch (e) {
      console.warn(`Banco ${id}:`, e.code, e.message);
      ultimoErro = e;
    }
  }
  if (semEspaco) return semEspaco;
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
  const { banco, espaco, id } = await escolherBanco();
  db = banco;
  bancoInfo.id = id;
  definirEu({ uid: usuario.uid, email: usuario.email, nome: usuario.displayName || usuario.email });
  if (!espaco.exists()) {
    const antigos = await comPrazo(getDocs(collection(db, "users", usuario.uid, "clientes")), 30).catch(() => null);
    return antigos && !antigos.empty ? "migrar" : "sem-espaco";
  }
  espacoInfo.dono = espaco.data().dono;
  espacoInfo.emailUrl = espaco.data().emailUrl || "";
  const dono = espaco.data().dono === usuario.uid;
  let membro = await comPrazo(getDoc(doc(ref("membros"), usuario.uid)), 15);
  if (!membro.exists() && !dono) {
    // Convidado pelo administrador? Entra direto com o acesso definido no convite.
    if (!(await aceitarConvite(usuario))) return "novo";
    membro = await comPrazo(getDoc(doc(ref("membros"), usuario.uid)), 15);
    espacoInfo.boasVindas = true;
  }
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

const emailChave = (email = "") => email.trim().toLowerCase();

async function aceitarConvite(usuario) {
  const refConvite = doc(ref("convites"), emailChave(usuario.email));
  const convite = await comPrazo(getDoc(refConvite), 15).catch(() => null);
  if (!convite?.exists()) return false;
  const c = convite.data();
  await comPrazo(setDoc(doc(ref("membros"), usuario.uid), {
    nome: usuario.displayName || c.nome || usuario.email, email: usuario.email,
    papel: c.papel, permissoes: c.permissoes, acessoClientes: c.acessoClientes || "todos", clientes: c.clientes || [],
    status: "ativo", criadoEm: Date.now(), convidadoPor: c.criadoPor || ""
  }));
  await comPrazo(deleteDoc(refConvite)).catch(() => {});
  return true;
}

// Coleções em que quem vê só alguns clientes também vê os itens sem cliente ("")
const COM_SEM_CLIENTE = new Set(["tarefas", "tarefasArquivo", "compromissos", "recorrencias"]);
// Coleções cujo id do documento é o id do cliente
const POR_ID = new Set(["clientes", "contratos"]);

/**
 * Ouve uma coleção. Para quem vê só alguns clientes, as regras exigem que a leitura já venha filtrada:
 * documentos um a um (clientes, contratos) ou consultas por clienteId (em lotes de 30, limite do Firestore).
 */
function ouvirColecao(col, aoMudar, aoErro) {
  if (col === "membros" || !clientesRestritos()) return [onSnapshot(ref(col), (s) => aoMudar(s.docs.map((d) => ({ id: d.id, ...d.data() }))), aoErro)];
  const ids = [...new Set(eu.clientes || [])];
  const partes = new Map();
  const juntar = () => aoMudar([...partes.values()].flat());
  if (POR_ID.has(col)) {
    if (!ids.length) { aoMudar([]); return []; }
    return ids.map((id) => onSnapshot(doc(ref(col), id), (s) => { partes.set(id, s.exists() ? [{ id: s.id, ...s.data() }] : []); if (partes.size === ids.length) juntar(); },
      (e) => { partes.set(id, []); if (partes.size === ids.length) juntar(); console.warn(col, id, e.code); }));
  }
  const valores = COM_SEM_CLIENTE.has(col) ? [...ids, ""] : ids;
  if (!valores.length) { aoMudar([]); return []; }
  const lotes = [];
  for (let i = 0; i < valores.length; i += 30) lotes.push(valores.slice(i, i + 30));
  return lotes.map((lote, i) => onSnapshot(query(ref(col), where("clienteId", "in", lote)), (s) => {
    partes.set(i, s.docs.map((d) => ({ id: d.id, ...d.data() })));
    if (partes.size === lotes.length) juntar();
  }, aoErro));
}

async function lerColecao(col) {
  if (!clientesRestritos()) return (await comPrazo(getDocs(ref(col)), 60)).docs.map((d) => ({ id: d.id, ...d.data() }));
  const valores = COM_SEM_CLIENTE.has(col) ? [...(eu.clientes || []), ""] : [...(eu.clientes || [])];
  const lista = [];
  for (let i = 0; i < valores.length; i += 30) {
    const snap = await comPrazo(getDocs(query(ref(col), where("clienteId", "in", valores.slice(i, i + 30)))), 60);
    lista.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }
  return lista;
}

const assinaturaAcesso = (m) => JSON.stringify([m.papel, m.permissoes, m.acessoClientes || "todos", m.clientes || []]);

function ouvirTudo(aoErro) {
  const permitidas = colecoesPermitidas();
  const colecoes = permitidas.map((col) => new Promise((pronto) => {
    let primeira = true;
    cancelamentos.push(...ouvirColecao(col, (lista) => {
      dados[col] = lista;
      if (col === "membros") {
        const meu = dados.membros.find((m) => m.id === eu.uid);
        if (meu && !eu.dono) {
          const antes = assinaturaAcesso(eu);
          definirEu({ ...eu, ...meu });
          if (antes !== assinaturaAcesso(eu)) location.reload(); // mudaram meus acessos
        }
      }
      if (primeira) { primeira = false; pronto(); }
      notificar();
    }, (erro) => { aoErro?.(traduzirErro(erro)); if (primeira) { primeira = false; pronto(); } }));
  }));
  // Documentos de configuração (lidos um a um, porque cada um tem uma regra)
  const docs = ["equipe", "agendaHyper", "clientes", "meta", "modelos", ...(pode("conteudo") ? ["openai"] : []), ...(pode("financeiro") && !clientesRestritos() ? ["comercial"] : []), ...(ehAdmin() ? ["email", "backup"] : [])].map((id) => new Promise((pronto) => {
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
/** Primeiro acesso: cria o cadastro pendente com o que a pessoa pediu (o administrador decide). */
export async function pedirAcesso({ nome, pedido }) {
  await comPrazo(setDoc(doc(ref("membros"), eu.uid), {
    nome, email: eu.email, papel: "basico", permissoes: [], status: "pendente", criadoEm: Date.now(),
    pedido: { ...pedido, em: Date.now() }
  }));
}

/** Campos do documento do espaço (o administrador só pode mudar a URL dos e-mails). */
export const atualizarEspaco = (valores) => comPrazo(updateDoc(doc(db, "espacos", ESPACO), valores)).then(() => Object.assign(espacoInfo, valores));

/** A própria pessoa: nome, foto e pedido de mais acesso (as regras não deixam mudar o resto). */
export const atualizarMeuCadastro = (valores) => comPrazo(updateDoc(doc(ref("membros"), eu.uid), { ...valores, atualizadoEm: Date.now() }));

/* ---------------- Convites (administrador) ---------------- */

export async function listarConvites() {
  const snap = await comPrazo(getDocs(ref("convites")), 30);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export const salvarConvite = (c) => comPrazo(setDoc(doc(ref("convites"), emailChave(c.email)), { ...c, email: emailChave(c.email), criadoEm: Date.now(), criadoPor: eu.email }));
export const excluirConvite = (email) => comPrazo(deleteDoc(doc(ref("convites"), emailChave(email))));

/** Lista de nomes dos clientes (config/clientes) para quem vê só alguns poder pedir outros. Só o administrador grava. */
export async function sincronizarNomesClientes() {
  const lista = dados.clientes.filter((c) => c.ativo !== false).map((c) => ({ id: c.id, nome: c.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const atual = dados.config.find((c) => c.id === "clientes")?.lista || [];
  if (JSON.stringify(atual) !== JSON.stringify(lista)) await salvarComId("config", "clientes", { lista });
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
/* ---------------- Comentários e histórico das tarefas ---------------- */
// espacos/hyper/tarefas/{id}/atividade: { tipo: "comentario" | "mudanca", texto, uid, nome, em, mencoes }
const refAtividade = (tarefaId) => collection(db, "espacos", ESPACO, "tarefas", tarefaId, "atividade");
export async function listarAtividade(tarefaId) {
  const snap = await comPrazo(getDocs(refAtividade(tarefaId)), 30);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.em - b.em);
}
/** Registra algo na tarefa (sem esperar: histórico nunca atrapalha o trabalho). */
export function registrarAtividade(tarefaId, { tipo = "mudanca", texto, mencoes = [] }) {
  if (!tarefaId || !texto || !db) return Promise.resolve();
  return setDoc(doc(refAtividade(tarefaId)), { tipo, texto: String(texto).slice(0, 3000), mencoes, uid: eu.uid, nome: eu.nome || eu.email || "", em: Date.now() })
    .catch((e) => console.warn("Histórico:", e.message));
}
export const excluirAtividade = (tarefaId, id) => comPrazo(deleteDoc(doc(refAtividade(tarefaId), id)));

/* ---------------- Lixeira (30 dias) ---------------- */
// O que é excluído destas coleções vai antes para a lixeira, de onde o administrador pode restaurar.
export const COM_LIXEIRA = new Set(["tarefas", "compromissos", "clientes", "marcas", "recorrencias", "financeiro", "orcamentos", "contasAds", "manutencoes"]);
export const DIAS_LIXEIRA = 30;

/** Exclui. Com lixeira (padrão nas coleções acima), guarda uma cópia por 30 dias. */
export async function excluir(col, id, { lixeira = true } = {}) {
  const item = porId(col, id);
  if (!lixeira || !COM_LIXEIRA.has(col) || !item) return comPrazo(deleteDoc(doc(ref(col), id)));
  const { id: _, ...valores } = item;
  const lote = writeBatch(db);
  lote.set(doc(ref("lixeira"), `${col}__${id}`), {
    colecao: col, idOriginal: id, dados: valores, clienteId: col === "clientes" ? id : (valores.clienteId || ""),
    titulo: valores.titulo || valores.nome || valores.descricao || valores.plataforma || "(sem título)",
    excluidoEm: Date.now(), excluidoPor: eu.nome || eu.email || "", excluidoPorUid: eu.uid
  });
  lote.delete(doc(ref(col), id));
  await comPrazo(lote.commit());
}

/** Lista a lixeira (só administrador). */
export const listarLixeira = async () => (await comPrazo(getDocs(ref("lixeira")), 30)).docs.map((d) => ({ id: d.id, ...d.data() }));
/** Devolve o item ao lugar de origem. */
export async function restaurarDaLixeira(item) {
  const lote = writeBatch(db);
  lote.set(doc(ref(item.colecao), item.idOriginal), item.dados);
  lote.delete(doc(ref("lixeira"), item.id));
  await comPrazo(lote.commit());
}
/** "Desfazer" logo depois de excluir: devolve o item e tira da lixeira. */
export async function desfazerExclusao(col, id, valores) {
  await salvarComId(col, id, valores);
  await comPrazo(deleteDoc(doc(ref("lixeira"), `${col}__${id}`))).catch(() => {});
}
export const excluirDaLixeira = (id) => comPrazo(deleteDoc(doc(ref("lixeira"), id)));
/** Apaga de vez o que está na lixeira há mais de 30 dias, e erros antigos (administrador, ao entrar). */
export async function limparAntigos() {
  const limite = Date.now() - DIAS_LIXEIRA * 86400000;
  for (const col of ["lixeira", "erros"]) {
    const snap = await comPrazo(getDocs(ref(col)), 30).catch(() => null);
    const velhos = (snap?.docs || []).filter((d) => (d.data().excluidoEm || d.data().em || 0) < limite);
    for (let i = 0; i < velhos.length; i += 400) {
      const lote = writeBatch(db);
      velhos.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
      await comPrazo(lote.commit());
    }
  }
}

/* ---------------- Registro de erros ---------------- */
let errosEnviados = 0;
const errosVistos = new Set();
/** Guarda um erro (para o administrador e o Claude diagnosticarem). Limitado a 15 por sessão. */
export async function registrarErro(msg, detalhe = "") {
  try {
    if (!db || !eu.uid) return;
    const chave = String(msg).slice(0, 200);
    if (errosVistos.has(chave) || ++errosEnviados > 15) return;
    errosVistos.add(chave);
    await setDoc(doc(ref("erros")), {
      msg: chave, detalhe: String(detalhe || "").slice(0, 1500), rota: location.hash.slice(0, 120),
      uid: eu.uid, email: eu.email || "", navegador: navigator.userAgent.slice(0, 200), em: Date.now()
    });
  } catch { /* registrar erro nunca pode gerar outro erro */ }
}
export const listarErros = async () => (await comPrazo(getDocs(ref("erros")), 30)).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.em - a.em);
export const excluirErro = (id) => comPrazo(deleteDoc(doc(ref("erros"), id)));

/** Grava muitos documentos em lotes de 400 (limite do Firestore é 500 por lote). */
/** Confere no banco (não na memória) se o documento já existe. */
export const existeNoBanco = async (col, id) => (await comPrazo(getDoc(doc(ref(col), id)), 15)).exists();

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

/* ---------------- Arquivo de tarefas antigas ---------------- */

const DIAS_ARQUIVO = 90;
const isoDe = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
/** Data (AAAA-MM-DD) antes da qual as tarefas concluídas vão para o arquivo. */
export const limiteArquivo = () => isoDe(new Date(Date.now() - DIAS_ARQUIVO * 86400000));
let arquivoCarregado = null;

/** Carrega o arquivo uma vez por sessão (as telas se atualizam quando chega). */
export function carregarArquivo() {
  if (!arquivoCarregado) {
    arquivoCarregado = lerColecao("tarefasArquivo").then((lista) => {
      dados.tarefasArquivo = lista.map((t) => ({ ...t, arquivada: true }));
      notificar();
    }).catch((e) => { arquivoCarregado = null; console.warn("Arquivo:", e.message); });
  }
  return arquivoCarregado;
}
/** Se o período começa antes do limite do arquivo, pede o arquivo (sem esperar). */
export function garantirArquivo(desde) {
  if (desde && desde < limiteArquivo()) carregarArquivo();
}
/** Tarefas atuais + arquivadas já carregadas. */
export const todasTarefas = () => (dados.tarefasArquivo.length ? [...dados.tarefas, ...dados.tarefasArquivo] : dados.tarefas);

/** Move para o arquivo as tarefas concluídas há mais de 90 dias (só administrador). */
export async function arquivarAntigas() {
  const limite = limiteArquivo();
  const velhas = dados.tarefas.filter((t) => t.status === "concluido" && (t.concluidoEm || t.prazo || "9999") < limite);
  for (let i = 0; i < velhas.length; i += 200) {
    const lote = writeBatch(db);
    for (const { id, ...t } of velhas.slice(i, i + 200)) {
      lote.set(doc(ref("tarefasArquivo"), id), { ...t, arquivadaEm: Date.now() });
      lote.delete(doc(ref("tarefas"), id));
    }
    await comPrazo(lote.commit(), 60);
  }
  if (velhas.length && arquivoCarregado) { arquivoCarregado = null; carregarArquivo(); }
  return velhas.length;
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
/** Atualiza só os campos dados de um documento de subcoleção (sem mexer em criadoEm). */
export const atualizarSub = (caminho, id, valores) => comPrazo(updateDoc(doc(refSub(caminho), id), valores));
/** Ouve uma subcoleção (ex.: respostas de um link de aprovação). Devolve a função para parar. */
export function ouvirSub(caminho, aoMudar) {
  return onSnapshot(refSub(caminho), (s) => aoMudar(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.warn(caminho.join("/"), e.code));
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

/** Campos de identidade (aba Marca), que existem no cliente e em cada marca dele. */
export const CAMPOS_IDENTIDADE = ["logo", "paleta", "cor", "fontes", "descricao", "tomDeVoz", "persona", "publico", "diretrizes", "estiloVisual", "identidadeVisual", "linkDrive", "linkCanva"];
/** Marcas ativas do cliente; a marca principal (ex.: a que leva o nome do grupo) vem primeiro. */
export const marcasDo = (clienteId) => (dados.marcas || []).filter((m) => m.clienteId === clienteId && m.ativo !== false)
  .sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0) || (a.ordem ?? 99) - (b.ordem ?? 99) || (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
/** Cliente com marcas funciona como grupo (guarda-chuva). */
export const ehGrupo = (clienteId) => marcasDo(clienteId).length > 0;
/**
 * Identidade usada na copy, na imagem e no pedido do Canva: a da marca (quando o post é de uma marca),
 * completando o que faltar com a do cliente. `nome` vira o da marca e `clienteNome` guarda o do cliente.
 */
export function identidade(clienteId, marcaId) {
  const c = porId("clientes", clienteId) || {};
  const m = marcaId ? porId("marcas", marcaId) : null;
  if (!m) return { ...c, clienteNome: c.nome };
  const r = { ...c, nome: m.nome, clienteNome: c.nome, marcaId: m.id };
  for (const k of CAMPOS_IDENTIDADE) if (m[k] && (!Array.isArray(m[k]) || m[k].filter(Boolean).length)) r[k] = m[k];
  if (m.paleta?.[0]) r.cor = m.paleta[0];
  return r;
}
