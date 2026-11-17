// Calendário de conteúdo: visão do mês com os posts de cada cliente, status de produção,
// agendamento (data e hora) e geração de prompt de copy com o contexto do cliente.
import { el, formulario, confirmar, avisar, hojeISO, addDias, fmtData, vazio } from "../ui.js";
import { dados, criar, atualizar, excluir, porId, opcoesClientes, nomeCliente } from "../db.js";
import { cabecalho, abas, seloCliente } from "./componentes.js";
import { FORMATOS, REDES, STATUS_CONTEUDO, rotuloStatusConteudo } from "../constantes.js";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Monta o prompt de copy com tudo o que sabemos do cliente e da peça. */
function montarPrompt(v) {
  const c = porId("clientes", v.clienteId) || {};
  const linhas = [
    `Você é copywriter da Hyper, agência de tráfego pago e social media. Escreva a copy de um conteúdo para o cliente ${c.nome || "(sem cliente)"}.`,
    "",
    "## Sobre o cliente",
    c.tomDeVoz ? `- Tom de voz: ${c.tomDeVoz}` : "- Tom de voz: não informado (use um tom próximo e profissional)",
    c.publico ? `- Público-alvo: ${c.publico}` : null,
    c.instagram ? `- Instagram: ${c.instagram}` : null,
    c.observacoes ? `- Observações: ${c.observacoes}` : null,
    "",
    "## Sobre a peça",
    `- Tema: ${v.titulo || "(sem tema)"}`,
    `- Formato: ${v.formato || "-"} · Rede: ${v.rede || "-"}`,
    v.data ? `- Publicação: ${fmtData(v.data)}${v.hora ? ` às ${v.hora}` : ""}` : null,
    v.objetivo ? `- Objetivo: ${v.objetivo}` : null,
    v.roteiro ? `- Briefing / roteiro:\n${v.roteiro}` : null,
    "",
    "## O que entregar",
    v.formato === "Carrossel" ? "- Texto de cada lâmina (capa forte + 5 a 8 lâminas + lâmina final com CTA)" : null,
    v.formato === "Reels" || v.formato === "Vídeo" ? "- Gancho dos 3 primeiros segundos e roteiro curto falado" : null,
    v.formato === "WhatsApp" ? "- Mensagem curta para lista de transmissão, com CTA claro" : null,
    "- Legenda pronta para publicar, com chamada para ação",
    v.rede === "Instagram" || v.rede === "TikTok" ? "- 5 a 10 hashtags relevantes" : null,
    "- 3 opções de primeira linha (gancho) para eu escolher",
    "",
    "Escreva em português do Brasil."
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

export function abrirConteudo(conteudo = {}) {
  const editando = !!conteudo.id;
  const lerForm = () => {
    const v = {};
    for (const n of ["titulo", "clienteId", "data", "hora", "formato", "rede", "objetivo", "roteiro"]) v[n] = document.getElementById(`f-${n}`)?.value || "";
    return v;
  };
  const botaoPrompt = el("button", {
    type: "button", class: "secundario",
    onClick: async () => {
      const prompt = montarPrompt(lerForm());
      try { await navigator.clipboard.writeText(prompt); avisar("Prompt copiado! Cole no Claude para gerar a copy."); }
      catch { avisar("Não consegui copiar. Selecione o texto manualmente.", "erro"); }
      window.open("https://claude.ai/new", "_blank", "noopener");
    }
  }, "✨ Gerar copy com o Claude");

  const campos = [
    { nome: "titulo", rotulo: "Tema / título", obrigatorio: true, dica: "Ex.: Black Week — Plano anual" },
    { nome: "clienteId", rotulo: "Cliente", tipo: "select", opcoes: opcoesClientes(), largura: "metade" },
    { nome: "status", rotulo: "Status", tipo: "select", opcoes: STATUS_CONTEUDO, padrao: "ideia", largura: "metade" },
    { nome: "data", rotulo: "Data de publicação", tipo: "date", obrigatorio: true, largura: "metade" },
    { nome: "hora", rotulo: "Horário (agendamento)", tipo: "time", largura: "metade" },
    { nome: "formato", rotulo: "Formato", tipo: "select", opcoes: FORMATOS, padrao: "Estático", largura: "metade" },
    { nome: "rede", rotulo: "Rede", tipo: "select", opcoes: REDES, padrao: "Instagram", largura: "metade" },
    { nome: "objetivo", rotulo: "Objetivo", dica: "Ex.: vender plano anual, gerar leads, engajamento" },
    { nome: "roteiro", rotulo: "Briefing / roteiro", tipo: "textarea", linhas: 4 },
    { nome: "copy", rotulo: "Copy / legenda final", tipo: "textarea", linhas: 6, dica: "Cole aqui a copy aprovada" },
    { nome: "linkCanva", rotulo: "Link do Canva", largura: "metade" },
    { nome: "linkDrive", rotulo: "Link do Drive", largura: "metade" }
  ];
  if (!editando) campos.push({ nome: "criarTarefa", rotulo: "Criar tarefa de produção (prazo 2 dias antes)", tipo: "checkbox", padrao: true });

  return formulario(editando ? "Editar conteúdo" : "Novo conteúdo", campos, conteudo, {
    largo: true,
    extras: [botaoPrompt, editando ? el("button", {
      type: "button", class: "perigo-texto", onClick: async () => {
        if (await confirmar(`Excluir o conteúdo "${conteudo.titulo}"?`)) {
          await excluir("conteudos", conteudo.id);
          document.querySelector(".modal-fundo")?.remove();
        }
      }
    }, "Excluir") : null],
    aoSalvar: async ({ criarTarefa, ...v }) => {
      if (editando) await atualizar("conteudos", conteudo.id, v);
      else {
        await criar("conteudos", v);
        if (criarTarefa) {
          const prazo = addDias(v.data, -2) < hojeISO() ? hojeISO() : addDias(v.data, -2);
          await criar("tarefas", { titulo: `${v.formato} | ${v.titulo} (${fmtData(v.data, true)})`, clienteId: v.clienteId, tipo: "Conteúdo", status: "a_fazer", prazo, checklist: [], linkCanva: v.linkCanva || "", linkDrive: v.linkDrive || "" });
        }
      }
      avisar(editando ? "Conteúdo atualizado." : "Conteúdo criado.");
    }
  });
}

function chip(c) {
  const cli = porId("clientes", c.clienteId);
  return el("button", {
    class: `chip-conteudo st-${c.status}`, style: { "--selo": cli?.cor || "#606060" },
    title: `${nomeCliente(c.clienteId)} · ${c.formato} · ${rotuloStatusConteudo(c.status)}`,
    onClick: (e) => { e.stopPropagation(); abrirConteudo(c); }
  }, c.hora ? el("small", {}, c.hora) : null, `${cli ? cli.nome.split(" ")[0] + ": " : ""}${c.titulo}`);
}

export function render({ estado, renderizar }) {
  estado.mes ??= hojeISO().slice(0, 7);
  estado.modo ??= "mes";
  const [ano, mes] = estado.mes.split("-").map(Number);
  const filtrados = dados.conteudos.filter((c) =>
    (!estado.cliente || c.clienteId === estado.cliente) && (!estado.status || c.status === estado.status));

  const mudarMes = (n) => { const d = new Date(ano, mes - 1 + n, 1); estado.mes = hojeISO(d).slice(0, 7); renderizar(); };
  const set = (k) => (e) => { estado[k] = e.target.value; renderizar(); };

  const doMes = filtrados.filter((c) => c.data?.startsWith(estado.mes));
  const contagem = STATUS_CONTEUDO.map(([s, r]) => [r, doMes.filter((c) => c.status === s).length]).filter(([, n]) => n);

  const filtros = el("div", { class: "filtros" },
    el("div", { class: "navegador-mes" },
      el("button", { class: "icone", "aria-label": "Mês anterior", onClick: () => mudarMes(-1) }, "‹"),
      el("strong", {}, `${MESES[mes - 1]} ${ano}`),
      el("button", { class: "icone", "aria-label": "Próximo mês", onClick: () => mudarMes(1) }, "›"),
      el("button", { class: "secundario mini", onClick: () => { estado.mes = hojeISO().slice(0, 7); renderizar(); } }, "Hoje")),
    el("select", { onChange: set("cliente"), "aria-label": "Cliente" },
      opcoesClientes().map(([v, r]) => el("option", { value: v, selected: v === (estado.cliente || "") }, v ? r : "Todos os clientes"))),
    el("select", { onChange: set("status"), "aria-label": "Status" },
      el("option", { value: "" }, "Todos os status"), STATUS_CONTEUDO.map(([v, r]) => el("option", { value: v, selected: v === estado.status }, r))),
    abas([["mes", "Mês"], ["lista", "Lista"]], estado.modo, (m) => { estado.modo = m; renderizar(); }));

  let corpo;
  if (estado.modo === "mes") {
    const primeiro = new Date(ano, mes - 1, 1);
    const inicio = addDias(hojeISO(primeiro), -((primeiro.getDay() + 6) % 7)); // começa na segunda
    const hoje = hojeISO();
    const dias = Array.from({ length: 42 }, (_, i) => addDias(inicio, i));
    const semanas = dias[35].slice(0, 7) === estado.mes ? 6 : 5;
    corpo = el("div", { class: "calendario" },
      ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].map((d) => el("div", { class: "cal-cabeca" }, d)),
      dias.slice(0, semanas * 7).map((d) => {
        const doDia = filtrados.filter((c) => c.data === d).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));
        return el("div", {
          class: `cal-dia ${d.slice(0, 7) !== estado.mes ? "fora" : ""} ${d === hoje ? "hoje" : ""}`,
          onClick: () => abrirConteudo({ data: d, clienteId: estado.cliente || "" })
        }, el("span", { class: "cal-num" }, Number(d.slice(8))), doDia.map(chip));
      }));
  } else {
    const ordenados = [...doMes].sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")));
    corpo = el("div", { class: "lista" }, ordenados.length ? ordenados.map((c) =>
      el("div", { class: "linha-tabela", onClick: () => abrirConteudo(c) },
        el("span", { class: "data-mini" }, `${fmtData(c.data, true)}${c.hora ? " " + c.hora : ""}`),
        el("strong", {}, c.titulo), seloCliente(c.clienteId),
        el("span", { class: "etiqueta" }, `${c.formato} · ${c.rede}`),
        el("span", { class: `etiqueta st-${c.status}` }, rotuloStatusConteudo(c.status)),
        c.copy ? el("span", { class: "etiqueta ok" }, "copy ✓") : el("span", { class: "etiqueta" }, "sem copy")))
      : vazio("Nenhum conteúdo neste mês."));
  }

  return el("div", { class: "tela" },
    cabecalho("Calendário de conteúdo",
      contagem.length ? contagem.map(([r, n]) => `${n} ${r.toLowerCase()}`).join(" · ") : "Clique em um dia para programar um conteúdo",
      el("button", { class: "destaque", onClick: () => abrirConteudo({ data: hojeISO(), clienteId: estado.cliente || "" }) }, "+ Novo conteúdo")),
    filtros, corpo,
    el("p", { class: "nota" }, "Agendamento: defina data e horário e mude o status para \"Agendado\". A publicação automática no Instagram/Facebook entra numa próxima etapa, com a integração da API da Meta."));
}

