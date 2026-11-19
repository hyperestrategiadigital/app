// Aba "Marca" da ficha do cliente. Um cliente pode ter várias marcas (ex.: um grupo com uma marca para cada
// negócio), cada uma com identidade e linguagem próprias.
// A "marca principal" é a identidade do próprio cliente; as demais ficam em `marcas` e, onde um campo
// estiver vazio, usam o do cliente. Alimenta a copy, o prompt de imagem e o pedido de arte no Canva.
import { el, avisar, linkExterno, campoCor, abrirModal, confirmar, formulario, fecharModais, normalizar } from "../ui.js";
import { dados, atualizar, criar, excluir, porId, marcasDo, salvarComId, gravarEmLote, contrato, listarSub, salvarSub, excluirSub, identidade, carregarArquivo } from "../db.js";
import { gerarTexto, temChave } from "../openai.js";
import { ehAdmin, pode } from "../permissoes.js";
import { caminhoArtes, comprimirImagem } from "../arquivos.js";
import { CAMPOS_REDES } from "../constantes.js";

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

/** Pede à IA uma versão melhorada do campo e mostra para você decidir. */
async function sugerirMelhoria(alvo, campo, rotulo, textoAtual, aplicar) {
  if (!temChave()) { avisar("Cadastre a chave da OpenAI em Ajustes para usar as sugestões.", "erro"); return; }
  const fechar = abrirModal(`Sugestão de melhoria · ${rotulo}`, el("p", { class: "subtitulo" }, "Pensando…"));
  const c = alvo.herda ? identidade(alvo.herda.id, alvo.id) : alvo.obj;
  const contexto = [
    alvo.herda ? `Marca: ${alvo.nome} (do cliente ${alvo.herda.nome}, que tem outras marcas com identidades diferentes)` : `Cliente: ${c.nome}`,
    c.servicos?.length ? `Serviços contratados: ${c.servicos.join(", ")}` : "",
    c.tomDeVoz && campo !== "tomDeVoz" ? `Tom de voz atual: ${c.tomDeVoz}` : "",
    c.persona && campo !== "persona" ? `Persona atual: ${c.persona}` : "",
    c.publico && campo !== "publico" ? `Público atual: ${c.publico}` : "",
    c.estiloVisual && campo !== "estiloVisual" ? `Estilo de imagem atual: ${c.estiloVisual}` : "",
    alvo.obj.descricao ? `Sobre a marca: ${alvo.obj.descricao}` : "",
    c.observacoes ? `Observações: ${c.observacoes}` : ""
  ].filter(Boolean).join("\n");
  try {
    const sugestao = await gerarTexto({
      sistema: "Você é estrategista de marca e social media sênior da Hyper Estratégia Digital, agência brasileira de estratégia digital. Responda em português do Brasil, de forma prática e aplicável. Devolva SOMENTE o texto melhorado do campo pedido, pronto para colar, sem introdução nem comentários. Use tópicos curtos quando ajudar.",
      pedido: `${contexto}\n\nCampo: ${rotulo}\nTexto atual: ${textoAtual || "(vazio)"}\n\nReescreva e melhore esse campo: deixe mais específico, útil para quem cria conteúdo e anúncios, com exemplos concretos (palavras e expressões a usar e a evitar, quando fizer sentido). Mantenha o que já está certo.`
    });
    fechar();
    const area = el("textarea", { rows: 12 });
    area.value = sugestao;
    const f2 = abrirModal(`Sugestão de melhoria · ${rotulo}`, el("div", {},
      el("p", { class: "subtitulo" }, "Edite se quiser e escolha o que fazer. Nada é salvo sem você clicar."),
      area,
      el("div", { class: "acoes" },
        el("button", { class: "secundario", onClick: async () => { await navigator.clipboard.writeText(area.value).catch(() => {}); avisar("Copiado."); } }, "Copiar"),
        el("span", { class: "espaco" }),
        el("button", { class: "secundario", onClick: () => f2() }, "Descartar"),
        el("button", { class: "confirmar", onClick: () => { aplicar(area.value); f2(); } }, "Usar no campo"))), { largo: true });
  } catch (e) {
    fechar();
    avisar("Não consegui gerar a sugestão: " + e.message, "erro");
  }
}

