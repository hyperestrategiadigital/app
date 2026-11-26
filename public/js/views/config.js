// Ajustes (só administradores): e-mails automáticos, Meta, manual, menus, checklists e backup.
import { el, confirmar, avisar, hojeISO, vazio, baixar } from "../ui.js";
import { dados, atualizar } from "../db.js";
import { cabecalho } from "./componentes.js";
import { salvarComId, carregarArquivo, listarErros, excluirErro, bancoInfo } from "../db.js";
import { ehAdmin } from "../permissoes.js";
import { configMeta } from "../meta.js";
import { configAgenda, agendaConectada, testarAgenda } from "../agenda.js";
import { MANUAL_PADRAO } from "../manual.js";
import { MODELOS_PADRAO, FORMATOS, TIPOS_TAREFA, TIPO_CONTEUDO, REDES, TIPOS_FIXOS, ANTECEDENCIA, LISTAS_PADRAO, antecedenciaDe } from "../constantes.js";
import { configEmail, emailAtivo, conectarEmail, testarEmail, desconectarEmail, backupAgora, resumoAgora } from "../emails.js";

async function baixarBackup() {
  await carregarArquivo(); // inclui as tarefas arquivadas
  baixar(new Blob([JSON.stringify({ exportadoEm: new Date().toISOString(), ...dados }, null, 2)], { type: "application/json" }), `hyper-backup-${hojeISO()}.json`);
}

/**
 * Cada quadro dos Ajustes recolhe (fechado por padrão). O que fica aberto é lembrado neste navegador.
 */
const CHAVE_ABERTOS = "hyper-ajustes-abertos";
const abertos = () => { try { return JSON.parse(localStorage.getItem(CHAVE_ABERTOS) || "[]"); } catch { return []; } };
function recolhivel(secao) {
  if (!secao) return null;
  const [titulo, ...resto] = secao.children;
  const nome = titulo.textContent;
  const caixa = el("details", { class: "bloco recolhivel", open: abertos().includes(nome) || null },
    el("summary", {}, el("h2", {}, nome)), ...resto);
  caixa.addEventListener("toggle", () => {
    const lista = abertos().filter((n) => n !== nome);
    try { localStorage.setItem(CHAVE_ABERTOS, JSON.stringify(caixa.open ? [...lista, nome] : lista)); } catch { /* sem armazenamento */ }
  });
  return caixa;
}

export function render() {
  return el("div", { class: "tela" },
    cabecalho("Ajustes", "E-mails automáticos, manual de escrita, menus e backup. Sua Google Agenda fica em Minha conta (clique no seu nome)."),

    ...[blocoEmail(),
    blocoMeta(),
    blocoManual(),
    ehAdmin() ? blocoListas() : null,
    blocoModelos(),
    blocoErros(),

    ehAdmin() ? el("section", { class: "bloco" },
      el("h2", {}, "Backup"),
      el("p", {}, `${dados.tarefas.length} tarefas · ${dados.clientes.length} clientes · ${dados.compromissos.length} compromissos · ${dados.financeiro.length} lançamentos`),
      el("button", { class: "secundario", onClick: baixarBackup }, "Baixar backup (.json)"),
      el("p", { class: "nota" }, `Banco do Firestore em uso: ${bancoInfo.id || "(default)"}.`)) : null].map(recolhivel));
}

