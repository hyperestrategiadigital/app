// Aba "Marca" da ficha do cliente. Um cliente pode ter várias marcas (ex.: um grupo com uma marca para cada
// negócio), cada uma com identidade e linguagem próprias.
// A "marca principal" é a identidade do próprio cliente; as demais ficam em `marcas` e, onde um campo
// estiver vazio, usam o do cliente. Alimenta o pedido de copy para a IA (ia.js).
import { el, avisar, linkExterno, campoCor, abrirModal, confirmar, formulario, fecharModais, normalizar } from "../ui.js";
import { dados, atualizar, criar, excluir, porId, marcasDo, salvarComId, gravarEmLote, contrato, listarSub, salvarSub, excluirSub, identidade, carregarArquivo } from "../db.js";
import { ehAdmin, pode } from "../permissoes.js";
import { caminhoArtes, comprimirImagem } from "../arquivos.js";
import { CAMPOS_REDES } from "../constantes.js";
import { ajustesPedidos } from "../ia.js";
import { quandoDoTexto, quandoParaTela } from "../datas.js";
import { abrirImportarBriefing } from "./importarBriefing.js";
import { medidorMarca } from "./assistenteIA.js";
import { abrirCliente } from "./clientes.js";

// Texto digitado e ainda não salvo sobrevive às atualizações de tela
const rascunhos = new Map();
export const GRUPO = "__grupo"; // no seletor: a identidade institucional do próprio grupo

/** Onde gravar: o próprio cliente (marca principal) ou um documento de `marcas`. */
const alvoDe = (c, marca) => marca
  ? { col: "marcas", id: marca.id, obj: marca, herda: c, nome: marca.nome }
  : { col: "clientes", id: c.id, obj: c, herda: null, nome: c.nome };
const gravar = (alvo, valores) => atualizar(alvo.col, alvo.id, valores);
const herdado = (alvo, campo, dica) => alvo.herda && alvo.herda[campo]
  ? `Vazio: usa o do grupo (${String(alvo.herda[campo]).slice(0, 80)}${String(alvo.herda[campo]).length > 80 ? "…" : ""})` : dica;

function editorCores(alvo) {
  const base = alvo.obj.paleta?.length ? alvo.obj.paleta : alvo.obj.cor ? [alvo.obj.cor] : (alvo.herda?.paleta || ["#4E2CA3"]);
  const paleta = [...base];
  const salvar = async () => { await gravar(alvo, { paleta: paleta.filter(Boolean), cor: paleta[0] }); };
  const demais = el("div", { class: "paleta" });
  const desenharDemais = () => demais.replaceChildren(
    ...paleta.slice(1).map((cor, i) => el("div", { class: "cor" },
      campoCor(cor, (v) => { paleta[i + 1] = v; salvar(); }),
      el("button", { class: "icone", "aria-label": "Remover cor", onClick: () => { paleta.splice(i + 1, 1); desenharDemais(); salvar(); } }, "✕"))),
    el("button", { class: "secundario mini", onClick: () => { paleta.push("#FFFFFF"); desenharDemais(); salvar(); } }, "+ Cor"));
  desenharDemais();
  return el("div", { class: "cores-marca" },
    el("div", { class: "cor-principal" },
      el("h3", {}, "Cor principal"),
      el("p", { class: "subtitulo" }, alvo.herda ? "Identifica os posts desta marca no calendário e nos cartões." : "Usada para identificar o cliente em todo o app (calendário, cartões, PDF)."),
      campoCor(paleta[0], (v) => { paleta[0] = v; salvar(); })),
    el("div", {},
      el("h3", {}, "Demais cores"),
      demais));
}

function campoTexto(alvo, campo, rotulo, dica, linhas = 4) {
  const chave = `${alvo.col}|${alvo.id}|${campo}`;
  const area = el("textarea", { rows: linhas, placeholder: herdado(alvo, campo, dica), id: `marca-${campo}` });
  area.value = rascunhos.has(chave) ? rascunhos.get(chave) : (alvo.obj[campo] || "");
  const botao = el("button", { class: "mini", hidden: !rascunhos.has(chave), onClick: async () => {
    rascunhos.delete(chave);
    await gravar(alvo, { [campo]: area.value.trim() });
    avisar("Salvo.");
  } }, "Salvar");
  const marcar = () => { rascunhos.set(chave, area.value); botao.hidden = false; };
  area.addEventListener("input", marcar);
  return el("div", { class: "campo-marca" },
    el("div", { class: "com-acao" }, el("h3", {}, rotulo),
      el("div", { class: "tela-acoes" }, botao)),
    area);
}

