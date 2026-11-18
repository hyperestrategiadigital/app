// Compromissos: reuniões, gravações externas, visitas — o que mexe na sua rotina.
// Aparecem no calendário separados dos posts e podem ir para a sua Google Agenda pessoal.
import { el, formulario, confirmar, avisar, hojeISO, fecharModais } from "./ui.js";
import { dados, criar, atualizar, excluir, porId, opcoesClientes, salvarComId, desfazerExclusao } from "./db.js";
import {
  sincronizar, removerDaAgenda, linkGoogleAgenda, agendaConectada, configEquipe, configAgenda
} from "./agenda.js";

export const TIPOS_COMPROMISSO = ["Reunião", "Gravação externa", "Visita", "Evento", "Call", "Pessoal", "Outro"];

async function sincronizarComAviso(c) {
  try {
    await sincronizar(c);
    avisar("Compromisso salvo e enviado para a Google Agenda.");
  } catch (e) {
    console.error(e);
    await atualizar("compromissos", c.id, { erroSync: e.message }).catch(() => {});
    avisar("Salvo no app, mas não foi para a Google Agenda: " + e.message, "erro");
  }
}

export function abrirCompromisso(comp = {}) {
  const editando = !!comp.id;
  const equipe = configEquipe();
  const valores = {
    tipo: "Reunião", data: hojeISO(), duracao: 60, sincronizar: agendaConectada(), repetir: "",
    participantes: equipe.length ? [equipe[0].nome] : [], ...comp
  };
  const campos = [
    { nome: "titulo", rotulo: "Compromisso", obrigatorio: true, dica: "Ex.: Reunião mensal Body in Shape" },
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: TIPOS_COMPROMISSO, largura: "metade" },
    { nome: "clienteId", rotulo: "Cliente (opcional)", tipo: "select", opcoes: opcoesClientes(), largura: "metade" },
    { nome: "data", rotulo: "Data", tipo: "date", obrigatorio: true, largura: "metade" },
    { nome: "diaInteiro", rotulo: "Dia inteiro", tipo: "checkbox", largura: "metade" },
    { nome: "hora", rotulo: "Início", tipo: "time", largura: "metade", mostrarSe: (v) => !v.diaInteiro },
    { nome: "duracao", rotulo: "Duração", tipo: "select", opcoes: [[30, "30 min"], [60, "1 hora"], [90, "1h30"], [120, "2 horas"], [180, "3 horas"], [240, "4 horas"]], largura: "metade", mostrarSe: (v) => !v.diaInteiro },
    { nome: "local", rotulo: "Local ou link da reunião", dica: "Endereço, Google Meet, Zoom..." },
    { nome: "repetir", rotulo: "Repetir", tipo: "select", opcoes: [["", "Não repete"], ["semanal", "Toda semana"], ["quinzenal", "A cada 2 semanas"], ["mensal", "Todo mês (mesmo dia)"]], largura: "metade" },
    { nome: "repetirAte", rotulo: "Repetir até (opcional)", tipo: "date", largura: "metade", mostrarSe: (v) => !!v.repetir },
    { tipo: "secao", rotulo: "Quem participa" },
    equipe.length
      ? { nome: "participantes", rotulo: "Equipe", tipo: "multi", opcoes: equipe.map((p) => p.nome) }
      : { tipo: "secao", rotulo: "Cadastre a equipe em Ajustes para escolher participantes." },
    { nome: "convidados", rotulo: "Outros convidados (e-mails)", dica: "cliente@empresa.com, outra@pessoa.com" },
    { nome: "descricao", rotulo: "Pauta / observações", tipo: "textarea", linhas: 3 },
    { nome: "sincronizar", rotulo: agendaConectada() ? `Enviar para a Google Agenda (${configAgenda().email})` : "Enviar para a Google Agenda (conecte em Ajustes)", tipo: "checkbox" }
  ].filter((c) => !(c.tipo === "secao" && !c.rotulo));

  const extras = [];
  if (editando) {
    extras.push(el("a", { class: "botao-link secundario mini", href: comp.googleLink || linkGoogleAgenda(comp), target: "_blank", rel: "noopener" },
      comp.googleLink ? "Ver na Google Agenda ↗" : "Adicionar à Google Agenda ↗"));
    extras.push(el("button", {
      type: "button", class: "perigo-texto", onClick: async () => {
        if (!(await confirmar(`Excluir "${comp.titulo}"?${comp.googleEventId ? " Ele também sai da Google Agenda (e os convidados são avisados)." : ""}`))) return;
        if (comp.googleEventId) {
          try { await removerDaAgenda(comp); } catch (e) { avisar("Não consegui tirar da Google Agenda: " + e.message, "erro"); }
        }
        const { id, googleEventId, googleLink, ...copia } = porId("compromissos", comp.id) || comp;
        await excluir("compromissos", id);
        fecharModais();
        // Ao desfazer ele volta no app; se estava na Google Agenda, é preciso sincronizar de novo.
        avisar("Compromisso excluído.", "ok", { desfazer: () => desfazerExclusao("compromissos", id, copia) });
      }
    }, "Excluir"));
  }

  return formulario(editando ? "Editar compromisso" : "Novo compromisso", campos, valores, {
    largo: true, extras,
    aoSalvar: async (v) => {
      v.duracao = Number(v.duracao) || 60;
      if (v.diaInteiro) v.hora = "";
      let salvo;
      if (editando) { await atualizar("compromissos", comp.id, v); salvo = { ...comp, ...v }; }
      else { const ref = await criar("compromissos", v); salvo = { id: ref.id, ...v }; }
      if (v.sincronizar) sincronizarComAviso(salvo);
      else {
        if (salvo.googleEventId) {
          try { await removerDaAgenda(salvo); await atualizar("compromissos", salvo.id, { googleEventId: "", googleLink: "" }); } catch (e) { console.warn(e); }
        }
        avisar(editando ? "Compromisso atualizado." : "Compromisso criado.");
      }
    }
  });
}

