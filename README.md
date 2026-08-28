# Painel Família

Painel local para conferência, rateio e comunicação da fatura familiar do cartão BV administrada por João Lucas.

## Funcionalidades

- separação entre responsabilidade original, pagamento confirmado e pendência;
- cobertura automática de Rosa quando alguém que paga para ela confirma um valor menor;
- perfis editáveis com lançamentos e mensagem pronta para WhatsApp;
- acordos e variações editáveis;
- filtro de lançamentos sem dono;
- demonstrativos, histórico de faturas e importação local de PDF;
- imagem 1080 × 1350 para compartilhamento;
- exportação e importação dos dados locais em JSON;
- memória opcional entre celular e computador, com salvamento automático pelo domínio.

Sem a memória conectada, os dados continuam funcionando somente no navegador. Com a memória conectada, compras, responsáveis, valores, acordos, perfis, faturas cadastradas e exclusões são sincronizados. Os arquivos PDF continuam locais em cada aparelho.

## Configuração da memória no Vercel

1. No projeto, abra **Storage**, crie um **Blob** e conecte-o ao projeto. Isso adiciona `BLOB_READ_WRITE_TOKEN` automaticamente.
2. Em **Settings → Environment Variables**, crie `PANEL_SYNC_SECRET` com uma chave de acesso escolhida por João Lucas.
3. Faça um novo deploy.
4. No painel, abra **☁ Memória** e use a mesma chave no celular e no computador.

Nunca coloque os valores reais dessas variáveis no repositório.

## Verificação

```sh
npm run lint
npm test
npm run build
```

O build de produção é gerado em `dist/`.

