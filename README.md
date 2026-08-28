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
- exportação e importação dos dados locais em JSON.

Os dados editados e os PDFs são mantidos no navegador do dispositivo. O projeto não envia essas informações para um servidor.

## Verificação

```sh
npm run lint
npm test
npm run build
```

O build de produção é gerado em `dist/`.

