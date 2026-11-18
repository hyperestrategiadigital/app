/**
 * Automações do app da Hyper, rodando no Google Apps Script DA CONTA DA HYPER (e só nela):
 *  - e-mails: convites, acesso liberado, pedidos de acesso, menções em comentários;
 *  - resumo diário às 8h para cada pessoa da equipe;
 *  - backup semanal compacto (.json.gz, sem imagens) numa pasta do Drive da Hyper, guardando só os 8 mais recentes.
 *
 * Como instalar (uma vez, logado na conta da Hyper):
 *  1. Abra https://script.google.com → Novo projeto.
 *  2. Engrenagem (Configurações do projeto) → marque "Mostrar o arquivo de manifesto appsscript.json".
 *  3. No editor, abra appsscript.json e troque o conteúdo pelo arquivo docs/email/appsscript.json.
 *  4. Abra Código.gs, apague tudo e cole este arquivo inteiro. Salve.
 *  5. Implantar → Nova implantação → tipo "App da Web". Executar como: Eu. Quem pode acessar: Qualquer pessoa.
 *  6. Autorize (Avançado → Acessar projeto) e copie a URL do app da Web.
 *  7. No app: Administração → Ajustes → E-mails e automações, cole a URL e clique em Conectar.
 * Para atualizar este código depois: cole a versão nova, salve e em Implantar → Gerenciar implantações → editar (lápis)
 * → Versão: Nova versão → Implantar. A URL continua a mesma.
 *
 * Segurança: o app combina um segredo com este script na primeira conexão (fica nas propriedades do script e num
 * documento que só administradores leem). Sem o segredo, o script só aceita avisos para administradores e para
 * membros cadastrados, com limite por hora.
 */
const P = PropertiesService.getScriptProperties();
const NOME = 'Hyper';
const FUSO = 'America/Sao_Paulo';
const LIMITE_AVISOS_POR_HORA = 30;
const BACKUPS_GUARDADOS = 8;
const PASTA_BACKUP = 'Backups do app Hyper';
const COLECOES_BACKUP = ['clientes', 'marcas', 'contratos', 'tarefas', 'tarefasArquivo', 'compromissos', 'recorrencias', 'membros',
  'financeiro', 'orcamentos', 'contasAds', 'manutencoes', 'config', 'convites', 'aprovacoes'];

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    const segredo = P.getProperty('SEGREDO');

    if (d.tipo === 'configurar') {
      if (segredo && segredo !== d.segredo) return resposta({ ok: false, erro: 'ja-configurado' });
      P.setProperties({
        SEGREDO: String(d.segredo || ''),
        PROJETO: String(d.projeto || 'hyper-9e023'),
        BANCO: String(d.banco || '(default)'),
        LINK_APP: String(d.linkApp || '')
      });
      instalarGatilhos();
      return resposta({ ok: true, conta: Session.getEffectiveUser().getEmail() });
    }

    // Sem segredo: pedido de acesso (só para administradores) e menção (só para membros cadastrados)
    if (d.tipo === 'aviso-admins') {
      const admins = lista('ADMINS');
      if (!admins.length) return resposta({ ok: false, erro: 'sem-admins' });
      if (!dentroDoLimite()) return resposta({ ok: false, erro: 'limite' });
      const nome = texto(d.nome, 80), email = texto(d.email, 120), detalhe = texto(d.detalhe, 600), link = texto(d.link, 200);
      MailApp.sendEmail({
        to: admins.join(','), name: NOME, subject: `Hyper: ${nome || email}`,
        htmlBody: modelo('Aviso do app', `<p><b>${esc(nome)}</b>${email ? ` (${esc(email)})` : ''}</p>${detalhe ? `<p>${esc(detalhe).replace(/\n/g, '<br>')}</p>` : ''}`, link, 'Abrir o app')
      });
      return resposta({ ok: true });
    }
    if (d.tipo === 'aviso-membro') {
      const para = String(d.para || '').toLowerCase();
      if (!lista('MEMBROS').map((x) => x.toLowerCase()).includes(para)) return resposta({ ok: false, erro: 'nao-membro' });
      if (!dentroDoLimite()) return resposta({ ok: false, erro: 'limite' });
      MailApp.sendEmail({
        to: para, name: NOME, subject: `${texto(d.de, 80)} mencionou você: ${texto(d.titulo, 120)}`,
        htmlBody: modelo('Você foi mencionado', `<p><b>${esc(texto(d.de, 80))}</b> comentou em <b>${esc(texto(d.titulo, 120))}</b>:</p>
          <p style="border-left:4px solid #FFC130;padding-left:12px">${esc(texto(d.texto, 1500)).replace(/\n/g, '<br>')}</p>`, texto(d.link, 300), 'Abrir a tarefa')
      });
      return resposta({ ok: true });
    }

    if (!segredo || d.segredo !== segredo) return resposta({ ok: false, erro: 'segredo' });

    if (d.tipo === 'admins') {
      P.setProperty('ADMINS', JSON.stringify((d.emails || []).filter(Boolean).slice(0, 30)));
      if (d.membros) P.setProperty('MEMBROS', JSON.stringify(d.membros.filter(Boolean).slice(0, 200)));
      return resposta({ ok: true });
    }
    if (d.tipo === 'enviar') {
      MailApp.sendEmail({ to: d.para, subject: d.assunto, htmlBody: d.html, name: NOME, replyTo: d.responderPara || undefined });
      return resposta({ ok: true, restantes: MailApp.getRemainingDailyQuota() });
    }
    if (d.tipo === 'testar') return resposta({ ok: true, conta: Session.getEffectiveUser().getEmail(), restantes: MailApp.getRemainingDailyQuota() });
    if (d.tipo === 'backup-agora') return resposta({ ok: true, ...backupSemanal() });
    if (d.tipo === 'resumo-agora') return resposta({ ok: true, enviados: resumoDiario(d.para || '') });
    return resposta({ ok: false, erro: 'tipo' });
  } catch (erro) {
    return resposta({ ok: false, erro: String(erro) });
  }
}