/** Rótulo curto: "14:00 Reunião mensal" */
export const rotuloCompromisso = (c) => `${c.hora && !c.diaInteiro ? c.hora + " " : ""}${c.titulo}`;

export function cartaoCompromisso(c) {
  const cliente = porId("clientes", c.clienteId);
  return el("button", { class: "cartao-compromisso", onClick: () => abrirCompromisso(c) },
    el("span", { class: "hora-compromisso" }, c.diaInteiro || !c.hora ? "dia todo" : c.hora),
    el("span", { class: "corpo-compromisso" },
      el("strong", {}, c.titulo),
      el("small", {}, [c.tipo, cliente?.nome, c.local].filter(Boolean).join(" · "))),
    c.googleEventId ? el("span", { class: "etiqueta ok", title: "Na Google Agenda" }, "G ✓") : c.sincronizar && c.erroSync ? el("span", { class: "etiqueta alerta", title: c.erroSync }, "G !") : null);
}

/** Faixa de aviso quando há compromissos marcados para a Google Agenda que ainda não foram enviados. */
export function avisoPendentes() {
  const pendentes = dados.compromissos.filter((c) => c.sincronizar && !c.googleEventId);
  if (!pendentes.length) return null;
  if (!agendaConectada()) return el("p", { class: "faixa-aviso" }, `${pendentes.length} compromisso(s) esperando a Google Agenda. `,
    el("a", { href: "#/conta" }, "Conectar a agenda em Minha conta →"));
  return el("p", { class: "faixa-aviso" }, `${pendentes.length} compromisso(s) ainda não foram para a Google Agenda. `,
    el("button", { class: "mini", onClick: async (e) => {
      e.currentTarget.disabled = true;
      let ok = 0;
      for (const c of pendentes) {
        try { await sincronizar(c); ok++; }
        catch (erro) { avisar(erro.message, "erro"); break; }
      }
      if (ok) avisar(`${ok} compromisso(s) enviado(s) para a Google Agenda.`);
    } }, "Enviar agora"));
}