/**
 * Datas comemorativas da marca (aniversário, Dia do Queijo, Semana da Segurança…): aparecem no calendário e no
 * planejamento do mês, e vão para o pedido de copy dos posts perto delas. Feriados nacionais o app já tem.
 * Na marca de um grupo, vazio = usa as do grupo.
 */
function campoDatas(alvo) {
  const lista = [...(alvo.obj.datas || [])];
  const herdadas = !lista.length && alvo.herda?.datas?.length ? alvo.herda.datas : null;
  const nome = el("input", { type: "text", placeholder: "Ex.: Aniversário da loja", "aria-label": "Nome da data", id: "marca-data-nome" });
  const quando = el("input", { type: "text", placeholder: "DD/MM, MM ou DD/MM/AAAA", "aria-label": "Quando", id: "marca-data-quando" });
  const salvar = (nova) => gravar(alvo, { datas: nova });
  const ordem = (d) => (d.quando.length === 2 ? `${d.quando}-00` : d.quando.slice(-5));
  return el("div", { class: "campo-marca datas-marca" },
    el("h3", {}, "Datas comemorativas da marca"),
    el("p", { class: "subtitulo" }, "As que esta marca celebra. Aparecem no calendário e no planejamento do mês e vão para o pedido de copy dos posts perto delas. Feriados nacionais e datas como Dia das Mães o app já conhece."),
    herdadas ? el("p", { class: "nota" }, `Vazio: usa as do grupo (${herdadas.map((d) => d.nome).join(", ")}).`) : null,
    lista.length ? el("ul", { class: "lista-editavel" }, [...lista].sort((a, b) => ordem(a).localeCompare(ordem(b))).map((d) => el("li", {},
      el("span", { class: "lista-editavel-nome" }, el("strong", {}, quandoParaTela(d.quando)), ` · ${d.nome}${d.quando.length === 2 ? " (o mês todo)" : ""}`),
      el("button", { class: "icone", "aria-label": `Tirar ${d.nome}`, onClick: async () => { await salvar(lista.filter((x) => x !== d)); avisar("Data tirada."); } }, "✕")))) : null,
    el("div", { class: "linha-data-marca" }, quando, nome,
      el("button", { class: "secundario mini", onClick: async () => {
        const q = quandoDoTexto(quando.value);
        if (!q || !nome.value.trim()) { avisar("Preencha a data (DD/MM, MM para o mês todo ou DD/MM/AAAA) e o nome.", "erro"); return; }
        await salvar([...lista, { quando: q, nome: nome.value.trim() }]);
        avisar("Data adicionada.");
      } }, "+ Data")));
}

/** Logo da marca (imagem pequena guardada na própria marca; os arquivos originais ficam na pasta do Drive). */
function campoLogo(alvo) {
  const arquivo = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml", hidden: true });
  arquivo.addEventListener("change", async () => {
    const f = arquivo.files[0];
    if (!f) return;
    try {
      const logo = await comprimirImagem(f, { maxLado: 400, png: true });
      await gravar(alvo, { logo });
      avisar("Logo salvo.");
    } catch (e) { avisar("Não consegui usar essa imagem: " + e.message, "erro"); }
  });
  const atual = alvo.obj.logo;
  return el("div", { class: "campo-marca campo-logo" },
    el("div", { class: "com-acao" }, el("h3", {}, "Logo"),
      el("div", { class: "tela-acoes" },
        el("label", { class: "botao-link secundario mini" }, atual ? "Trocar logo" : "Enviar logo", arquivo),
        atual ? el("button", { class: "link", onClick: async () => { await gravar(alvo, { logo: "" }); avisar("Logo removido."); } }, "Remover") : null)),
    atual ? el("img", { class: "logo-marca", src: atual, alt: `Logo ${alvo.nome}` })
      : el("p", { class: "subtitulo" }, alvo.herda?.logo ? "Sem logo próprio: usa o do grupo." : "PNG com fundo transparente fica melhor. O arquivo original (vetor) fica na pasta do Drive."));
}

