// E-mails automáticos (convite, acesso liberado, pedidos de acesso), enviados pelo Gmail da Hyper
// através de um Google Apps Script (docs/email/Codigo.gs). O app não tem servidor (plano Spark).
// - config/email { url, segredo }: só administradores leem; com o segredo o app manda qualquer e-mail.
// - espacos/hyper.emailUrl: só a URL, para quem ainda não tem acesso avisar os administradores de um pedido.
import { dados, espacoInfo, salvarComId, atualizarEspaco, bancoInfo } from "./db.js";
import { ehAdmin, eu } from "./permissoes.js";

const LINK_APP = location.origin + location.pathname.replace(/index\.html$/, "");

// E-mail não entende variáveis de CSS: as cores da marca (docs/identidade-visual.md) vão escritas aqui.
const MARCA = { roxo: "#4E2CA3", amarelo: "#FFC130", gelo: "#C9D5E3", texto: "#1A1A1A", cinza: "#606060" };

export const configEmail = () => dados.config.find((c) => c.id === "email") || {};
export const emailAtivo = () => !!configEmail().url && !!configEmail().segredo;

async function chamar(url, corpo) {
  // text/plain evita a checagem prévia de CORS; o Apps Script responde JSON
  const r = await fetch(url, { method: "POST", body: JSON.stringify(corpo) });
  const json = await r.json().catch(() => ({ ok: false, erro: "resposta inválida" }));
  if (!json.ok) throw new Error(json.erro === "segredo" ? "O script de e-mail não reconheceu este app. Conecte de novo em Ajustes." : `E-mail não enviado (${json.erro}).`);
  return json;
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Modelo com a identidade da Hyper. */
export function modelo(titulo, paragrafos, { link = LINK_APP, botao = "Abrir o app da Hyper" } = {}) {
  return `<div style="font-family:Montserrat,Arial,sans-serif;max-width:560px;margin:auto;color:${MARCA.texto}">
  <div style="background:${MARCA.roxo};color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
    <div style="font-size:13px;letter-spacing:2px;opacity:.8">HYPER</div>
    <div style="font-size:22px;font-weight:bold;font-style:italic">${esc(titulo)}</div>
  </div>
  <div style="border:1px solid ${MARCA.gelo};border-top:0;padding:24px;border-radius:0 0 12px 12px;line-height:1.5">
    ${paragrafos.map((p) => `<p>${p}</p>`).join("")}
    ${link ? `<p style="margin:28px 0 8px"><a href="${esc(link)}" style="background:${MARCA.amarelo};color:#000;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(botao)}</a></p>` : ""}
    <p style="color:${MARCA.cinza};font-size:12px;margin-top:24px">Entre sempre com a sua conta Google (o mesmo e-mail que recebeu esta mensagem).</p>
  </div></div>`;
}

/** Envia um e-mail (só administradores). Sem e-mail configurado, não faz nada e devolve false. */
export async function enviarEmail({ para, assunto, html }) {
  if (!ehAdmin() || !emailAtivo() || !para) return false;
  const { url, segredo } = configEmail();
  await chamar(url, { tipo: "enviar", segredo, para, assunto, html, responderPara: eu.email });
  return true;
}

const rotulos = (areas = []) => areas.map((a) => ({ conteudo: "Conteúdo", trafego: "Tráfego pago", financeiro: "Financeiro" }[a] || a)).join(", ");
const descreverAcesso = ({ papel, permissoes = [], acessoClientes, nomesClientes = [] }) => [
  papel === "admin" ? "<b>Administrador</b> (tudo, inclusive usuários)" : permissoes.length ? `Áreas: <b>${esc(rotulos(permissoes))}</b>` : "Acesso básico (Hoje, Tarefas, compromissos e clientes)",
  papel !== "admin" && acessoClientes === "alguns" ? `Clientes: <b>${esc(nomesClientes.join(", ") || "nenhum ainda")}</b>` : null
].filter(Boolean).join("<br>");

export const emailConvite = (c) => enviarEmail({
  para: c.email,
  assunto: "Você foi adicionado ao app da Hyper",
  html: modelo(`Olá${c.nome ? `, ${c.nome}` : ""}!`, [
    `${esc(eu.nome || "A Hyper")} adicionou você ao app de trabalho da Hyper.`,
    descreverAcesso(c),
    `Para entrar, abra o app e clique em <b>Entrar com Google</b> usando <b>${esc(c.email)}</b>. Seu acesso já está liberado.`
  ], { botao: "Entrar no app" })
});

export const emailLiberado = (m) => enviarEmail({
  para: m.email,
  assunto: "Seu acesso ao app da Hyper foi liberado",
  html: modelo(`Acesso liberado${m.nome ? `, ${m.nome.split(" ")[0]}` : ""}!`, [
    "Seu pedido de acesso ao app da Hyper foi aprovado.", descreverAcesso(m)
  ], { botao: "Entrar no app" })
});

export const emailMaisAcesso = (m, aprovado) => enviarEmail({
  para: m.email,
  assunto: aprovado ? "Seu pedido de acesso foi aprovado" : "Sobre o seu pedido de acesso",
  html: modelo(aprovado ? "Pedido aprovado" : "Pedido não aprovado", aprovado
    ? ["Seu pedido de mais acesso no app da Hyper foi aprovado. Seu acesso agora:", descreverAcesso(m)]
    : ["Seu pedido de mais acesso no app da Hyper não foi aprovado desta vez. Se tiver dúvida, fale com o administrador."])
});

/** Avisa os administradores de um pedido (funciona até para quem ainda não foi liberado). */
export async function avisarAdmins({ nome, email, detalhe }) {
  const url = configEmail().url || espacoInfo.emailUrl;
  if (!url) return false;
  try { await chamar(url, { tipo: "aviso-admins", nome, email, detalhe, link: `${LINK_APP}#/usuarios` }); return true; }
  catch (e) { console.warn("Aviso aos administradores:", e.message); return false; }
}

/** Mantém no script a lista de e-mails dos administradores (quem recebe os avisos de pedido). */
export async function sincronizarAdmins() {
  if (!ehAdmin() || !emailAtivo()) return;
  const emails = [...new Set(dados.membros.filter((m) => m.status === "ativo" && (m.papel === "admin" || m.id === espacoInfo.dono)).map((m) => m.email).filter(Boolean))].sort();
  const chave = JSON.stringify(emails);
  // Membros ativos também: só eles podem receber avisos de menção
  const membros = [...new Set(dados.membros.filter((m) => m.status === "ativo").map((m) => m.email).filter(Boolean))].sort();
  const chaveMembros = JSON.stringify(membros);
  if (configEmail().admins === chave && configEmail().membros === chaveMembros) return;
  const { url, segredo } = configEmail();
  await chamar(url, { tipo: "admins", segredo, emails, membros });
  await salvarComId("config", "email", { admins: chave, membros: chaveMembros });
}

/** Primeira conexão com o script: combina um segredo e guarda a configuração. */
export async function conectarEmail(url) {
  url = url.trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) throw new Error("Cole a URL do app da Web do Apps Script (começa com https://script.google.com/).");
  const segredo = configEmail().url === url && configEmail().segredo ? configEmail().segredo
    : [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const r = await chamar(url, { tipo: "configurar", segredo, projeto: "hyper-9e023", banco: bancoInfo.id || "(default)", linkApp: LINK_APP }).catch((e) => {
    if (/ja-configurado/.test(e.message)) throw new Error("Este script já está ligado a outro segredo. No Apps Script, rode a função apagarSegredo e tente de novo.");
    throw e;
  });
  await salvarComId("config", "email", { url, segredo, conta: r.conta || "", admins: "" });
  await atualizarEspaco({ emailUrl: url }).catch((e) => console.warn("URL pública do e-mail:", e.message));
  return r.conta;
}

export async function testarEmail() {
  const { url, segredo } = configEmail();
  const r = await chamar(url, { tipo: "testar", segredo });
  await enviarEmail({ para: eu.email, assunto: "Teste do app da Hyper", html: modelo("Tudo certo!", ["Os e-mails automáticos do app da Hyper estão funcionando."]) });
  return r;
}

export async function desconectarEmail() {
  await salvarComId("config", "email", { url: "", segredo: "", conta: "", admins: "" });
  await atualizarEspaco({ emailUrl: "" }).catch(() => {});
}

/** Avisa por e-mail quem foi mencionado (@nome) num comentário. Qualquer membro pode: o script só manda para membros do espaço. */
export async function avisarMencao({ para, nomePara, tarefa, texto }) {
  const assunto = `${eu.nome || "Alguém"} mencionou você: ${tarefa.titulo}`;
  const html = modelo(`Você foi mencionado`, [
    `<b>${esc(eu.nome || eu.email)}</b> comentou em <b>${esc(tarefa.titulo)}</b>:`,
    `<span style="display:block;border-left:4px solid ${MARCA.amarelo};padding-left:12px">${esc(texto).replace(/\n/g, "<br>")}</span>`
  ], { link: `${LINK_APP}#/tarefa/${tarefa.id}`, botao: "Abrir a tarefa" });
  try {
    if (ehAdmin() && emailAtivo()) return await enviarEmail({ para, assunto, html });
    const url = espacoInfo.emailUrl;
    if (!url) return false;
    await chamar(url, { tipo: "aviso-membro", para, nome: nomePara, de: eu.nome || eu.email, titulo: tarefa.titulo, texto, link: `${LINK_APP}#/tarefa/${tarefa.id}` });
    return true;
  } catch (e) { console.warn("Menção:", e.message); return false; }
}

/** Backup agora (normalmente roda sozinho toda segunda às 3h, só no Drive da Hyper). */
export async function backupAgora() {
  const { url, segredo } = configEmail();
  return chamar(url, { tipo: "backup-agora", segredo });
}
/** Manda o resumo diário agora só para mim (para testar). */
export async function resumoAgora() {
  const { url, segredo } = configEmail();
  return chamar(url, { tipo: "resumo-agora", segredo, para: eu.email });
}