/** E-mails e automações pelo Google Apps Script da conta da Hyper (docs/email). */
function blocoEmail() {
  const cfg = configEmail();
  const backup = dados.config.find((c) => c.id === "backup") || {};
  const url = el("input", { id: "email-url", type: "url", placeholder: "https://script.google.com/macros/s/.../exec", value: cfg.url || "" });
  const pasta = "https://github.com/hyperestrategiadigital/app/blob/main/docs/email/";
  const kb = (n) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  const acao = (rotulo, fn) => el("button", { class: "secundario", onClick: async (e) => {
    e.currentTarget.disabled = true;
    try { avisar(await fn()); } catch (erro) { avisar(erro.message, "erro"); }
    e.currentTarget.disabled = false;
  } }, rotulo);
  return el("section", { class: "bloco" },
    el("h2", {}, "E-mails e automações"),
    emailAtivo()
      ? el("p", {}, el("span", { class: "etiqueta ok" }, "Conectado"), ` Rodando na conta ${cfg.conta || "da Hyper"}: convites, acesso liberado, avisos de pedidos e menções, resumo diário às 8h para cada pessoa, backup toda segunda às 3h e Google Agenda dos compromissos (a cada 5 minutos, com convite para os participantes).`)
      : el("p", {}, "Instale uma vez o script de automações na conta Google da Hyper. Ele manda os e-mails pelo Gmail dela (até 100 por dia, sem custo), envia o resumo diário às 8h, faz o backup semanal no Drive da Hyper e coloca os compromissos na Google Agenda de cada participante (sem precisar do Google Cloud)."),
    emailAtivo() ? el("p", { class: "subtitulo" }, backup.ultimo
      ? ["Último backup: ", new Date(backup.ultimo).toLocaleString("pt-BR"), ` (${kb(backup.tamanho || 0)}, compactado, sem imagens; ficam os ${backup.guardados || 8} mais recentes). `, el("a", { href: backup.pasta, target: "_blank", rel: "noopener" }, "Abrir a pasta no Drive ↗")]
      : "Backup automático: o primeiro sai na próxima segunda às 3h (ou clique em Fazer backup agora).") : null,
    emailAtivo() ? el("p", { class: "subtitulo" }, agendaConectada()
      ? `Google Agenda: funcionando (última sincronização ${new Date(configAgenda().ultimo).toLocaleString("pt-BR")}, agenda "${configAgenda().calendario || "Hyper · Compromissos"}").`
      : el("span", { class: "erro" }, "Google Agenda: ainda não sincronizou. Clique em Testar agenda para ver o que falta.")) : null,
    el("details", { class: "passo-a-passo", open: !emailAtivo() },
      el("summary", {}, emailAtivo() ? "Como instalar ou atualizar o script" : "Como instalar (5 minutos)"),
      el("ol", { class: "passos" },
        el("li", {}, "Logado na conta da Hyper, abra ", el("a", { href: "https://script.google.com/home/projects/create", target: "_blank", rel: "noopener" }, "script.google.com → Novo projeto"), "."),
        el("li", {}, "Engrenagem (Configurações do projeto) → marque \"Mostrar o arquivo de manifesto appsscript.json\"."),
        el("li", {}, "Volte ao editor, abra appsscript.json e troque tudo pelo conteúdo de ", el("a", { href: pasta + "appsscript.json", target: "_blank", rel: "noopener" }, "appsscript.json"), "."),
        el("li", {}, "Abra Código.gs, apague tudo e cole ", el("a", { href: pasta + "Codigo.gs", target: "_blank", rel: "noopener" }, "Codigo.gs"), " (botão Copiar). Salve (Ctrl+S)."),
        el("li", {}, "Implantar → Nova implantação → engrenagem → App da Web. Executar como: Eu. Quem pode acessar: Qualquer pessoa. Implantar e autorize com a conta da Hyper (se aparecer \"app não verificado\": Avançado → Acessar)."),
        el("li", {}, "Copie a URL do app da Web, cole aqui embaixo e clique em Conectar."),
        el("li", {}, "Para atualizar depois: troque appsscript.json e Código.gs pelo conteúdo novo, salve, Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar. Se o Google pedir, autorize de novo (a agenda é uma permissão nova). Depois clique em Conectar de novo aqui."))),
    el("label", { class: "campo", for: "email-url" }, el("span", {}, "URL do app da Web"), url),
    el("div", { class: "acoes" },
      el("button", { class: emailAtivo() ? "secundario" : "destaque", onClick: async (e) => {
        e.currentTarget.disabled = true;
        try { const conta = await conectarEmail(url.value); avisar(`Automações conectadas${conta ? ` (${conta})` : ""}.`); }
        catch (erro) { avisar(erro.message, "erro"); e.currentTarget.disabled = false; }
      } }, emailAtivo() ? "Conectar de novo" : "Conectar"),
      emailAtivo() ? acao("E-mail de teste", async () => { const r = await testarEmail(); return `E-mail de teste enviado para você. Restam ${r.restantes ?? "?"} envios hoje.`; }) : null,
      emailAtivo() ? acao("Meu resumo agora", async () => { await resumoAgora(); return "Resumo do dia enviado para o seu e-mail."; }) : null,
      emailAtivo() ? acao("Testar agenda", async () => { const r = await testarAgenda(); return r.ja ? "A agenda acabou de sincronizar." : `Agenda sincronizada: ${r.criados || 0} criado(s), ${r.atualizados || 0} atualizado(s), ${r.removidos || 0} removido(s)${r.erros ? `, ${r.erros} com erro (veja no compromisso)` : ""}.`; }) : null,
      emailAtivo() ? acao("Fazer backup agora", async () => { const r = await backupAgora(); return `Backup feito (${kb(r.tamanho || 0)}).`; }) : null,
      emailAtivo() ? el("button", { class: "perigo-texto", onClick: async () => {
        if (await confirmar("Desligar os e-mails e automações?")) { await desconectarEmail(); avisar("Desligado."); }
      } }, "Desligar") : null));
}