function campoLink(alvo, campo, titulo, explicacao, dica, rotuloAbrir) {
  const chave = `${alvo.col}|${alvo.id}|${campo}`;
  const entrada = el("input", { id: `marca-${campo}`, type: "url", placeholder: herdado(alvo, campo, dica) });
  entrada.value = rascunhos.has(chave) ? rascunhos.get(chave) : (alvo.obj[campo] || "");
  const botao = el("button", { class: "mini", hidden: !rascunhos.has(chave), onClick: async () => {
    rascunhos.delete(chave);
    await gravar(alvo, { [campo]: entrada.value.trim() });
    avisar("Link salvo.");
  } }, "Salvar");
  entrada.addEventListener("input", () => { rascunhos.set(chave, entrada.value); botao.hidden = false; });
  return el("div", { class: "campo-marca" },
    el("div", { class: "com-acao" }, el("h3", {}, titulo), el("div", { class: "tela-acoes" }, botao, linkExterno(alvo.obj[campo] || alvo.herda?.[campo], rotuloAbrir))),
    explicacao ? el("p", { class: "subtitulo" }, explicacao) : null,
    entrada);
}

/* ---------------- Marcas do cliente ---------------- */

export function abrirMarca(clienteId, marca = {}) {
  const editando = !!marca.id;
  return formulario(editando ? `Marca · ${marca.nome}` : "Nova marca", [
    { nome: "nome", rotulo: "Nome da marca", obrigatorio: true, largura: "metade" },
    { nome: "ativo", rotulo: "Marca ativa", tipo: "checkbox", padrao: true }
  ], marca, {
    extras: editando ? [el("button", { type: "button", class: "perigo-texto", onClick: async () => {
      const n = dados.tarefas.filter((t) => t.marcaId === marca.id).length;
      if (!(await confirmar(`Excluir a marca "${marca.nome}"?${n ? ` ${n} post(s)/tarefa(s) dela voltam para a marca principal do cliente.` : ""} Para só esconder, desmarque "Marca ativa".`))) return;
      if (n) await gravarEmLote("tarefas", dados.tarefas.filter((t) => t.marcaId === marca.id).map(({ id, ...t }) => ({ id, ...t, marcaId: "" })));
      await excluir("marcas", marca.id);
      fecharModais();
      avisar("Marca excluída.");
    } }, "Excluir")] : [],
    aoSalvar: async (v) => {
      if (editando) await atualizar("marcas", marca.id, v);
      else {
        const nova = await criar("marcas", { ...v, clienteId, paleta: [], criadoEm: Date.now() });
        // Abre a ficha na marca nova (o cliente vira grupo, se ainda não era)
        if (nova?.id && location.hash.startsWith(`#/clientes/${clienteId}`)) location.hash = `#/clientes/${clienteId}/marca/${nova.id}`;
      }
      avisar(editando ? "Marca salva." : "Marca criada. Preencha a identidade dela abaixo.");
    }
  });
}

const CAMPOS_COPIADOS = ["paleta", "cor", "fontes", "tomDeVoz", "persona", "publico", "diretrizes", "estiloVisual", "identidadeVisual", "linkDrive", "linkCanva", ...CAMPOS_REDES.map(([k]) => k)];

/**
 * Transforma outros clientes em marcas deste (ex.: duas empresas soltas viram marcas de um grupo).
 * Cada cliente escolhido vira uma marca com a identidade dele; posts, tarefas, compromissos, rotinas,
 * lançamentos, contas de anúncio e criativos passam para este cliente; o cliente antigo fica inativo (não é apagado).
 */
