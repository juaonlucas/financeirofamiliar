# Painel Família

Painel da fatura familiar do cartão BV administrada por João Lucas: quem paga o quê, cobranças, pagamentos e próximos meses.

## Como funciona

- **Visão do mês**: total da fatura dividido por pessoa, etapas do mês (identificar → cobrar → receber → fechar) e alertas (sem dono, multa por atraso, vencimento, combinados, falta cobrir).
- **Identificar**: lançamentos sem dono agrupados (multa, tarifas, parcelas que continuam, compras novas), com sugestões e atribuição em um toque; divisão entre várias pessoas; regras para compras que se repetem.
- **Pessoas**: demonstrativo individual, mensagem de WhatsApp, imagem 1080×1350, registro de pagamento e **link pessoal** (mostra só as compras daquela pessoa).
- **Lançamentos**, **Próximos meses** (parcelas já assumidas) e **Histórico**.
- **Importar fatura**: lê o PDF no navegador, concilia com o total e cria o mês novo (o anterior vai para o histórico).

## Dados e acesso

- Estado em Vercel Blob (`painel-familia/state.json`) via `api/state.js`.
- Leitura completa e gravação exigem a chave `PANEL_SYNC_SECRET` (cabeçalho `x-panel-key`).
- Link pessoal: `/?p=<token>` devolve só a parte da pessoa (`personScope` em `js/finance.js`).
- `PANEL_PUBLIC_READ=1` reativa a leitura pública antiga, se precisar.
- Gravações enviam `x-base-updated-at`; se outro aparelho salvou antes, a API responde 409 e nada é sobrescrito.

## Desenvolvimento

```sh
npm install
node scripts/dev.mjs caminho/para/estado.json   # http://localhost:8790, chave local "dev"
npm run lint
npm test
npm run build
```