function campoTexto(alvo, campo, rotulo, dica, linhas = 4, { sugestao = false } = {}) {
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
      el("div", { class: "tela-acoes" },
        sugestao ? el("button", { class: "secundario mini", onClick: () => sugerirMelhoria(alvo, campo, rotulo, area.value, (texto) => { area.value = texto; marcar(); }) }, "✨ Sugerir melhoria") : null,
        botao)),
    area);
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
 * no grupo (o cliente novo recebe o contrato dele depois, no Editar).
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

  return el("div", { class: "aba-marca" },
    seletor,
    !grupo ? el("p", { class: "subtitulo" }, "Este cliente tem uma marca só: a identidade é configurada aqui. Se ele tiver outras marcas com identidades diferentes (ex.: uma loja on-line com nome próprio), crie cada uma em \"+ Marca\" e ele vira um grupo: aí cada marca tem a sua identidade.") : null,
    grupo && !marca ? el("p", { class: "faixa-aviso" }, `${c.nome} é um grupo: a identidade de cada marca fica na própria marca. Esta aqui só vale para os posts institucionais do grupo (sem marca) e completa o que estiver vazio nas marcas.`) : null,
    marca ? el("div", { class: "marca-cabeca" },
      el("div", {},
        el("h3", {}, `${c.nome} · ${marca.nome}`),
        el("p", { class: "subtitulo" }, "Campos vazios usam o que estiver no grupo (institucional). Redes sociais na aba Contas.")),
      el("div", { class: "acoes" },
        podeGerir ? el("button", { class: "secundario mini", onClick: () => abrirMarca(c.id, marca) }, "Editar nome e status") : null,
        ehAdmin() ? el("button", { class: "link", onClick: async (e) => {
          const botao = e.currentTarget;
          if (!(await confirmar(`Tirar ${marca.nome} de ${c.nome} e transformar num cliente próprio? Os ${contar(marca.id)} post(s) e tarefas dela, a identidade (logo, cores, tom de voz…), contas de anúncio e criativos vão junto. O contrato de ${c.nome} continua no grupo; o de ${marca.nome} você preenche depois no Editar do cliente novo.`))) return;
          botao.disabled = true;
          try {
            const novo = await separarMarca(c, marca, (msg) => avisar(msg));
            avisar(`${marca.nome} agora é um cliente próprio.`);
            location.hash = `#/clientes/${novo}`;
          } catch (erro) { console.error(erro); avisar("Parou no meio: " + erro.message + " Clique de novo para terminar.", "erro"); botao.disabled = false; }
        } }, "Separar em cliente próprio…") : null)) : null,
    campoLogo(alvo),
    campoLink(alvo, "linkDrive", "Pasta da marca no Drive",
      "Logos, fontes, manual e criativos de referência ficam nesta pasta. O link vai junto no pedido de arte do Canva.",
      "https://drive.google.com/drive/folders/...", "Abrir pasta ↗"),
    campoLink(alvo, "linkCanva", "Brand kit / pasta no Canva", null, "https://www.canva.com/...", "Abrir no Canva ↗"),
    editorCores(alvo),
    campoTexto(alvo, "fontes", "Fontes", "Ex.: Títulos em Playfair Display Bold; textos em Montserrat. (Os arquivos ficam na pasta do Drive.)", 2),
    campoTexto(alvo, "descricao", "Sobre a marca", "O que é, o que vende, para quem, diferenciais e posicionamento. Se for de um grupo, como se diferencia das outras marcas.", 5, { sugestao: true }),
    campoTexto(alvo, "tomDeVoz", "Tom de voz", "Como a marca fala: próxima, técnica, bem-humorada... palavras que usa e que evita.", 4, { sugestao: true }),
    campoTexto(alvo, "persona", "Persona", "Quem é o cliente ideal: nome fictício, idade, rotina, dores, desejos, objeções.", 5, { sugestao: true }),
    campoTexto(alvo, "publico", "Público-alvo", "Ex.: mulheres 25-45, região de Sorocaba, classe B.", 3, { sugestao: true }),
    campoTexto(alvo, "diretrizes", "Diretrizes de conteúdo",
      "Pilares e linha editorial, estrutura das legendas, CTAs, rodapé padrão, hashtags, emojis, séries fixas e o que nunca fazer. É o que a IA segue em cada post.", 8, { sugestao: true }),
    campoTexto(alvo, "estiloVisual", "Estilo de imagem",
      "Que tipo de imagem a marca usa? Ex.: fotos reais de pessoas treinando, luz natural, cores vibrantes. Evitar: banco de imagem genérico.", 4, { sugestao: true }),
    campoTexto(alvo, "identidadeVisual", "Identidade visual (diagramação)",
      "Ex.: títulos grandes em caixa alta, muito respiro, elementos geométricos, logo sempre no canto inferior.", 3, { sugestao: true }));
}