export function juntarClientes(c) {
  const outros = dados.clientes.filter((x) => x.id !== c.id && x.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const caixas = outros.map((x) => el("label", { class: "chip-check" }, el("input", { type: "checkbox", value: x.id }), x.nome));
  const status = el("p", { class: "subtitulo" });
  const fechar = abrirModal(`Juntar clientes em ${c.nome}`, el("div", {},
    el("p", {}, "Os clientes marcados viram marcas de ", el("strong", {}, c.nome), ", cada um com a própria identidade (cores, tom de voz, persona…). Posts, tarefas, compromissos, rotinas, lançamentos, contas de anúncio e criativos passam para cá. O cliente antigo fica inativo, não é apagado."),
    el("p", { class: "subtitulo" }, "Se o grupo já tem uma marca com o mesmo nome (ex.: o cliente \"Exemplo\" e a marca Exemplo), tudo vai para essa marca, sem duplicar. O contrato (mensalidade) do cliente antigo só é copiado se este cliente ainda não tiver um."),
    el("div", { class: "multi" }, caixas),
    status,
    el("div", { class: "acoes" },
      el("button", { class: "negar", onClick: () => fechar() }, "Cancelar"),
      el("button", { class: "confirmar", onClick: async (e) => {
        const ids = caixas.map((l) => l.querySelector("input")).filter((i) => i.checked).map((i) => i.value);
        if (!ids.length) { avisar("Marque pelo menos um cliente.", "erro"); return; }
        const botao = e.currentTarget;
        botao.disabled = true;
        try {
          for (const id of ids) await juntarUm(c, porId("clientes", id), (msg) => (status.textContent = msg));
          fechar();
          avisar(`${ids.length} cliente(s) agora são marcas de ${c.nome}.`);
        } catch (erro) {
          console.error(erro);
          status.textContent = "";
          avisar("Parou no meio: " + erro.message + " Rode de novo para terminar (o que já foi movido não duplica).", "erro");
          botao.disabled = false;
        }
      } }, "Juntar"))), { largo: true });
}

/**
 * O cliente "origem" vira marca do "destino". Se o grupo já tem uma marca com o mesmo nome (ou a indicada em
 * marcaExistente), junta nela (sem duplicar) e só completa os campos de identidade que estiverem vazios.
 */
export async function juntarUm(destino, origem, progresso, marcaExistente) {
  if (destino.id === origem.id) throw new Error(`${origem.nome} não pode virar marca dele mesmo.`);
  const chaveNome = (s) => normalizar(s).replace(/[^a-z0-9]/g, "");
  const existente = marcaExistente || (dados.marcas || []).find((m) => m.clienteId === destino.id && chaveNome(m.nome) === chaveNome(origem.nome));
  const marcaId = existente?.id || `m-${origem.id}`;
  progresso(`${origem.nome}: ${existente ? "juntando na marca " + existente.nome : "criando a marca"}…`);
  if (existente) {
    const completar = { origemClienteId: origem.id };
    for (const k of CAMPOS_COPIADOS) {
      const vazio = existente[k] == null || existente[k] === "" || (Array.isArray(existente[k]) && !existente[k].filter(Boolean).length);
      if (vazio && origem[k] != null && origem[k] !== "" && (!Array.isArray(origem[k]) || origem[k].length)) completar[k] = origem[k];
    }
    await atualizar("marcas", marcaId, completar);
  } else {
    const marca = { clienteId: destino.id, nome: origem.nome, origemClienteId: origem.id, ativo: true, criadoEm: Date.now(), descricao: origem.descricao || origem.observacoes || "" };
    for (const k of CAMPOS_COPIADOS) if (origem[k] != null && origem[k] !== "") marca[k] = origem[k];
    marca.paleta ||= origem.cor ? [origem.cor] : [];
    await salvarComId("marcas", marcaId, marca);
  }

  progresso(`${origem.nome}: movendo posts e tarefas…`);
  const mover = (lista, extra = {}) => lista.filter((x) => x.clienteId === origem.id).map(({ id, ...x }) => ({ id, ...x, clienteId: destino.id, ...extra }));
  await gravarEmLote("tarefas", mover(dados.tarefas, { marcaId }));
  await carregarArquivo();
  await gravarEmLote("tarefasArquivo", mover(dados.tarefasArquivo, { marcaId }));
  await gravarEmLote("compromissos", mover(dados.compromissos));
  if (ehAdmin()) await gravarEmLote("recorrencias", mover(dados.recorrencias));
  if (pode("financeiro")) {
    await gravarEmLote("financeiro", mover(dados.financeiro));
    await gravarEmLote("orcamentos", mover(dados.orcamentos));
    const antigo = porId("contratos", origem.id);
    if (antigo && !contrato(destino.id).mensalidade) {
      const { id: _, ...valores } = antigo;
      await salvarComId("contratos", destino.id, { ...valores, clienteId: destino.id });
    }
  }
  if (pode("trafego")) {
    await gravarEmLote("contasAds", mover(dados.contasAds, { marcaId }));
    await gravarEmLote("manutencoes", mover(dados.manutencoes, { marcaId }));
  }
  if (pode("conteudo")) {
    progresso(`${origem.nome}: copiando criativos…`);
    const artes = await listarSub(caminhoArtes(origem.id)).catch(() => []);
    for (const { id, ...a } of artes) await salvarSub(caminhoArtes(destino.id), { ...a, marcaId }, id);
  }
  await atualizar("clientes", origem.id, { ativo: false, viraMarcaDe: destino.id, marcaId });
  return marcaId;
}

/**
 * O contrário de juntar: a marca sai do grupo e vira um cliente próprio (ex.: tem contrato separado).
 * Se a marca veio de um cliente que foi juntado, reativa esse cliente; senão cria um novo.
 * Posts e tarefas da marca, contas de anúncio, manutenções e criativos vão junto. Contrato e financeiro ficam
 * no grupo (o cliente novo recebe o contrato dele depois, na aba Marca).
 */
export async function separarMarca(grupo, marca, progresso = () => {}) {
  const antigo = marca.origemClienteId ? porId("clientes", marca.origemClienteId) : null;
  const id = antigo?.id || `cli-${marca.id}`;
  const identidadeMarca = {};
  for (const k of [...CAMPOS_COPIADOS, "logo", "descricao"]) if (marca[k] != null && marca[k] !== "") identidadeMarca[k] = marca[k];
  progresso(`${marca.nome}: ${antigo ? "reativando o cliente" : "criando o cliente"}…`);
  if (antigo) await atualizar("clientes", id, { ...identidadeMarca, nome: marca.nome, ativo: true, viraMarcaDe: "", marcaId: "" });
  else await salvarComId("clientes", id, {
    nome: marca.nome, ativo: true, servicos: grupo.servicos || [], segmento: grupo.segmento || "", paleta: [], cor: "",
    observacoes: marca.descricao || "", criadoEm: Date.now(), separadoDe: grupo.id, ...identidadeMarca
  });

  progresso(`${marca.nome}: movendo posts e tarefas…`);
  const mover = (lista) => lista.filter((x) => x.clienteId === grupo.id && x.marcaId === marca.id)
    .map(({ id: i, arquivada, ...x }) => ({ id: i, ...x, clienteId: id, marcaId: "" }));
  const tarefas = mover(dados.tarefas);
  await gravarEmLote("tarefas", tarefas);
  await carregarArquivo();
  const arquivo = mover(dados.tarefasArquivo);
  await gravarEmLote("tarefasArquivo", arquivo);
  if (pode("trafego")) {
    await gravarEmLote("contasAds", mover(dados.contasAds));
    await gravarEmLote("manutencoes", mover(dados.manutencoes));
  }
  if (pode("conteudo")) {
    progresso(`${marca.nome}: movendo criativos…`);
    const ids = new Set([...tarefas, ...arquivo].map((t) => t.id));
    const artes = (await listarSub(caminhoArtes(grupo.id)).catch(() => [])).filter((a) => ids.has(a.tarefaId));
    for (const { id: i, ...a } of artes) { await salvarSub(caminhoArtes(id), { ...a, marcaId: "" }, i); await excluirSub(caminhoArtes(grupo.id), i); }
  }
  await excluir("marcas", marca.id, { lixeira: false });
  return id;
}

/* ---------------- Aba ---------------- */

/**
 * Marca escolhida na ficha. Num grupo a ficha abre já numa marca (ou no geral do grupo), escolhida antes
 * na tela de escolha (`#/clientes/<id>/marca/<marcaId|grupo>`). Retorna { marca (null = o próprio cliente), grupo }.
 */
export function marcaEscolhida(c, estado = {}) {
  const grupo = marcasDo(c.id).length > 0;
  const marca = grupo && estado.marcaSel && estado.marcaSel !== GRUPO ? porId("marcas", estado.marcaSel) : null;
  return { marca, grupo };
}

/**
 * Ajustes pedidos pelos clientes (link de aprovação ou portal) viram aprendizado, com o destino escolhido:
 * regra permanente ("O que evitar"), regra de um formato (diretrizes com [Formato]) ou só a campanha do post.
 */
function blocoAprendizados(c, marca, alvo) {
  const ajustes = ajustesPedidos(c.id, marca?.id || "").slice(0, 6);
  if (!ajustes.length) return null;
  const feito = (botao, texto) => { botao.closest(".destinos-ajuste").replaceChildren(el("span", { class: "subtitulo" }, texto)); avisar(texto); };
  const juntar = (atual, linha) => ((atual || "").trim() ? `${atual.trim()}\n${linha}` : linha);
  return el("details", { class: "aprendizados" },
    el("summary", {}, `O que os clientes pediram para ajustar (${ajustes.length})`),
    el("p", { class: "subtitulo" }, "Se for um padrão, escolha para onde vai: a regra passa a entrar no pedido de copy. Ajuste pontual não precisa virar regra."),
    el("ul", {}, ajustes.map((a) => {
      const campanha = a.post.campanhaId ? porId("campanhas", a.post.campanhaId) : null;
      return el("li", {},
        el("span", {}, el("strong", {}, a.post.titulo), `: "${a.texto}"`),
        el("span", { class: "destinos-ajuste" },
          el("button", { class: "link", onClick: async (e) => { const b = e.currentTarget; await gravar(alvo, { evitar: juntar(alvo.obj.evitar, `- ${a.texto}`) }); feito(b, "Foi para \"O que evitar\"."); } }, "Sempre"),
          a.post.formato ? el("button", { class: "link", onClick: async (e) => { const b = e.currentTarget; await gravar(alvo, { diretrizes: juntar(alvo.obj.diretrizes, `- [${a.post.formato}] ${a.texto}`) }); feito(b, `Foi para as diretrizes, só para ${a.post.formato}.`); } }, `Só em ${a.post.formato}`) : null,
          campanha ? el("button", { class: "link", onClick: async (e) => { const b = e.currentTarget; await atualizar("campanhas", campanha.id, { briefing: juntar(campanha.briefing, `- ${a.texto}`) }); feito(b, `Foi para a campanha ${campanha.nome}.`); } }, "Só nesta campanha") : null));
    })));
}

/**
 * Cadastro e contato do cliente (antes no "Editar" da ficha): no cliente comum e no geral do grupo.
 * Contrato, status e excluir abrem a janela do cliente (o contrato só para quem tem o financeiro).
 */
const CAMPOS_CADASTRO = [["nome", "Nome do cliente"], ["segmento", "Segmento", "Ex.: clínica, academia, escola"], ["contato", "Pessoa de contato"],
  ["whatsapp", "WhatsApp", "(11) 99999-9999"], ["email", "E-mail"]];
function blocoCadastro(c, podeEditar) {
  return quadro("cadastro", "Cadastro e contato", preenchidos(c, ["nome", "segmento", "contato", "whatsapp", "email"]), conteudoCadastro(c, podeEditar));
}
function conteudoCadastro(c, podeEditar) {
  const chave = `cadastro|${c.id}`;
  const valores = rascunhos.get(chave) || Object.fromEntries([...CAMPOS_CADASTRO.map(([k]) => [k, c[k] || ""]), ["observacoes", c.observacoes || ""]]);
  const botao = el("button", { class: "mini", hidden: !rascunhos.has(chave), onClick: async () => {
    if (!valores.nome.trim()) return avisar("O nome do cliente não pode ficar vazio.", "erro");
    rascunhos.delete(chave);
    await atualizar("clientes", c.id, Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v.trim()])));
    avisar("Cadastro salvo.");
  } }, "Salvar");
  const mudou = (k, v) => { valores[k] = v; rascunhos.set(chave, valores); botao.hidden = false; };
  const entrada = (k, rotulo, dica = "") => el("label", { class: "campo" }, el("span", {}, rotulo),
    el("input", { id: `cadastro-${k}`, type: k === "email" ? "email" : "text", value: valores[k], placeholder: dica, disabled: !podeEditar, onInput: (e) => mudou(k, e.target.value) }));
  const obs = el("textarea", { id: "cadastro-observacoes", rows: 2, disabled: !podeEditar, placeholder: "Quem tiver acesso de cliente também lê estas observações.", onInput: (e) => mudou("observacoes", e.target.value) });
  obs.value = valores.observacoes;
  return el("div", { class: "campo-marca cadastro-cliente" },
    el("div", { class: "com-acao" }, el("span", {}),
      el("div", { class: "tela-acoes" }, botao,
        podeEditar ? el("button", { class: "secundario mini", onClick: () => abrirCliente(c) }, pode("financeiro") ? "Contrato, status e excluir…" : "Status e excluir…") : null)),
    el("div", { class: "grade-cadastro" }, CAMPOS_CADASTRO.map(([k, r, d]) => entrada(k, r, d))),
    el("label", { class: "campo" }, el("span", {}, "Observações"), obs));
}