/** Erros que aconteceram com alguém da equipe (para diagnosticar sem depender de print). */
function blocoErros() {
  const lista = el("div", { class: "lista-erros" });
  let erros = [];
  const fmt = (e) => `${new Date(e.em).toLocaleString("pt-BR")} · ${e.email || "?"} · ${e.rota || "-"}\n${e.msg}${e.detalhe ? `\n${e.detalhe}` : ""}`;
  const carregar = async (botao) => {
    botao.disabled = true;
    try {
      erros = await listarErros();
      lista.replaceChildren(...(erros.length ? [
        el("div", { class: "acoes" },
          el("button", { class: "secundario mini", onClick: async () => { await navigator.clipboard.writeText(erros.map(fmt).join("\n\n")).catch(() => {}); avisar("Copiado. Cole na conversa com o Claude."); } }, "Copiar todos para o Claude"),
          el("button", { class: "perigo-texto", onClick: async () => { for (const e of erros) await excluirErro(e.id); lista.replaceChildren(el("p", { class: "subtitulo" }, "Lista limpa.")); } }, "Limpar lista")),
        ...erros.slice(0, 50).map((e) => el("details", { class: "erro-item" },
          el("summary", {}, el("strong", {}, e.msg.slice(0, 120)), el("span", { class: "subtitulo" }, ` · ${e.email || "?"} · ${new Date(e.em).toLocaleString("pt-BR")}`)),
          el("pre", {}, fmt(e))))
      ] : [el("p", { class: "subtitulo" }, "Nenhum erro registrado nos últimos 30 dias. 🎉")]));
    } catch (erro) { avisar(erro.message, "erro"); }
    botao.disabled = false;
  };
  return el("section", { class: "bloco" },
    el("h2", {}, "Erros recentes"),
    el("p", {}, "Quando algo dá errado para alguém da equipe, o app guarda o erro aqui por 30 dias. Se algo estranho acontecer, copie e mande para o Claude."),
    el("button", { class: "secundario", onClick: (e) => carregar(e.currentTarget) }, "Ver erros"),
    lista);
}

/** Modelos de checklist por formato de post e por tipo de tarefa (um passo por linha). */
/** Manual de escrita da Hyper: entra em todos os pedidos de texto para a IA (ia.js). Só administrador edita. */
function blocoManual() {
  const salvo = dados.config.find((c) => c.id === "manual")?.texto || "";
  const area = el("textarea", { rows: 18, id: "manual-hyper", readOnly: !ehAdmin() }, salvo || MANUAL_PADRAO);
  return el("section", { class: "bloco" },
    el("h2", {}, "Manual de escrita da Hyper"),
    el("p", {}, "O jeito Hyper de escrever. Vai junto em todos os pedidos de copy e de texto para a IA, de qualquer formato e de qualquer marca. As diretrizes de cada marca valem mais do que ele."),
    el("details", {}, el("summary", {}, ehAdmin() ? "Ver e editar o manual" : "Ver o manual"),
      area,
      ehAdmin() ? el("div", { class: "acoes" },
        el("button", { type: "button", class: "link", onClick: () => { area.value = MANUAL_PADRAO; } }, "Voltar ao texto padrão"),
        el("span", { class: "espaco" }),
        el("button", { class: "confirmar", onClick: async () => {
          await salvarComId("config", "manual", { texto: area.value.trim() === MANUAL_PADRAO.trim() ? "" : area.value.trim(), atualizadoEm: Date.now() });
          avisar("Manual salvo. Os próximos pedidos já usam esta versão.");
        } }, "Salvar manual")) : null));
}

/**
 * Menus e listas: tipos de tarefa, formatos de post (com os dias de antecedência da produção) e redes.
 * Fica em config/listas; o que sair da lista continua aparecendo nos itens que já usam.
 */
