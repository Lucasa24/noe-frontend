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

Esse backend agora expõe:

- `POST /api/send-code`
- `POST /api/verify-code`
- `GET /api/health`

O fluxo de producao funciona assim:

1. A extensao chama `send-code`.
2. O servidor gera o codigo, define expiracao e assina um desafio stateless.
3. O servidor envia o codigo por email via Google Workspace SMTP.
4. A extensao guarda apenas o desafio assinado.
5. Quando o usuario cola o codigo, a extensao chama `verify-code`.
6. O servidor valida assinatura, expiracao e codigo antes de liberar.

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
SIGNING_SECRET=troque-por-uma-chave-longa-e-aleatoria
CODE_TTL_MINUTES=10
ALLOWED_EXTENSION_IDS=
EXTENSION_EMAIL_MAP={"abcdefghijklmnopabcdefghijklmnop":"email1@gmail.com","qrstuvwxyzabcdefqrstuvwxyzabcdef":"email2@gmail.com"}
```

Pode colocar esses valores diretamente nas variaveis de ambiente da Vercel. Nao envie o arquivo `.env` para o repositorio.

### Mapeamento por ID da extensao

Agora o email de destino pode ficar preso ao `ID da extensao` no backend.

Exemplo:

```env
EXTENSION_EMAIL_MAP={"abcdefghijklmnopabcdefghijklmnop":"email1@gmail.com","qrstuvwxyzabcdefqrstuvwxyzabcdef":"email2@gmail.com"}
```

Com isso:

- se a extensao com ID `abcdefghijklmnopabcdefghijklmnop` pedir um codigo, o email vai para `email1@gmail.com`
- se a extensao com ID `qrstuvwxyzabcdefqrstuvwxyzabcdef` pedir um codigo, o email vai para `email2@gmail.com`

O frontend da extensao nao precisa mais salvar o email de destino localmente.

### Deploy na Vercel

1. Suba esta pasta para um repositorio Git.
2. Importe o projeto na Vercel.
3. Adicione as variaveis de ambiente acima.
4. A Vercel vai instalar `nodemailer` a partir do `package.json`.
5. Depois do deploy, use a URL:
   - `https://seu-projeto.vercel.app/api/send-code`
6. Teste:
   - `https://seu-projeto.vercel.app/api/health`

### Configuracao na extensao

Na pagina de opcoes da extensao, preencha:

- `Webhook de envio`: `https://seu-projeto.vercel.app/api/send-code`
- `Token do webhook`: o mesmo valor definido em `WEBHOOK_TOKEN`

## Seguranca recomendada

- Defina `SIGNING_SECRET` com um valor longo e aleatorio.
- Defina `WEBHOOK_TOKEN` com um valor forte e preencha o mesmo token na extensao.
- Se quiser restringir a instalacao de producao, preencha `ALLOWED_EXTENSION_IDS` com o ID final da extensao na Chrome Web Store ou no navegador alvo.
- Use `CODE_TTL_MINUTES` para expirar o codigo rapido, por exemplo `5` ou `10`.

## Como configurar

1. Abra `chrome://extensions/` ou `edge://extensions/`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactacao`.
4. Selecione a pasta `browser-read-any-site-extension`.
5. Abra os detalhes da extensao e entre em `Pagina de opcoes`.
6. Configure:
   - `Webhook de envio`
   - `Token do webhook` (opcional)

## Payload enviado ao webhook

O service worker envia um `POST` JSON semelhante a este para `send-code`:

```json
{
  "extensionId": "abcdefghijklmnopabcdefghijklmnop",
  "reason": "startup"
}
```

Resposta esperada de `send-code`:

```json
{
  "ok": true,
  "challengeToken": "token-assinado",
  "expiresAt": 1760000000000,
  "recipientEmail": "ex***@gmail.com"
}
```

Payload enviado para `verify-code`:

```json
{
  "challengeToken": "token-assinado",
  "code": "123456",
  "extensionId": "abcdefghijklmnopabcdefghijklmnop"
}
```

## Observacoes sobre Google Workspace SMTP

- O envio usa normalmente `smtp.gmail.com`.
- Em muitos casos, voce vai usar uma `App Password` da conta Google Workspace.
- Dependendo das politicas do seu Workspace, o admin pode precisar liberar esse modo de autenticacao ou voce pode optar por relay SMTP do dominio.

## Limitacoes importantes

- Extensoes comuns nao conseguem bloquear, ler, habilitar ou desabilitar outras extensoes instaladas no navegador.
- Esta implementacao bloqueia a navegacao nas paginas comuns abertas pelo navegador, mas nao controla extensoes de terceiros.
- O envio automatico de email exige um backend ou automacao externa; o navegador sozinho nao oferece um SMTP confiavel e seguro para isso.
