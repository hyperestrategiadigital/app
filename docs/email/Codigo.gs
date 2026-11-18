/**
 * Envio de e-mails do app da Hyper (convites, acesso liberado, pedidos de acesso).
 * Roda no Google Apps Script da conta da Hyper e manda os e-mails pelo Gmail dela.
 *
 * Como instalar (uma vez, logado na conta da Hyper):
 *  1. Abra https://script.google.com → Novo projeto. Apague o que estiver lá e cole este arquivo inteiro.
 *  2. Salve. Clique em Implantar → Nova implantação → tipo "App da Web".
 *     Executar como: Eu (conta da Hyper). Quem pode acessar: Qualquer pessoa.
 *  3. Autorize (Avançado → Acessar projeto) e copie a URL do app da Web.
 *  4. No app: Administração → Ajustes → E-mails automáticos, cole a URL e clique em Conectar.
 *
 * Segurança: o app combina um segredo com este script na primeira conexão (fica nas propriedades do
 * script e num documento que só administradores leem). Sem o segredo, o script só aceita avisar os
 * administradores sobre um pedido de acesso, com limite por hora.
 */
const P = PropertiesService.getScriptProperties();
const NOME = 'Hyper';
const LIMITE_AVISOS_POR_HORA = 20;

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    const segredo = P.getProperty('SEGREDO');

    if (d.tipo === 'configurar') {
      if (segredo && segredo !== d.segredo) return resposta({ ok: false, erro: 'ja-configurado' });
      P.setProperty('SEGREDO', String(d.segredo || ''));
      return resposta({ ok: true, conta: Session.getEffectiveUser().getEmail() });
    }

    // Pedido de acesso (vem de quem ainda não foi liberado): só avisa os administradores
    if (d.tipo === 'aviso-admins') {
      const admins = JSON.parse(P.getProperty('ADMINS') || '[]');
      if (!admins.length) return resposta({ ok: false, erro: 'sem-admins' });
      if (!dentroDoLimite()) return resposta({ ok: false, erro: 'limite' });
      const nome = texto(d.nome, 80), email = texto(d.email, 120), detalhe = texto(d.detalhe, 600), link = texto(d.link, 200);
      MailApp.sendEmail({
        to: admins.join(','), name: NOME,
        subject: `Pedido de acesso: ${nome || email}`,
        htmlBody: modeloSimples(
          'Novo pedido de acesso',
          `<p><b>${esc(nome)}</b> (${esc(email)}) pediu acesso ao app da Hyper.</p>${detalhe ? `<p>${esc(detalhe).replace(/\n/g, '<br>')}</p>` : ''}`,
          link, 'Abrir Usuários')
      });
      return resposta({ ok: true });
    }

    if (!segredo || d.segredo !== segredo) return resposta({ ok: false, erro: 'segredo' });

    if (d.tipo === 'admins') {
      P.setProperty('ADMINS', JSON.stringify((d.emails || []).filter(Boolean).slice(0, 20)));
      return resposta({ ok: true });
    }
    if (d.tipo === 'enviar') {
      MailApp.sendEmail({ to: d.para, subject: d.assunto, htmlBody: d.html, name: NOME, replyTo: d.responderPara || undefined });
      return resposta({ ok: true, restantes: MailApp.getRemainingDailyQuota() });
    }
    if (d.tipo === 'testar') return resposta({ ok: true, conta: Session.getEffectiveUser().getEmail(), restantes: MailApp.getRemainingDailyQuota() });
    return resposta({ ok: false, erro: 'tipo' });
  } catch (erro) {
    return resposta({ ok: false, erro: String(erro) });
  }
}

/** Rode esta função no editor se precisar conectar o app de novo (ex.: trocou de conta ou apagou a configuração). */
function apagarSegredo() { P.deleteProperty('SEGREDO'); }

function dentroDoLimite() {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get('avisos') || 0);
  if (n >= LIMITE_AVISOS_POR_HORA) return false;
  cache.put('avisos', String(n + 1), 3600);
  return true;
}
const texto = (v, max) => String(v || '').slice(0, max);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function modeloSimples(titulo, corpo, link, rotulo) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1A1A1A">
    <div style="background:#4E2CA3;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;font-size:20px;font-weight:bold">${esc(titulo)}</div>
    <div style="border:1px solid #C9D5E3;border-top:0;padding:24px;border-radius:0 0 12px 12px">${corpo}
    ${link ? `<p style="margin-top:24px"><a href="${esc(link)}" style="background:#FFC130;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(rotulo)}</a></p>` : ''}</div></div>`;
}
function resposta(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
