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
- perfis com projeção de três meses, compras encerrando, imagem individual e avatar;
- conferência individual por responsável e quadrante de compras sem dono.

Qualquer pessoa que abrir o endereço público carrega automaticamente os dados sincronizados em modo de visualização, sem login ou chave. A chave é usada somente nos aparelhos autorizados a publicar alterações. Compras, responsáveis, valores, acordos, perfis, faturas cadastradas e exclusões são sincronizados; os arquivos PDF continuam locais em cada aparelho.

## Configuração da memória no Vercel

1. No projeto, abra **Storage**, crie um **Blob** e conecte-o ao projeto. Isso adiciona `BLOB_READ_WRITE_TOKEN` automaticamente.
2. Em **Settings → Environment Variables**, crie `PANEL_SYNC_SECRET` com uma chave de acesso escolhida por João Lucas.
3. Faça um novo deploy.
4. Nos aparelhos de João Lucas, abra **☁ Memória** e informe a chave para habilitar a edição sincronizada. Visitantes não precisam fazer nada.

Nunca coloque os valores reais dessas variáveis no repositório.

## Verificação

```sh
npm run lint
npm test
npm run build
```

O build de produção é gerado em `dist/`.