function blocoListas() {
  const editor = (titulo, inicial, { fixos = [], comDias = false, dica = "" } = {}) => {
    let itens = [...inicial];
    const dias = { ...ANTECEDENCIA };
    const lista = el("ul", { class: "lista-editavel" });
    const novo = el("input", { type: "text", placeholder: "Novo item", "aria-label": `Novo item em ${titulo}` });
    const desenhar = () => lista.replaceChildren(...itens.map((item, i) => el("li", {},
      el("span", { class: "lista-editavel-nome" }, item, fixos.includes(item) ? el("small", { class: "subtitulo" }, " (fixo)") : null),
      comDias ? el("label", { class: "dias-antecedencia", title: "Dias antes da publicação para o prazo de produção" },
        el("input", { type: "number", min: 0, max: 30, value: dias[item] ?? antecedenciaDe(item), "aria-label": `Dias de antecedência de ${item}`,
          onInput: (e) => { dias[item] = Number(e.target.value) || 0; } }), " dia(s) antes") : null,
      el("button", { type: "button", class: "icone", "aria-label": `Subir ${item}`, disabled: i === 0, onClick: () => { [itens[i - 1], itens[i]] = [itens[i], itens[i - 1]]; desenhar(); } }, "↑"),
      el("button", { type: "button", class: "icone", "aria-label": `Descer ${item}`, disabled: i === itens.length - 1, onClick: () => { [itens[i + 1], itens[i]] = [itens[i], itens[i + 1]]; desenhar(); } }, "↓"),
      fixos.includes(item) ? el("span", { class: "icone" }) : el("button", { type: "button", class: "icone", "aria-label": `Tirar ${item}`, onClick: () => { itens.splice(i, 1); desenhar(); } }, "✕"))));
    const adicionar = () => {
      const v = novo.value.trim();
      if (!v) return;
      if (itens.some((x) => x.toLowerCase() === v.toLowerCase())) { avisar(`"${v}" já está na lista.`, "erro"); return; }
      itens.push(v); novo.value = ""; desenhar(); novo.focus();
    };
    novo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } });
    desenhar();
    return {
      elemento: el("div", { class: "editor-lista" }, el("h3", {}, titulo), dica ? el("p", { class: "subtitulo" }, dica) : null, lista,
        el("div", { class: "linha-adicionar" }, novo, el("button", { type: "button", class: "secundario mini", onClick: adicionar }, "+ Adicionar"))),
      ler: () => itens,
      lerDias: () => Object.fromEntries(itens.map((f) => [f, dias[f] ?? antecedenciaDe(f)])),
      restaurar: (padrao) => { itens = [...padrao]; desenhar(); }
    };
  };
  const tipos = editor("Tipos de tarefa", TIPOS_TAREFA, { fixos: TIPOS_FIXOS, dica: "Conteúdo vira post e Reunião vira compromisso, por isso não saem." });
  const formatos = editor("Formatos de post", FORMATOS, { comDias: true, dica: "Os dias definem o prazo de produção do post (ex.: vídeo 3 dias antes da publicação)." });
  const redes = editor("Redes", REDES);
  return el("section", { class: "bloco" },
    el("h2", {}, "Menus e listas"),
    el("p", {}, "As opções dos menus de tipo de tarefa, formato e rede. O que você tirar continua aparecendo nos itens que já usam."),
    el("details", {}, el("summary", {}, "Editar menus"),
      el("div", { class: "grade-listas" }, tipos.elemento, formatos.elemento, redes.elemento),
      el("div", { class: "acoes" },
        el("button", { type: "button", class: "link", onClick: () => { tipos.restaurar(LISTAS_PADRAO.tipos); formatos.restaurar(LISTAS_PADRAO.formatos); redes.restaurar(LISTAS_PADRAO.redes); } }, "Voltar ao padrão"),
        el("span", { class: "espaco" }),
        el("button", { class: "confirmar", onClick: async () => {
          if (!formatos.ler().length || !redes.ler().length) { avisar("Deixe pelo menos um formato e uma rede.", "erro"); return; }
          await salvarComId("config", "listas", { tipos: tipos.ler(), formatos: formatos.ler(), redes: redes.ler(), antecedencia: formatos.lerDias(), versao: 2, atualizadoEm: Date.now() });
          avisar("Menus salvos.");
        } }, "Salvar menus"))));
}

