# Hyper App

App web com Firebase (projeto `hyper-9e023`): login com Google, banco Firestore e hospedagem no Firebase Hosting.

## Estrutura

```
public/
  index.html        página principal
  css/style.css     estilos
  js/firebase.js    configuração do Firebase
  js/main.js        lógica: login e notas no Firestore
firebase.json       configuração do Hosting e do Firestore
.firebaserc         projeto padrão (hyper-9e023)
firestore.rules     regras de segurança do banco
firestore.indexes.json  índices do Firestore
```

Não precisa de build: o Firebase é carregado direto do CDN.

## Configuração no console (uma vez)

1. **Authentication** → Começar → Método de login → ative **Google**.
2. **Firestore Database** → Criar banco de dados → modo **produção** → região `southamerica-east1` (São Paulo).

## Rodar e publicar

Precisa do [Node.js](https://nodejs.org) instalado.

```bash
npx -y firebase-tools@latest login
npx -y firebase-tools@latest emulators:start --only hosting   # testar em http://localhost:5000
npx -y firebase-tools@latest deploy                            # publicar site + regras + índices
```

Depois do deploy o site fica em https://hyper-9e023.web.app
