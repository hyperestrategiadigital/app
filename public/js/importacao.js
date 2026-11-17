// Importação da planilha "Fluxo de Trabalho" (CSV baixado do Google Sheets).
// Corrige nomes de clientes digitados de jeitos diferentes, separa entregas por ";" em checklist
// e usa ids fixos para que importar de novo não duplique nada.
import { normalizar } from "./ui.js";
import { deduzirPost } from "./migracoes.js";

const STATUS = { "aguardando": "a_fazer", "em andamento": "andamento", "concluido": "concluido", "atrasado": "a_fazer" };

/** Lê CSV respeitando aspas. */
export function lerCSV(texto) {
  const linhas = []; let linha = []; let campo = ""; let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ",") { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

function distancia(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const dataISO = (s) => {
  const m = (s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};

function inferirTipo(texto) {
  const t = normalizar(texto);
  // Peças com prefixo de formato ("Estático | ...", "VÍDEO | ...") são produção de conteúdo
  if (/^(estatico|carrossel|story|stories|whatsapp|criativos?|comercial \||arte)/.test(t)) return "Conteúdo";
  if (/^(video|reels?|editar video)/.test(t)) return "Vídeo";
  if (/^roteiro/.test(t)) return "Roteiro";
  const regras = [
    ["Tráfego pago", /manut?en?cao tp|manuntencao|trafego pago|\btp\b|google ads|meta ads|criativos? (novos|ia)|subir (novas pecas|novos criativos)/],
    ["Financeiro", /cobrar|financeiro|nota\b|pagamento|mei\b/],
    ["Comercial", /orcamento|contrato|proposta|renovacao|pitch|apresentacao/],
    ["Reunião", /reuniao|call\b|alinhar|alinhamento|visita/],
    ["Planejamento", /planejamento|entregaveis|organizar (julho|marco|abril|geral)/],
    ["Organização", /organizar semana|organizar/],
    ["Aprovação", /aprovar|publicar/],
    ["Roteiro", /roteiro/],
    ["Vídeo", /video|reels?\b|gravacao|gravar|editar|corte|thumb/],
    ["Site / LP", /landing|\blp\b|site|blog|link na bio/],
    ["Conteúdo", /estatico|carrossel|story|stories|whatsapp|conteudo|criativo|arte|post|semana/]
  ];
  return regras.find(([, re]) => re.test(t))?.[0] || "Outro";
}

/**
 * Analisa o CSV e devolve { tarefas, nomes } sem gravar nada.
 * nomes: [{ original, canonico, qtd }] para o usuário conferir a correção dos clientes.
 */
export function analisarPlanilha(texto) {
  const linhas = lerCSV(texto);
  const brutas = [];
  for (const l of linhas) {
    // Procura a coluna de status em qualquer posição (a planilha tem uma coluna vazia antes)
    const i = l.findIndex((c) => STATUS[normalizar(c)] !== undefined);
    if (i < 0) continue;
    const [status, cliente, prazo, responsavel, ...resto] = l.slice(i);
    const texto = resto.join(",").replace(/,\/$/, "").trim();
    brutas.push({ status: STATUS[normalizar(status)], cliente: (cliente || "").trim(), prazo: dataISO(prazo), responsavel: (responsavel || "").trim(), texto });
  }

  // Corrige variações de nome: agrupa pelo nome normalizado e funde nomes muito parecidos
  const contagem = {};
  brutas.forEach((b) => { const n = normalizar(b.cliente); if (n) (contagem[n] ??= { qtd: 0, formas: {} }).qtd++, contagem[n].formas[b.cliente] = (contagem[n].formas[b.cliente] || 0) + 1; });
  const chaves = Object.keys(contagem).sort((a, b) => contagem[b].qtd - contagem[a].qtd);
  const destino = {};
  for (const k of chaves) {
    const parecido = chaves.find((o) => o !== k && contagem[o].qtd > contagem[k].qtd && k.length > 3 && distancia(k, o) <= 2);
    destino[k] = parecido ? (destino[parecido] || parecido) : k;
  }
  const nomeBonito = (k) => Object.entries(contagem[k].formas).sort((a, b) => b[1] - a[1])[0][0];
  const canonico = (nome) => { const n = normalizar(nome); return n ? nomeBonito(destino[n]) : ""; };

  const vistos = {};
  const tarefas = brutas.map((b) => {
    const partes = b.texto.split(";").map((p) => p.trim()).filter(Boolean);
    const varias = partes.length > 1;
    const base = `${b.status}|${normalizar(b.cliente)}|${b.prazo}|${b.texto}`;
    vistos[base] = (vistos[base] || 0) + 1;
    return {
      id: `imp-${hash(base)}-${vistos[base]}`,
      titulo: varias ? `${partes[0]} + ${partes.length - 1}` : (b.texto || "(sem descrição)"),
      cliente: canonico(b.cliente),
      tipo: inferirTipo(b.texto),
      status: b.status,
      prazo: b.prazo,
      responsavel: b.responsavel,
      checklist: varias ? partes.map((p) => ({ texto: p, feito: b.status === "concluido" })) : [],
      concluidoEm: b.status === "concluido" ? b.prazo : null,
      notas: "", linkCanva: "", linkDrive: "", origem: "planilha",
      ...(inferirTipo(b.texto) === "Conteúdo" ? { ...deduzirPost(partes[0] || b.texto, b.prazo), statusConteudo: b.status === "concluido" ? "publicado" : "ideia" } : {})
    };
  });

  const nomes = Object.entries(contagem).flatMap(([k, v]) =>
    Object.entries(v.formas).map(([original, qtd]) => ({ original, canonico: nomeBonito(destino[k]), qtd })))
    .sort((a, b) => a.canonico.localeCompare(b.canonico, "pt-BR") || b.qtd - a.qtd);
  return { tarefas, nomes };
}