/**
 * Quadros da aba Marca (abrem e fecham como os dos Ajustes). O título mostra quanto está preenchido;
 * os abertos ficam lembrados neste navegador.
 */
const CHAVE_QUADROS = "hyper-marca-abertos";
const quadrosAbertos = () => { try { return JSON.parse(localStorage.getItem(CHAVE_QUADROS) || "[\"cadastro\"]"); } catch { return ["cadastro"]; } };
function quadro(chave, titulo, [feitos, total], ...conteudo) {
  const caixa = el("details", { class: "quadro-marca", dataset: { quadro: chave }, open: quadrosAbertos().includes(chave) || null },
    el("summary", {}, el("h3", {}, titulo),
      total ? el("span", { class: `etiqueta ${feitos >= total ? "ok" : ""}` }, `${feitos} de ${total}`) : null),
    ...conteudo);
  caixa.addEventListener("toggle", () => {
    const lista = quadrosAbertos().filter((n) => n !== chave);
    try { localStorage.setItem(CHAVE_QUADROS, JSON.stringify(caixa.open ? [...lista, chave] : lista)); } catch { /* sem armazenamento */ }
  });
  return caixa;
}
const preenchidos = (obj, campos) => [campos.filter((k) => Array.isArray(obj[k]) ? obj[k].length : String(obj[k] || "").trim()).length, campos.length];

