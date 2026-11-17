// Ajustes: tarefas recorrentes, importação da planilha e backup.
import { el, formulario, confirmar, avisar, abrirModal, hojeISO, addDias, vazio, normalizar } from "../ui.js";
import { dados, criar, atualizar, excluir, gravarEmLote, novoId, opcoesClientes, nomeCliente, clientesAtivos } from "../db.js";
import { cabecalho } from "./componentes.js";
import { analisarPlanilha } from "../importacao.js";
import { configOpenAI, salvarConfigOpenAI, MODELO_PADRAO, MODELO_TEXTO_PADRAO } from "../openai.js";
import { configAgenda, conectarAgenda, desconectarAgenda, configEquipe, sincronizar } from "../agenda.js";
import { salvarComId } from "../db.js";
import { ehAdmin } from "../permissoes.js";


function abrirImportacao() {
  const entrada = el("input", { type: "file", accept: ".csv,text/csv,text/plain" });
  const area = el("div", { class: "importacao-previa" });
  let analise = null;

  entrada.addEventListener("change", async () => {
    const arquivo = entrada.files[0];
    if (!arquivo) return;
    analise = analisarPlanilha(await arquivo.text());
    if (!analise.tarefas.length) { area.replaceChildren(el("p", { class: "erro" }, "Não encontrei tarefas nesse arquivo. Baixe a aba \"Área de Trabalho\" como CSV.")); return; }
    const porStatus = (s) => analise.tarefas.filter((t) => t.status === s).length;
    const corrigidos = analise.nomes.filter((n) => n.original !== n.canonico);
    const clientesNovos = [...new Set(analise.tarefas.map((t) => t.cliente).filter(Boolean))]
      .filter((n) => !dados.clientes.some((c) => normalizar(c.nome) === normalizar(n)));
    area.replaceChildren(el("div", {},
      el("p", {}, el("strong", {}, `${analise.tarefas.length} tarefas encontradas: `),
        `${porStatus("a_fazer")} a fazer, ${porStatus("andamento")} em andamento, ${porStatus("concluido")} concluídas.`),
      el("p", {}, `${analise.tarefas.filter((t) => t.checklist.length).length} tarefas com várias entregas viraram checklist.`),
      corrigidos.length ? [el("p", {}, el("strong", {}, "Nomes de cliente corrigidos:")),
        el("ul", {}, corrigidos.map((n) => el("li", {}, `"${n.original}" → ${n.canonico} (${n.qtd})`)))] : null,
      clientesNovos.length ? el("p", {}, el("strong", {}, `${clientesNovos.length} clientes serão criados: `), clientesNovos.join(", ")) : null,
      el("p", { class: "subtitulo" }, "Importar de novo o mesmo arquivo não duplica tarefas."),
      botaoImportar));
  });

  const botaoImportar = el("button", {
    class: "destaque", onClick: async () => {
      botaoImportar.disabled = true;
      try {
        // 1) Clientes
        const mapa = Object.fromEntries(dados.clientes.map((c) => [normalizar(c.nome), c.id]));
        const cores = ["#4E2CA3", "#592C85", "#16626A", "#606060", "#C98A00", "#2D6CDF", "#B4415A", "#2E8B57"];
        let i = dados.clientes.length;
        const novosClientes = [];
        for (const nome of [...new Set(analise.tarefas.map((t) => t.cliente).filter(Boolean))]) {
          if (mapa[normalizar(nome)]) continue;
          const qtd = analise.tarefas.filter((t) => t.cliente === nome).length;
          const recente = analise.tarefas.some((t) => t.cliente === nome && t.prazo >= addDias(hojeISO(), -90));
          const id = novoId("clientes");
          novosClientes.push({ id, nome, cor: cores[i++ % cores.length], ativo: recente || qtd > 5, servicos: [], criadoEm: Date.now() });
          mapa[normalizar(nome)] = id;
        }
        botaoImportar.textContent = `Criando ${novosClientes.length} clientes...`;
        if (novosClientes.length) await gravarEmLote("clientes", novosClientes);
        // 2) Tarefas
        const itens = analise.tarefas.map(({ cliente, ...t }) => ({ ...t, clienteId: mapa[normalizar(cliente)] || "", criadoEm: Date.now() }));
        await gravarEmLote("tarefas", itens, (feitas, total) => { botaoImportar.textContent = `Importando ${feitas}/${total}...`; });
        avisar(`Importação concluída: ${itens.length} tarefas.`);
        fechar();
        location.hash = "#/clientes";
      } catch (e) {
        console.error(e);
        avisar("Erro ao importar: " + e.message, "erro");
        botaoImportar.disabled = false;
        botaoImportar.textContent = "Importar";
      }
    }
  }, "Importar");

  const fechar = abrirModal("Importar planilha Fluxo de Trabalho", el("div", {},
    el("ol", { class: "passos" },
      el("li", {}, "Abra a planilha no Google Sheets."),
      el("li", {}, "Vá em Arquivo → Fazer download → Valores separados por vírgula (.csv)."),
      el("li", {}, "Escolha o arquivo baixado aqui embaixo e confira o resumo.")),
    entrada, area), { largo: true });
}

