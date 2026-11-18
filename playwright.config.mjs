// Testes de tela: abrem o app com o Firebase substituído por um banco em memória (testes/mocks).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "testes",
  testMatch: /.*\.spec\.mjs/,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:4173", viewport: { width: 1440, height: 900 },
    // Para rodar com um Chrome já instalado: CHROME=/caminho/do/chrome npm run test:telas
    launchOptions: process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox"] } : {}
  },
  webServer: { command: "python3 -m http.server 4173 -d public", port: 4173, reuseExistingServer: !process.env.CI, stderr: "ignore" }
});