export function abaMarca(c, estado = {}, renderizar = () => {}) {
  // Cliente com marcas = grupo (guarda-chuva): a identidade se configura em cada marca.
  // A identidade do próprio grupo é só para os posts institucionais dele (ex.: avisos, datas comemorativas).
  const podeGerir = ehAdmin() || pode("conteudo");
  const { marca, grupo } = marcaEscolhida(c, estado);
  // Cliente sem marcas: daqui ele pode virar grupo. Num grupo, essas ações ficam na tela de escolha da marca.
  const seletor = !grupo && (podeGerir || ehAdmin()) ? el("div", { class: "marcas-seletor" },
    podeGerir ? el("button", { class: "secundario mini", onClick: async () => { await abrirMarca(c.id); } }, "+ Marca") : null,
    ehAdmin() ? el("button", { class: "link", onClick: () => juntarClientes(c) }, "Juntar outros clientes como marcas…") : null) : null;
  const alvo = alvoDe(c, marca);
  const contar = (mid) => dados.tarefas.filter((t) => t.clienteId === c.id && (t.marcaId || "") === mid).length;

  const podeEditar = ehAdmin() || pode("conteudo") || pode("trafego");
  if (!podeGerir) return el("div", { class: "aba-marca" }, !marca ? blocoCadastro(c, podeEditar) : el("p", { class: "nota" }, `Cadastro, contato e contrato ficam no geral do grupo ${c.nome}.`));
  return el("div", { class: "aba-marca" },
    seletor,
    !grupo ? el("p", { class: "subtitulo" }, "Este cliente tem uma marca só: a identidade é configurada aqui. Se ele tiver outras marcas com identidades diferentes (ex.: uma loja on-line com nome próprio), crie cada uma em \"+ Marca\" e ele vira um grupo: aí cada marca tem a sua identidade.") : null,
    grupo && !marca ? el("p", { class: "faixa-aviso" }, `${c.nome} é um grupo: a identidade de cada marca fica na própria marca. Esta aqui vale para os posts institucionais do grupo (sem marca) e completa o que estiver vazio nas marcas. Preenchida, ela representa o grupo como um todo; o que ficar vazio (sobre, tom de voz, público, persona) o pedido de copy monta com a combinação das marcas.`) : null,
    marca ? el("div", { class: "marca-cabeca" },
      el("div", {},
        el("h3", {}, `${c.nome} · ${marca.nome}`),
        el("p", { class: "subtitulo" }, "Campos vazios usam o que estiver no grupo (institucional). Redes sociais na aba Contas.")),
      el("div", { class: "acoes" },
        podeGerir ? el("button", { class: "secundario mini", onClick: () => abrirMarca(c.id, marca) }, "Editar nome e status") : null,
        ehAdmin() ? el("button", { class: "link", onClick: async (e) => {
          const botao = e.currentTarget;
          if (!(await confirmar(`Tirar ${marca.nome} de ${c.nome} e transformar num cliente próprio? Os ${contar(marca.id)} post(s) e tarefas dela, a identidade (logo, cores, tom de voz…), contas de anúncio e criativos vão junto. O contrato de ${c.nome} continua no grupo; o de ${marca.nome} você preenche depois na aba Marca do cliente novo.`))) return;
          botao.disabled = true;
          try {
            const novo = await separarMarca(c, marca, (msg) => avisar(msg));
            avisar(`${marca.nome} agora é um cliente próprio.`);
            location.hash = `#/clientes/${novo}`;
          } catch (erro) { console.error(erro); avisar("Parou no meio: " + erro.message + " Clique de novo para terminar.", "erro"); botao.disabled = false; }
        } }, "Separar em cliente próprio…") : null)) : null,
    // Para a copy: quanto a ficha está completa e o que os clientes já pediram para ajustar
    el("div", { class: "bloco-ia-marca" },
      medidorMarca(c.id, marca?.id || ""),
      podeGerir ? el("div", { class: "acoes" }, el("button", { class: "secundario mini", onClick: () => abrirImportarBriefing(alvo, c) }, "Importar briefing (JSON)")) : null,
      blocoAprendizados(c, marca, alvo)),
    !marca ? blocoCadastro(c, podeEditar) : el("p", { class: "nota" }, `Cadastro, contato e contrato ficam no geral do grupo ${c.nome}.`),
    quadro("visual", "Visual", preenchidos(alvo.obj, ["logo", "linkDrive", "linkCanva", "paleta", "fontes"]),
      campoLogo(alvo),
      campoLink(alvo, "linkDrive", "Pasta da marca no Drive",
        "Logos, fontes, manual e criativos de referência ficam nesta pasta.",
        "https://drive.google.com/drive/folders/...", "Abrir pasta ↗"),
      campoLink(alvo, "linkCanva", "Brand kit / pasta no Canva", null, "https://www.canva.com/...", "Abrir no Canva ↗"),
      editorCores(alvo),
      campoTexto(alvo, "fontes", "Fontes", "Ex.: Títulos em Playfair Display Bold; textos em Montserrat. (Os arquivos ficam na pasta do Drive.)", 2)),
    quadro("ia", "Para a IA: quem é a marca e como fala", preenchidos(alvo.obj, ["descricao", "tomDeVoz", "persona", "publico", "palavrasChave", "evitar"]),
      campoTexto(alvo, "descricao", "Sobre a marca", "O que é, o que vende, para quem, diferenciais e posicionamento. Se for de um grupo, como se diferencia das outras marcas.", 5),
      campoTexto(alvo, "tomDeVoz", "Tom de voz", "Como a marca fala: próxima, técnica, bem-humorada... palavras que usa e que evita.", 4),
      campoTexto(alvo, "persona", "Persona", "Quem é o cliente ideal: nome fictício, idade, rotina, dores, desejos, objeções.", 5),
      campoTexto(alvo, "publico", "Público-alvo", "Ex.: mulheres 25-45, região de Sorocaba, classe B.", 3),
      campoTexto(alvo, "palavrasChave", "Palavras e expressões da marca", "Termos que a marca usa e quer ver nos textos. Ex.: \"comunidade\", \"treino inteligente\", o nome dos planos.", 2),
      campoTexto(alvo, "evitar", "O que evitar", "Palavras, assuntos e jeitos de falar que a marca não usa. Ex.: gírias, \"barato\", promessas de resultado, comparar com concorrente.", 3)),
    quadro("pilares", "Pilares, datas e diretrizes", preenchidos(alvo.obj, ["pilares", "datas", "diretrizes"]),
      campoTexto(alvo, "pilares", "Pilares de conteúdo", "Um por linha. Ex.: Educativo, Bastidores, Prova social, Oferta. Cada post escolhe um pilar, e o calendário mostra se o mês está equilibrado.", 4),
      campoDatas(alvo),
      campoTexto(alvo, "diretrizes", "Diretrizes de conteúdo",
        "Linha editorial de cada pilar, estrutura das legendas, CTAs, rodapé padrão, hashtags, emojis e séries fixas. Uma regra que vale só para um formato começa com ele entre colchetes, ex.: \"[Vídeo] capa só com o título\" ou \"[E-mail marketing] assinar como equipe\": ela só vai no pedido desse formato.", 8)));
}