function baixarBackup() {
  const blob = new Blob([JSON.stringify({ exportadoEm: new Date().toISOString(), ...dados }, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `hyper-backup-${hojeISO()}.json` });
  document.body.append(a); a.click(); a.remove();
}

export function render() {
  return el("div", { class: "tela" },
    cabecalho("Ajustes", ehAdmin() ? "Agenda, equipe, OpenAI, importação e backup" : "Sua Google Agenda"),

    blocoAgenda(),
    ehAdmin() ? blocoEquipe() : null,
    ehAdmin() ? blocoOpenAI() : null,

    ehAdmin() ? blocoImportarMarcas() : null,

    ehAdmin() ? el("section", { class: "bloco" },
      el("h2", {}, "Importar planilha"),
      el("p", {}, "Traga o histórico da planilha Fluxo de Trabalho: clientes, tarefas e entregas."),
      el("button", { onClick: abrirImportacao }, "Importar CSV da planilha")) : null,

    ehAdmin() ? el("section", { class: "bloco" },
      el("h2", {}, "Backup"),
      el("p", {}, `${dados.tarefas.length} tarefas · ${dados.clientes.length} clientes · ${dados.compromissos.length} compromissos · ${dados.financeiro.length} lançamentos`),
      el("button", { class: "secundario", onClick: baixarBackup }, "Baixar backup (.json)")) : null);
}

function blocoOpenAI() {
  const cfg = configOpenAI();
  const chave = el("input", { id: "openai-chave", type: "password", placeholder: cfg.chave ? "•••••••• (já cadastrada — cole outra para trocar)" : "sk-...", autocomplete: "off" });
  const modelo = el("input", { id: "openai-modelo", type: "text", value: cfg.modelo || MODELO_PADRAO });
  const modeloTexto = el("input", { id: "openai-modelo-texto", type: "text", value: cfg.modeloTexto || MODELO_TEXTO_PADRAO });
  return el("section", { class: "bloco" },
    el("h2", {}, "OpenAI (imagens e sugestões de melhoria)"),
    el("p", {}, cfg.chave ? `✓ Chave cadastrada (termina em ${cfg.chave.slice(-4)}).` : "Cole a chave da API da OpenAI para gerar imagens no menu Criar."),
    el("ol", { class: "passos" },
      el("li", {}, "Acesse platform.openai.com → API keys → Create new secret key."),
      el("li", {}, "Adicione saldo em Billing (cada imagem custa alguns centavos de dólar)."),
      el("li", {}, "Cole a chave aqui e salve.")),
    el("div", { class: "form-grade" },
      el("label", { class: "campo metade", for: "openai-chave" }, el("span", {}, "Chave da API"), chave),
      el("label", { class: "campo metade", for: "openai-modelo" }, el("span", {}, "Modelo de imagem"), modelo),
      el("label", { class: "campo metade", for: "openai-modelo-texto" }, el("span", {}, "Modelo de texto (sugestões de melhoria)"), modeloTexto)),
    el("p", { class: "subtitulo" }, "A chave fica guardada só na sua conta, protegida pelas regras do banco. Não compartilhe prints desta tela com a chave aparecendo."),
    el("div", { class: "acoes" },
      el("button", { onClick: async () => {
        const nova = chave.value.trim() || cfg.chave;
        if (!nova) { avisar("Cole a chave.", "erro"); return; }
        await salvarConfigOpenAI({ chave: nova, modelo: modelo.value, modeloTexto: modeloTexto.value });
        avisar("Configuração da OpenAI salva.");
      } }, "Salvar"),
      cfg.chave ? el("button", { class: "perigo-texto", onClick: async () => {
        if (await confirmar("Remover a chave da OpenAI?")) { await salvarConfigOpenAI({ chave: "", modelo: modelo.value, modeloTexto: modeloTexto.value }); avisar("Chave removida."); }
      } }, "Remover chave") : null));
}

function blocoAgenda() {
  const cfg = configAgenda();
  const pendentes = dados.compromissos.filter((c) => c.sincronizar && !c.googleEventId);
  const conectar = async (botao) => {
    botao.disabled = true;
    try { const email = await conectarAgenda(); avisar(`Google Agenda conectada: ${email}`); }
    catch (e) { avisar("Não conectou: " + (e.code === "auth/popup-closed-by-user" ? "janela fechada." : e.message), "erro"); botao.disabled = false; }
  };
  return el("section", { class: "bloco" },
    el("h2", {}, "Google Agenda (compromissos)"),
    el("p", {}, cfg.email
      ? ["✓ Conectada à agenda de ", el("strong", {}, cfg.email), ". Compromissos marcados com \"Enviar para a Google Agenda\" vão para lá — posts de conteúdo nunca vão."]
      : "Conecte a sua conta Google pessoal (a do iPhone) para os compromissos aparecerem na sua agenda. Posts de conteúdo nunca vão para lá."),
    el("details", { class: "prompt-final" }, el("summary", {}, "Primeira vez? Ative a API do Google Agenda (1 minuto)"),
      el("ol", { class: "passos" },
        el("li", {}, "Abra ", el("a", { href: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=hyper-9e023", target: "_blank", rel: "noopener" }, "a página da Google Calendar API do projeto hyper-9e023"), " e clique em Ativar."),
        el("li", {}, "Volte aqui e clique em Conectar. Escolha a conta pessoal."),
        el("li", {}, "Se aparecer \"O Google não verificou este app\", clique em Avançado → Acessar hyper-9e023. É o seu próprio app."))),
    el("div", { class: "acoes" },
      cfg.email
        ? [el("button", { class: "secundario", onClick: (e) => conectar(e.currentTarget) }, "Trocar de conta"),
          el("button", { class: "perigo-texto", onClick: async () => { await desconectarAgenda(); avisar("Agenda desconectada."); } }, "Desconectar")]
        : el("button", { onClick: (e) => conectar(e.currentTarget) }, "Conectar Google Agenda"),
      cfg.email && pendentes.length ? el("button", { class: "destaque", onClick: async (e) => {
        e.currentTarget.disabled = true;
        let ok = 0;
        for (const c of pendentes) { try { await sincronizar(c); ok++; } catch (erro) { avisar(erro.message, "erro"); break; } }
        if (ok) avisar(`${ok} compromisso(s) enviado(s) para a agenda.`);
      } }, `Enviar ${pendentes.length} pendente(s)`) : null),
    el("p", { class: "subtitulo" }, "O Google libera o acesso por cerca de 1 hora. Depois disso, ao salvar um compromisso, o app pede para conectar de novo."));
}

function blocoEquipe() {
  const pessoas = (dados.config.find((c) => c.id === "equipe")?.pessoas || []).map((p) => ({ ...p }));
  const lista = el("div", { class: "lista-equipe" });
  const desenhar = () => lista.replaceChildren(...pessoas.map((p, i) => el("div", { class: "pessoa" },
    (() => { const n = el("input", { type: "text", value: p.nome, placeholder: "Nome", "aria-label": "Nome" }); n.addEventListener("input", () => (p.nome = n.value)); return n; })(),
    (() => { const e = el("input", { type: "email", value: p.email, placeholder: "email@gmail.com", "aria-label": "E-mail" }); e.addEventListener("input", () => (p.email = e.value)); return e; })(),
    el("button", { class: "icone", "aria-label": "Remover", onClick: () => { pessoas.splice(i, 1); desenhar(); } }, "✕"))));
  desenhar();
  return el("section", { class: "bloco" },
    el("h2", {}, "Equipe sem conta no app"),
    el("p", { class: "subtitulo" }, "Quem tem conta no app já entra na equipe sozinho (menu Usuários). Aqui ficam pessoas sem conta que participam de reuniões ou recebem tarefas — o convite da agenda vai pelo e-mail daqui."),
    lista,
    el("div", { class: "acoes" },
      el("button", { class: "secundario mini", onClick: () => { pessoas.push({ nome: "", email: "" }); desenhar(); } }, "+ Pessoa"),
      el("button", { onClick: async () => {
        const validas = pessoas.map((p) => ({ nome: p.nome.trim(), email: p.email.trim() })).filter((p) => p.nome);
        await salvarComId("config", "equipe", { pessoas: validas });
        avisar("Equipe salva.");
      } }, "Salvar equipe")));
}

const CAMPOS_MARCA = ["tomDeVoz", "persona", "publico", "estiloVisual", "identidadeVisual", "fontes", "observacoes", "instagram", "linkDrive", "paleta"];
const ROTULO_CAMPO = { tomDeVoz: "tom de voz", persona: "persona", publico: "público", estiloVisual: "estilo de imagem", identidadeVisual: "diagramação", fontes: "fontes", observacoes: "observações", instagram: "Instagram", linkDrive: "Drive", paleta: "paleta" };

/** Importa definições de marca (arquivo .json preparado pelo Claude a partir do ChatGPT). */
function blocoImportarMarcas() {
  const entrada = el("input", { type: "file", accept: ".json,application/json" });
  const previa = el("div", { class: "importacao-previa" });
  entrada.addEventListener("change", async () => {
    const arquivo = entrada.files[0];
    if (!arquivo) return;
    let lista;
    try { lista = JSON.parse(await arquivo.text()); if (!Array.isArray(lista)) lista = lista.marcas || lista.clientes || []; }
    catch { previa.replaceChildren(el("p", { class: "erro" }, "Arquivo inválido. Use o .json que o Claude preparou.")); return; }
    const itens = lista.map((m) => {
      const alvo = dados.clientes.find((c) => normalizar(c.nome) === normalizar(m.cliente || m.nome || ""));
      const campos = CAMPOS_MARCA.filter((k) => Array.isArray(m[k]) ? m[k].length : String(m[k] || "").trim());
      return { m, alvo, campos };
    });
    const sobrescrever = el("input", { type: "checkbox", id: "marcas-sobrescrever" });
    previa.replaceChildren(el("div", {},
      el("ul", {}, itens.map(({ m, alvo, campos }) => el("li", {},
        el("strong", {}, m.cliente || m.nome), alvo ? ` → ${alvo.nome}: ` : " → cliente não encontrado (será criado): ",
        campos.map((k) => ROTULO_CAMPO[k]).join(", ") || "nada para importar"))),
      el("label", { class: "check-inline", for: "marcas-sobrescrever" }, sobrescrever, "Substituir o que já está preenchido (sem marcar, só preenche campos vazios)"),
      el("div", { class: "acoes" }, el("button", { class: "destaque", onClick: async (e) => {
        e.currentTarget.disabled = true;
        let n = 0;
        for (const { m, alvo, campos } of itens) {
          const v = {};
          for (const k of campos) if (sobrescrever.checked || !alvo || !(Array.isArray(alvo[k]) ? alvo[k].length : alvo[k])) v[k] = m[k];
          if (v.paleta) v.cor = v.paleta[0];
          if (!Object.keys(v).length) continue;
          if (alvo) await atualizar("clientes", alvo.id, v);
          else await criar("clientes", { nome: m.cliente || m.nome, ativo: true, servicos: [], ...v });
          n++;
        }
        avisar(`${n} cliente(s) atualizado(s). Revise cada um na aba Marca.`);
        previa.replaceChildren();
        entrada.value = "";
      } }, "Importar definições"))));
  });
  return el("section", { class: "bloco" },
    el("h2", {}, "Importar definições de marca"),
    el("p", {}, "Tom de voz, persona, público, identidade e cores de cada cliente, a partir do arquivo .json que o Claude monta com as suas conversas e agentes do ChatGPT."),
    entrada, previa);
}
