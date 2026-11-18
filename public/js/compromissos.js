// Compromissos: reuniões, gravações externas, visitas — o que mexe na sua rotina.
// Aparecem no calendário separados dos posts e podem ir para a sua Google Agenda pessoal.
import { el, formulario, confirmar, avisar, hojeISO, fecharModais } from "./ui.js";
import { ehAdmin } from "./permissoes.js";
import { dados, criar, atualizar, excluir, porId, opcoesClientes, salvarComId, desfazerExclusao } from "./db.js";
import { sincronizar, linkGoogleAgenda, agendaConectada, configEquipe, emailsParticipantes } from "./agenda.js";

export const TIPOS_COMPROMISSO = ["Reunião", "Gravação externa", "Visita", "Evento", "Call", "Pessoal", "Outro"];

export function abrirCompromisso(comp = {}) {
  const editando = !!comp.id;
  const equipe = configEquipe();
  const valores = {
    tipo: "Reunião", data: hojeISO(), duracao: 60, repetir: "",
    participantes: equipe.length ? [equipe[0].nome] : [], ...comp,
    sincronizar: comp.naoSincronizar ? false : comp.sincronizar !== false || !editando
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
    { nome: "sincronizar", rotulo: agendaConectada()
      ? "Enviar para a Google Agenda (os participantes recebem o convite por e-mail em até 5 minutos)"
      : "Enviar para a Google Agenda (vai assim que as automações estiverem ligadas em Ajustes)", tipo: "checkbox" }
  ].filter((c) => !(c.tipo === "secao" && !c.rotulo));

  const extras = [];
  if (editando) {
    extras.push(el("a", { class: "botao-link secundario mini", href: comp.googleLink || linkGoogleAgenda(comp), target: "_blank", rel: "noopener" },
      comp.googleLink ? "Ver na Google Agenda ↗" : "Adicionar à Google Agenda ↗"));
    extras.push(el("button", {
      type: "button", class: "perigo-texto", onClick: async () => {
        if (!(await confirmar(`Excluir "${comp.titulo}"?${comp.googleEventId ? " Ele também sai da Google Agenda (e os convidados são avisados)." : ""}`))) return;
        const { id, googleEventId, googleLink, ...copia } = porId("compromissos", comp.id) || comp;
        await excluir("compromissos", id);
        fecharModais();
        // Ao desfazer ele volta no app; se estava na Google Agenda, é preciso sincronizar de novo.
        sincronizar();
        avisar("Compromisso excluído.", "ok", { desfazer: async () => { await desfazerExclusao("compromissos", id, copia); sincronizar(); } });
      }
    }, "Excluir"));
  }

  if (editando && (comp.sincronizar || comp.googleEventId)) extras.unshift(el("span", { class: `etiqueta ${comp.erroSync ? "alerta" : comp.googleEventId ? "ok" : ""}`, title: comp.erroSync || "" },
    comp.erroSync ? "Google Agenda: erro (passe o mouse)" : comp.googleEventId ? `Na Google Agenda ✓${comp.sincronizadoEm ? ` · ${new Date(comp.sincronizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}` : "Indo para a Google Agenda…"));
  return formulario(editando ? "Editar compromisso" : "Novo compromisso", campos, valores, {
    largo: true, extras,
    aoSalvar: async (v) => {
      v.duracao = Number(v.duracao) || 60;
      v.naoSincronizar = !v.sincronizar; // desmarcado de propósito: o app não volta a marcar sozinho
      if (v.diaInteiro) v.hora = "";
      let salvo;
      if (editando) { await atualizar("compromissos", comp.id, v); salvo = { ...comp, ...v }; }
      else { const ref = await criar("compromissos", v); salvo = { id: ref.id, ...v }; }
      // A agenda é atualizada sozinha pelo script da Hyper: cria, muda o mesmo evento ou tira, e avisa os convidados
      if (v.sincronizar || salvo.googleEventId) sincronizar();
      const convidados = emailsParticipantes(salvo).length;
      const naAgenda = v.sincronizar && agendaConectada();
      avisar(`${editando ? "Compromisso atualizado" : "Compromisso criado"}.${naAgenda
        ? (editando && salvo.googleEventId ? ` A Google Agenda${convidados ? ` de todos os ${convidados} participantes` : ""} é atualizada em instantes.` : ` Vai para a Google Agenda${convidados ? ` com convite para ${convidados} pessoa(s)` : ""} em instantes.`)
        : ""}`);
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
  const pendentes = dados.compromissos.filter((c) => c.sincronizar && !c.googleEventId && (c.data || "") >= hojeISO());
  if (!pendentes.length) return null;
  if (!agendaConectada()) return el("p", { class: "faixa-aviso" }, `${pendentes.length} compromisso(s) esperando a Google Agenda. `,
    ehAdmin() ? el("a", { href: "#/config" }, "Ligar as automações em Ajustes →") : "Peça para um administrador ligar as automações em Ajustes.");
  return el("p", { class: "faixa-aviso" }, `${pendentes.length} compromisso(s) indo para a Google Agenda (o script da Hyper sincroniza a cada 5 minutos). `,
    el("button", { class: "mini", onClick: async (e) => {
      e.currentTarget.disabled = true;
      avisar((await sincronizar()) ? "Sincronização pedida. Os convites saem em instantes." : "O script vai sincronizar nos próximos minutos.");
    } }, "Sincronizar agora"));
}
