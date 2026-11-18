// Só para os testes de tela: substitui o SDK do Firebase (CDN) por uma versão em memória.
let cb; const user = window.__usuario || { uid: "hyper", displayName: "Hyper Estratégia Digital", email: "hyperestrategiadigital@gmail.com" };
export const getAuth = (app) => ({ app });
export class GoogleAuthProvider { addScope() {} setCustomParameters() {} static credentialFromResult() { return { accessToken: "tok" }; } }
export const signInWithPopup = async (a) => { if (a?.app?.nome === "agenda") return { user: { email: "pessoal@gmail.com" } }; cb && cb(user); };
export const signOut = async (a) => { if (a?.app?.nome === "agenda") return; cb && cb(null); };
export const onAuthStateChanged = (a, f) => { cb = f; setTimeout(() => f(window.__logado === false ? null : user), 0); };