/** Resumo às 8h e backup toda segunda às 3h (horário de Brasília). Roda sozinho na conexão. */
function instalarGatilhos() {
  ScriptApp.getProjectTriggers().forEach((g) => ScriptApp.deleteTrigger(g));
  ScriptApp.newTrigger('resumoDiario').timeBased().atHour(8).everyDays(1).inTimezone(FUSO).create();
  ScriptApp.newTrigger('backupSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).inTimezone(FUSO).create();
}

/** Rode esta função no editor se precisar conectar o app de novo (ex.: trocou de conta ou apagou a configuração). */
function apagarSegredo() { P.deleteProperty('SEGREDO'); }

/* ---------------- Resumo diário ---------------- */

function resumoDiario(somentePara) {
  const hoje = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
  const membros = lerColecao('membros').filter((m) => m.status === 'ativo' && m.email && m.resumoDiario !== false);
  const tarefas = lerColecao('tarefas').filter((t) => t.status !== 'concluido');
  const compromissos = lerColecao('compromissos').filter((c) => ocorreEm(c, hoje));
  const clientes = {};
  lerColecao('clientes').forEach((c) => (clientes[c.id] = c.nome));
  const link = P.getProperty('LINK_APP') || '';
  let enviados = 0;
  membros.forEach((m) => {
    if (somentePara && m.email.toLowerCase() !== somentePara.toLowerCase()) return;
    const minhas = tarefas.filter((t) => t.responsavel === m.nome);
    const atrasadas = minhas.filter((t) => t.prazo && t.prazo < hoje);
    const deHoje = minhas.filter((t) => t.prazo === hoje);
    const reunioes = compromissos.filter((c) => !(c.participantes || []).length || (c.participantes || []).indexOf(m.nome) >= 0)
      .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
    if (!atrasadas.length && !deHoje.length && !reunioes.length && !somentePara) return;
    const item = (t) => `<li>${esc(t.titulo)}${t.clienteId && clientes[t.clienteId] ? ` <span style="color:#606060">· ${esc(clientes[t.clienteId])}</span>` : ''}${t.prazo && t.prazo < hoje ? ` <span style="color:#B3261E">(desde ${t.prazo.slice(8)}/${t.prazo.slice(5, 7)})</span>` : ''}</li>`;
    const secao = (titulo, itens, fn) => itens.length ? `<h3 style="margin:18px 0 6px">${titulo} (${itens.length})</h3><ul style="padding-left:18px;margin:0">${itens.slice(0, 15).map(fn).join('')}</ul>` : '';
    const corpo = [
      `<p>Bom dia, ${esc(String(m.nome || '').split(' ')[0])}! Seu dia na Hyper:</p>`,
      secao('Reuniões e compromissos de hoje', reunioes, (c) => `<li>${c.hora ? `<b>${esc(c.hora)}</b> ` : ''}${esc(c.titulo)}${c.local ? ` · ${esc(c.local)}` : ''}</li>`),
      secao('Vence hoje', deHoje, item),
      secao('Atrasadas', atrasadas, item),
      !atrasadas.length && !deHoje.length && !reunioes.length ? '<p>Nada para hoje. Bom trabalho!</p>' : ''
    ].join('');
    MailApp.sendEmail({ to: m.email, name: NOME, subject: `Seu dia na Hyper: ${deHoje.length} para hoje${atrasadas.length ? `, ${atrasadas.length} atrasada(s)` : ''}`,
      htmlBody: modelo('Resumo do dia', corpo, link ? link + '#/hoje' : '', 'Abrir o Hoje') + '<p style="font-size:11px;color:#606060;text-align:center">Para não receber mais, desmarque em Minha conta no app.</p>' });
    enviados++;
  });
  return enviados;
}

/** O compromisso acontece neste dia? (considera as repetições semanal, quinzenal e mensal) */
function ocorreEm(c, dia) {
  if (!c.data || c.data > dia) return false;
  if (c.data === dia) return true;
  if (!c.repetir || (c.repetirAte && dia > c.repetirAte)) return false;
  const dias = Math.round((new Date(dia + 'T12:00:00') - new Date(c.data + 'T12:00:00')) / 86400000);
  if (c.repetir === 'semanal') return dias % 7 === 0;
  if (c.repetir === 'quinzenal') return dias % 14 === 0;
  if (c.repetir === 'mensal') return dia.slice(8) === c.data.slice(8);
  return false;
}

/* ---------------- Backup semanal (compacto) ---------------- */

function backupSemanal() {
  const dados = { exportadoEm: new Date().toISOString(), projeto: P.getProperty('PROJETO'), banco: P.getProperty('BANCO') };
  COLECOES_BACKUP.forEach((col) => (dados[col] = lerColecao(col)));
  const hoje = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
  // Sem espaços e compactado (.gz): ocupa uma fração do tamanho. As imagens dos posts não entram (ficam no Canva/Drive).
  const blob = Utilities.gzip(Utilities.newBlob(JSON.stringify(dados), 'application/json', `hyper-backup-${hoje}.json`), `hyper-backup-${hoje}.json.gz`);
  const pastas = DriveApp.getFoldersByName(PASTA_BACKUP);
  const pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder(PASTA_BACKUP);
  const arquivo = pasta.createFile(blob);
  // Guarda só os mais recentes
  const arquivos = [];
  const it = pasta.getFiles();
  while (it.hasNext()) arquivos.push(it.next());
  arquivos.sort((a, b) => b.getDateCreated() - a.getDateCreated()).slice(BACKUPS_GUARDADOS).forEach((f) => f.setTrashed(true));
  const info = { ultimo: Date.now(), arquivo: arquivo.getUrl(), pasta: pasta.getUrl(), tamanho: arquivo.getSize(), guardados: Math.min(arquivos.length, BACKUPS_GUARDADOS) };
  gravarDocumento('config/backup', info);
  return info;
}

/* ---------------- Firestore (pela conta da Hyper, dona do projeto) ---------------- */

function base() {
  return `https://firestore.googleapis.com/v1/projects/${P.getProperty('PROJETO') || 'hyper-9e023'}/databases/${encodeURIComponent(P.getProperty('BANCO') || '(default)')}/documents/espacos/hyper`;
}
function chamarFirestore(url, opcoes) {
  const r = UrlFetchApp.fetch(url, Object.assign({ headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }, opcoes || {}));
  if (r.getResponseCode() >= 300) throw new Error('Firestore ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText() || '{}');
}
function lerColecao(col) {
  const itens = [];
  let pagina = '';
  do {
    const r = chamarFirestore(`${base()}/${col}?pageSize=300${pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''}`);
    (r.documents || []).forEach((d) => itens.push(Object.assign({ id: d.name.split('/').pop() }, decodificar(d.fields || {}))));
    pagina = r.nextPageToken || '';
  } while (pagina);
  return itens;
}
function gravarDocumento(caminho, valores) {
  const campos = Object.keys(valores).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  chamarFirestore(`${base()}/${caminho}?${campos}`, { method: 'patch', contentType: 'application/json', payload: JSON.stringify({ fields: codificarCampos(valores) }) });
}
function decodificar(campos) {
  const r = {};
  Object.keys(campos).forEach((k) => (r[k] = valor(campos[k])));
  return r;
}
function valor(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valor);
  if ('mapValue' in v) return decodificar(v.mapValue.fields || {});
  return null;
}
function codificarCampos(obj) {
  const r = {};
  Object.keys(obj).forEach((k) => (r[k] = codificar(obj[k])));
  return r;
}
function codificar(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(codificar) } };
  if (typeof x === 'object') return { mapValue: { fields: codificarCampos(x) } };
  return { stringValue: String(x) };
}

/* ---------------- Utilidades ---------------- */

function lista(nome) { try { return JSON.parse(P.getProperty(nome) || '[]'); } catch (e) { return []; } }
function dentroDoLimite() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('avisos') || 0);
  if (n >= LIMITE_AVISOS_POR_HORA) return false;
  cache.put('avisos', String(n + 1), 3600);
  return true;
}
const texto = (v, max) => String(v || '').slice(0, max);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Cores da marca Hyper (e-mail não aceita variáveis de CSS)
function modelo(titulo, corpo, link, rotulo) {
  return `<div style="font-family:Montserrat,Arial,sans-serif;max-width:560px;margin:auto;color:#1A1A1A">
    <div style="background:#4E2CA3;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0">
      <div style="font-size:12px;letter-spacing:2px;opacity:.8">HYPER</div>
      <div style="font-size:21px;font-weight:bold;font-style:italic">${esc(titulo)}</div></div>
    <div style="border:1px solid #C9D5E3;border-top:0;padding:24px;border-radius:0 0 12px 12px;line-height:1.5">${corpo}
    ${link ? `<p style="margin-top:24px"><a href="${esc(link)}" style="background:#FFC130;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(rotulo)}</a></p>` : ''}</div></div>`;
}
function resposta(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