function blocoModelos() {
  const meus = dados.config.find((c) => c.id === "modelos")?.modelos || {};
  const chaves = [...FORMATOS.filter((f) => f !== "Outro"), ...TIPOS_TAREFA.filter((t) => ![TIPO_CONTEUDO, "Reunião", "Outro"].includes(t))];
  const areas = {};
  const linhas = chaves.map((k) => {
    const a = el("textarea", { rows: 3, id: `modelo-${k}`, placeholder: "Um passo por linha (vazio = sem checklist)" });
    a.value = (meus[k] ?? MODELOS_PADRAO[k] ?? []).join("\n");
    areas[k] = a;
    return el("label", { class: "campo", for: a.id }, el("span", {}, FORMATOS.includes(k) ? `Post · ${k}` : `Tarefa · ${k}`), a);
  });
  return el("section", { class: "bloco" },
    el("h2", {}, "Modelos de checklist"),
    el("p", {}, "Tarefa ou post novo já nasce com estes passos (pelo formato do post ou pelo tipo da tarefa). Dá para mudar em cada tarefa."),
    el("details", {}, el("summary", {}, "Editar modelos"),
      el("div", { class: "form-grade" }, linhas),
      el("div", { class: "acoes" }, el("button", { onClick: async () => {
        const modelos = Object.fromEntries(Object.entries(areas).map(([k, a]) => [k, a.value.split("\n").map((l) => l.trim()).filter(Boolean)]));
        await salvarComId("config", "modelos", { modelos });
        avisar("Modelos salvos.");
      } }, "Salvar modelos"))));
}

/** App da Meta para os relatórios do Instagram e do Facebook (o App ID não é secreto). */
function blocoMeta() {
  const cfg = configMeta();
  const appId = el("input", { id: "meta-app", type: "text", inputmode: "numeric", placeholder: "Ex.: 1234567890123456", value: cfg.appId || "" });
  const configId = el("input", { id: "meta-config", type: "text", inputmode: "numeric", placeholder: "Ex.: 987654321098765", value: cfg.configId || "" });
  const li = (...c) => el("li", {}, ...c);
  return el("section", { class: "bloco" },
    el("h2", {}, "Relatórios do Instagram e Facebook"),
    cfg.appId ? el("p", {}, el("span", { class: "etiqueta ok" }, "Ligado"), " Cada pessoa conecta o próprio Facebook em Minha conta (ou em Relatórios e no Tráfego pago).")
      : el("p", {}, "Para puxar os números das contas e de cada post, crie uma vez um app gratuito na Meta e cole os IDs aqui."),
    el("details", { class: "passo-a-passo", open: !cfg.appId || !cfg.configId },
      el("summary", {}, "Como configurar o app da Meta (tipo Negócio)"),
      el("ol", { class: "passos" },
        li("Em ", el("a", { href: "https://developers.facebook.com/apps/", target: "_blank", rel: "noopener" }, "developers.facebook.com → Meus apps"), ", abra o app (tipo Negócio) e copie o App ID do topo."),
        li("Produto \"Login do Facebook para Empresas\" → Definições (Settings): deixe Login no OAuth do cliente, Login no OAuth da Web e Login com o SDK do JavaScript em Sim. Em \"Domínios permitidos para o SDK do JavaScript\" e em \"URIs de redirecionamento do OAuth válidos\" coloque ", el("code", {}, location.origin + "/"), ". Salve."),
        li("Se aparecer o aviso \"requires advanced access\": clique em Get Advanced Access e peça o acesso avançado de ", el("code", {}, "public_profile"), " (é automático)."),
        li("Em Configurações do app → Básico: Domínios do app = ", el("code", {}, location.hostname), ". Salve."),
        li("Login do Facebook para Empresas → Configurações (Configurations) → Criar configuração. Nome: Relatórios Hyper. Variação: Login geral. Token: Token de acesso do usuário. Permissões: ",
          el("code", {}, "pages_show_list, pages_read_engagement, read_insights, instagram_basic, instagram_manage_insights, business_management, ads_read"), " (ads_read traz os números dos anúncios no Tráfego pago; se a configuração já existe, edite e acrescente). Crie e copie o ID da configuração."),
        li("Em Funções do app → Funções, adicione como Testadoras as pessoas da equipe que vão ver os relatórios (o app pode ficar em modo de desenvolvimento)."),
        li("Cole o App ID e o ID da configuração aqui embaixo e salve. Depois: Minha conta (clique no seu nome) → Conectar Facebook."))),
    el("div", { class: "form-grade" },
      el("label", { class: "campo metade", for: "meta-app" }, el("span", {}, "App ID"), appId),
      el("label", { class: "campo metade", for: "meta-config" }, el("span", {}, "ID da configuração (Login para Empresas)"), configId)),
    el("div", { class: "acoes" }, el("button", { onClick: async () => {
      const a = appId.value.replace(/\D/g, ""), c = configId.value.replace(/\D/g, "");
      if ((appId.value && !a) || (configId.value && !c)) { avisar("Os IDs têm só números.", "erro"); return; }
      await salvarComId("config", "meta", { appId: a, configId: c });
      avisar(a ? "App da Meta salvo." : "Relatórios desligados.");
    } }, "Salvar")));
}
