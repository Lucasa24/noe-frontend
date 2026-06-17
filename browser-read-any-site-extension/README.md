# Browser Read Any Site

Extensao para Chrome/Edge com permissao de leitura em qualquer site e bloqueio de navegacao por codigo temporario.

## O que ela faz agora

- Continua declarando `host_permissions` com `<all_urls>`.
- Injeta `content.js` em qualquer site e mostra uma tela de bloqueio no topo da pagina.
- Gera um codigo temporario ao instalar a extensao, ao iniciar o navegador e ao pedir reenvio manual.
- Envia o codigo para um webhook HTTP configurado, para que o seu backend encaminhe o email.
- Libera a navegacao apenas depois que o usuario cola o codigo correto na tela de bloqueio.
- Mostra badge `LOCK`, `OPEN`, `CFG` ou `ERR` para indicar o estado atual.

## Backend Vercel com Google Workspace SMTP

Esta pasta agora tambem pode ser publicada na Vercel para servir o endpoint:

`POST /api/send-code`

Esse endpoint recebe o payload da extensao e envia o email usando SMTP do Google Workspace via `nodemailer`.

### Variaveis de ambiente

Crie as variaveis abaixo na Vercel:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=seu-email@seudominio.com
SMTP_PASS=sua-senha-ou-app-password
MAIL_FROM="Acesso do Navegador <seu-email@seudominio.com>"
WEBHOOK_TOKEN=troque-por-um-token-forte
```

### Deploy na Vercel

1. Suba esta pasta para um repositorio Git.
2. Importe o projeto na Vercel.
3. Adicione as variaveis de ambiente acima.
4. Rode `npm install` durante o build para instalar `nodemailer`.
5. Depois do deploy, use a URL:
   - `https://seu-projeto.vercel.app/api/send-code`

### Configuracao na extensao

Na pagina de opcoes da extensao, preencha:

- `Email de destino`: o Gmail que deve receber o codigo.
- `Webhook de envio`: `https://seu-projeto.vercel.app/api/send-code`
- `Token do webhook`: o mesmo valor definido em `WEBHOOK_TOKEN`

## Como configurar

1. Abra `chrome://extensions/` ou `edge://extensions/`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactacao`.
4. Selecione a pasta `browser-read-any-site-extension`.
5. Abra os detalhes da extensao e entre em `Pagina de opcoes`.
6. Configure:
   - `Email de destino`
   - `Webhook de envio`
   - `Token do webhook` (opcional)

## Payload enviado ao webhook

O service worker envia um `POST` JSON semelhante a este:

```json
{
  "to": "destino@dominio.com",
  "code": "123456",
  "extensionId": "abcdefghijklmnopabcdefghijklmnop",
  "reason": "startup",
  "generatedAt": 1760000000000
}
```

O endpoint Vercel incluido neste projeto ja recebe esse payload e envia o email com o campo `code`.

## Observacoes sobre Google Workspace SMTP

- O envio usa normalmente `smtp.gmail.com`.
- Em muitos casos, voce vai usar uma `App Password` da conta Google Workspace.
- Dependendo das politicas do seu Workspace, o admin pode precisar liberar esse modo de autenticacao ou voce pode optar por relay SMTP do dominio.

## Limitacoes importantes

- Extensoes comuns nao conseguem bloquear, ler, habilitar ou desabilitar outras extensoes instaladas no navegador.
- Esta implementacao bloqueia a navegacao nas paginas comuns abertas pelo navegador, mas nao controla extensoes de terceiros.
- O envio automatico de email exige um backend ou automacao externa; o navegador sozinho nao oferece um SMTP confiavel e seguro para isso.
