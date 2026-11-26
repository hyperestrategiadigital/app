// Datas do calendário: feriados nacionais (para todos), datas comerciais comuns no marketing brasileiro,
// campanhas que duram o mês todo e as datas comemorativas de cada marca (aba Marca, campo `datas`).
// Usado no calendário, no planejamento do mês e no pedido de copy (ia.js).
import { identidade, marcasDo, porId } from "./db.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const somar = (data, n) => { const d = new Date(`${data}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };

function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(new Date(ano, mes - 1, dia));
}
const nDomingo = (ano, mes, n) => { const d = new Date(ano, mes - 1, 1); const primeiro = 1 + ((7 - d.getDay()) % 7); return iso(new Date(ano, mes - 1, primeiro + 7 * (n - 1))); };
const porAno = (ano, fixas) => Object.fromEntries(Object.entries(fixas).map(([md, nome]) => [`${ano}-${md}`, nome]));

/** Feriados nacionais (e os pontos facultativos que param o comércio): valem para todos. */
export function feriados(ano) {
  const r = porAno(ano, { "01-01": "Confraternização Universal", "04-21": "Tiradentes", "05-01": "Dia do Trabalho", "09-07": "Independência do Brasil",
    "10-12": "Nossa Senhora Aparecida", "11-02": "Finados", "11-15": "Proclamação da República", "11-20": "Dia da Consciência Negra", "12-25": "Natal" });
  const p = pascoa(ano);
  r[somar(p, -48)] = "Carnaval (ponto facultativo)"; r[somar(p, -47)] = "Carnaval (ponto facultativo)";
  r[somar(p, -2)] = "Sexta-feira Santa"; r[somar(p, 60)] = "Corpus Christi (ponto facultativo)";
  return r;
}

/** Datas comerciais comuns no marketing brasileiro (não são feriados). */
export function datasComerciais(ano) {
  const r = porAno(ano, { "03-08": "Dia Internacional da Mulher", "03-15": "Dia do Consumidor", "04-07": "Dia Mundial da Saúde",
    "04-28": "Dia Mundial da Segurança e Saúde no Trabalho", "06-12": "Dia dos Namorados", "06-24": "São João", "09-15": "Dia do Cliente",
    "10-12": "Dia das Crianças", "10-15": "Dia do Professor", "12-31": "Réveillon" });
  const p = pascoa(ano);
  r[p] = "Páscoa";
  r[nDomingo(ano, 5, 2)] = "Dia das Mães"; r[nDomingo(ano, 8, 2)] = "Dia dos Pais";
  const nov = new Date(ano, 10, 1); const quinta = 1 + ((4 - nov.getDay() + 7) % 7) + 21;
  r[iso(new Date(ano, 10, quinta + 1))] = "Black Friday";
  return r;
}

/** Campanhas que duram o mês todo. */
export const MESES_TEMA = { "01": "Janeiro Branco (saúde mental)", "04": "Abril Verde (segurança no trabalho)", "05": "Maio, mês das noivas",
  "09": "Setembro Amarelo (prevenção do suicídio)", "10": "Outubro Rosa", "11": "Novembro Azul e Black November" };

/* Datas da marca: { quando: "MM-DD" (todo ano) | "MM" (o mês todo) | "AAAA-MM-DD" (só esse ano), nome } */
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const quandoParaTela = (q = "") => /^\d{2}$/.test(q) ? MESES[Number(q) - 1] || q : /^\d{2}-\d{2}$/.test(q) ? `${q.slice(3)}/${q.slice(0, 2)}` : /^\d{4}-\d{2}-\d{2}$/.test(q) ? `${q.slice(8)}/${q.slice(5, 7)}/${q.slice(0, 4)}` : q;
/** "20/01" → "01-20"; "9" → "09" (o mês todo); "20/01/2027" → "2027-01-20"; também aceita os formatos já guardados. */
export function quandoDoTexto(t = "") {
  const s = String(t).trim(); let m;
  if (/^\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if ((m = s.match(/^(\d{1,2})$/)) && +m[1] >= 1 && +m[1] <= 12) return m[1].padStart(2, "0");
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})$/)) && +m[2] >= 1 && +m[2] <= 12) return `${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}
/**
 * Datas comemorativas da marca (a do grupo vale para as marcas que não têm as próprias).
 * marcaId === undefined num grupo: as do grupo e as de todas as marcas, com o nome da marca.
 */
export function datasDaMarca(clienteId, marcaId = "") {
  if (!clienteId) return [];
  const validas = (l) => (l || []).filter((d) => d?.nome && quandoDoTexto(d.quando));
  if (marcaId === undefined && marcasDo(clienteId).length)
    return [...validas(porId("clientes", clienteId)?.datas), ...marcasDo(clienteId).flatMap((m) => validas(m.datas).map((d) => ({ ...d, nome: `${d.nome} (${m.nome})` })))];
  return validas(identidade(clienteId, marcaId || undefined).datas);
}

/**
 * Datas entre `inicio` e `fim` (AAAA-MM-DD): [{ data, nome, tipo }], tipo = feriado | comercial | marca | mes.
 * As do mês todo vêm com `data` = primeiro dia do mês. Sem cliente: só feriados (e comerciais, se pedidas).
 * marcaId undefined num grupo = as datas de todas as marcas dele.
 */
export function datasEntre(inicio, fim, { clienteId = "", marcaId, comerciais = true } = {}) {
  const r = [];
  const anos = [...new Set([Number(inicio.slice(0, 4)), Number(fim.slice(0, 4))])];
  const dentro = (d) => d >= inicio && d <= fim;
  for (const ano of anos) {
    for (const [d, nome] of Object.entries(feriados(ano))) if (dentro(d)) r.push({ data: d, nome, tipo: "feriado" });
    if (comerciais) for (const [d, nome] of Object.entries(datasComerciais(ano))) if (dentro(d) && !r.some((x) => x.data === d)) r.push({ data: d, nome, tipo: "comercial" });
    for (const x of datasDaMarca(clienteId, marcaId)) {
      const q = quandoDoTexto(x.quando);
      const d = q.length === 2 ? `${ano}-${q}-01` : q.length === 5 ? `${ano}-${q}` : q;
      if (dentro(d) || (q.length === 2 && `${ano}-${q}` >= inicio.slice(0, 7) && `${ano}-${q}` <= fim.slice(0, 7))) r.push({ data: q.length === 2 ? `${ano}-${q}-01` : d, nome: x.nome, tipo: q.length === 2 ? "mes" : "marca" });
    }
    if (comerciais) for (const [mm, nome] of Object.entries(MESES_TEMA)) if (`${ano}-${mm}` >= inicio.slice(0, 7) && `${ano}-${mm}` <= fim.slice(0, 7)) r.push({ data: `${ano}-${mm}-01`, nome, tipo: "mes" });
  }
  return r.sort((a, b) => a.data.localeCompare(b.data));
}
