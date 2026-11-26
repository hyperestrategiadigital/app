# Próximos passos e ideias (registro interno)

Lista viva do que ficou para depois, das ideias que saíram do app e de sugestões novas. Não aparece no app.
Quando o Matheus pedir "o próximo passo", comece por aqui: confira o que já foi feito, recomende **um** passo com o porquê e pergunte antes de começar o que for grande.
Ao terminar algo daqui, mova para "Feito" com a data. Ao surgir uma ideia nova, anote na seção certa.
O repositório é público: nada de nomes de clientes, valores ou dados internos neste arquivo.

## Como escolher o próximo passo

1. **Risco antes de novidade:** o que pode quebrar, ficar lento ou estourar a cota gratuita do Firebase vem primeiro.
2. **Uso diário da equipe:** depois, o que tira atrito do dia a dia (Hoje, Tarefas, Planejamento, criar copy).
3. **Cliente:** o que deixa o portal e a aprovação mais simples.
4. **Novidade grande** (imagem, integrações) só com a base estável, e começando pelo menor pedaço útil.

## Fila curta

(vazia: os 5 pontos da revisão de 26/11/2026 foram feitos, ver "Feito")

## Tráfego pago (em Beta)

Feito em 26/11/2026: números dos anúncios da Meta (investido, leads, custo por lead, conversas, alcance, cliques) no cartão do cliente e nos Relatórios.
Para tirar o Beta:
- Matheus acrescentar `ads_read` na configuração do Login para Empresas do app da Meta e conferir os números com o Gerenciador de Anúncios.
- **Voltar o aviso de manutenção atrasada no Hoje** (feito e tirado em 26/11/2026 a pedido do Matheus: incomodava enquanto o tráfego está em Beta). A função `manutencoesAtrasadas()` está pronta em `views/trafego.js`; o aviso era uma faixa no Hoje, só para quem é do tráfego, com os clientes sem manutenção há mais de 7 dias. Pensar em ligar por pessoa (quem cuida do tráfego) ou só para o responsável da conta.
- Levar os números dos anúncios para o PDF do relatório.
- Escolher o período nos cartões (hoje fixo em 30 dias) e ver por campanha.
- Depois: Google Ads (API exige conta de desenvolvedor aprovada; ver custo e prazo antes).

## Ideias que saíram e podem voltar (só quando o Matheus pedir)

Saíram em 11/2026 para o app ficar enxuto. Não trazer de volta sem pedido.
- **Criação de imagem / Studio** (a "aba do estúdio" e o "Criar arte"): gerar artes no próprio app. O Matheus citou uma ferramenta chamada "Painton" para isso. **Confirmar o nome e o que ela é** antes de planejar. Pontos a resolver: custo por imagem, onde guardar (o plano gratuito não tem Storage; criativo em base64 no Firestore pesa), chave da API fora do código (repositório público) e fluxo com o Canva, onde a arte final é feita hoje.
- **Creators:** a área de criadores/influenciadores que saiu. Antes de voltar, definir o que ela resolve: cadastro de creators, campanhas com creators, aprovação de roteiro?
- **Sugerir melhoria com IA** (botões que reescreviam campos): saiu porque a IA no app ficou só para copy e texto. Se voltar, pelo mesmo caminho do "✨ Criar copy" (montar o pedido em `ia.js` e colar na IA da pessoa), sem chamar IA pelo app.
- **Importações centrais** (vários clientes de uma vez nos Ajustes): saíram. Hoje só o briefing na marca e o planejamento no Calendário.

## Sugestões novas (do Claude)

- **Relatório mensal automático para o cliente:** no começo do mês, o Apps Script monta o resumo do mês anterior (posts publicados, resultados da Meta) e avisa a equipe para revisar e mandar. Hoje o PDF é manual.
- **Modelos de planejamento:** salvar a estrutura de um mês que funcionou (dias, formatos, pilares) e aplicar em outro cliente ou mês, além do "Preencher dias fixos".
- **Equilíbrio de pilares no planejamento:** avisar quando o mês fica com um pilar só (o calendário já mostra a contagem; falta o alerta na hora de planejar).
- **Exemplos de copy melhores:** marcar quais posts performaram bem (pelos resultados da Meta) e usar esses como exemplo no pedido de copy, em vez de só os aprovados.
- **Entrada de cliente novo:** uma rotina de boas-vindas (briefing, acessos, escopo, primeiro planejamento) que cria as tarefas sozinha quando o cliente é cadastrado.
- **Horas por cliente:** registrar tempo nas tarefas para ver se a mensalidade cobre o trabalho (só admin, junto do Financeiro).
- **Aprovação em um só lugar:** quando o cliente tem acesso ao portal, o link de aprovação pode levar direto para o portal, para ele não ter dois caminhos.

## Pendências de configuração (fora do código)

- Dar à conta de serviço do GitHub os papéis "Administrador do Firebase Rules" e "Consumidor do Service Usage", para o deploy publicar as regras sozinho (hoje as regras são coladas no console).
- Confirmar qual banco do Firestore está em uso (`(default)` aparece em Ajustes → Backup).
- Atualizar o Apps Script com a versão de `docs/email/Codigo.gs` quando ele mudar (última mudança: 25/11/2026, backup com as campanhas).
- Meta: `ads_read` na configuração do Login para Empresas (feito pelo Matheus em 26/11/2026).

## Feito

- 11/2026: IA só para copy; datas comemorativas por marca; campanhas; escopo; importação de briefing na marca.
- 26/11/2026 (PR #45, revisão): criativos lidos por id do post (sem baixar as imagens do cliente inteiro); importação do planejamento sem duplicar; aba Marca em quadros; etiqueta com ✕ para cada filtro; aviso no portal no lugar da arte apagada; números de anúncios da Meta.
- 26/11/2026 (PR #45): importação de planejamento; Ajustes recolhíveis; faxina das imagens de posts publicados (7 dias); + Novo no Hoje e no celular; filtros de Tarefas; cadastro na aba Marca; ficha enxuta; Relatórios no menu com resultados da Meta; Tráfego pago em Beta.
