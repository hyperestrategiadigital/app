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

## Fila curta (da revisão de 26/11/2026)

1. **Criativos: abrir um post baixa todas as imagens do cliente.** Hoje `listarArtesCliente` lê a subcoleção `clientes/{id}/artes` inteira para mostrar as de um post (na equipe e no portal). Gasta leitura e banda do plano gratuito e fica lento. Ideia: o post guardar os ids das artes (`artes: [ids]`) e ler só esses documentos (`getDoc`), sem `where`. Precisa de uma migração que normalize os posts que já têm `qtdArtes`.
2. **Importar o mesmo planejamento duas vezes duplica os posts.** Pular o post que já existe no mês com a mesma data e o mesmo título (normalizado) e avisar quantos foram pulados.
3. **Aba Marca longa:** dividir em quadros recolhíveis como os Ajustes: Cadastro · Visual (logo, cores, fontes, Drive, Canva) · Para a IA (sobre, tom, persona, público, palavras, o que evitar) · Pilares, datas e diretrizes. O medidor da IA aponta o quadro que falta.
4. **Filtros que ninguém vê:** em Tarefas, quem não é admin começa filtrado pelo próprio nome. Mostrar uma etiqueta com ✕ para cada filtro ligado (cliente, marca, responsável, mostrar, formato).
5. **Portal sem imagem depois de 7 dias:** a faxina apaga a arte dos posts publicados. No Calendário do cliente, mostrar "arte publicada no Instagram" com o link do post em vez de um espaço vazio.

## Tráfego pago (em Beta)

O que tira do Beta:
- Puxar os números de anúncios da Meta (investimento, alcance, leads, custo por lead) pela Graph API, como os resultados orgânicos (`meta.js`, token só no navegador).
- Esses números entram nos Relatórios do cliente e no PDF.
- Manutenção atrasada (mais de 7 dias) vira aviso no Hoje de quem cuida do tráfego.
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
- Atualizar o Apps Script com a versão de `docs/email/Codigo.gs` quando ele mudar.

## Feito

- 11/2026: IA só para copy; datas comemorativas por marca; campanhas; escopo; importação de briefing na marca.
- 26/11/2026 (PR #45): importação de planejamento; Ajustes recolhíveis; faxina das imagens de posts publicados (7 dias); + Novo no Hoje e no celular; filtros de Tarefas; cadastro na aba Marca; ficha enxuta; Relatórios no menu com resultados da Meta; Tráfego pago em Beta.
