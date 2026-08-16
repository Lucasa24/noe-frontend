# Preferências do usuário

## Citação de IDs nas operações de cobrança

Ao realizar operações de **cobrar** ou **tirar cobrança** e precisar citar os IDs das
extensões, citar também o **nome** de cada ID — o mesmo nome que aparece no e-mail
quando o cliente recebe o código de acesso (campo "Extensao", no formato `nome (id)`).

### Fonte da verdade

O mapeamento oficial `EXTENSION_EMAIL_MAP` está na **Vercel**, projeto **`noe-frontend`**
(conta `lucasa24s-projects`). Ele tem **16 extensões**. A **Vercel é a referência** de em que
extensões cada usuário existe.

## Regra de cobrança (IMPORTANTE)

Ao cobrar um usuário (destinatário), **sempre cobrar em TODAS as extensões em que esse
usuário existe no `EXTENSION_EMAIL_MAP`** da Vercel. Não apenas uma. Os nomes de exibição das extensões
que aparecem no e-mail vêm de `EXTENSION_DISPLAY_NAMES` em
`browser-read-any-site-extension/lib/access-service.js`.

### Como consultar (CLI Vercel)

A CLI Vercel consegue baixar o mapa legível (a API não devolve o valor de envs
`type: encrypted`; a CLI usa o scope correto via `env pull`):

```bash
vercel link --yes --project noe-frontend   # já feito
vercel env pull .env.vercel --environment=production   # baixa envs legíveis
```

Local do mapa legível: baixado em `.env.vercel` (arquivo gitignorado). O valor da
chave `EXTENSION_EMAIL_MAP` no arquivo é o JSON
`{"extensionId": {"recipientKey": "email", ...}}`.

---

### Extensões no mapa (ID → nome)

| ID | Nome (igual ao e-mail) |
|---|---|
| `kdiclmpfoijaodmpobpfnakglkpclijl` | **comunidade invictus** |
| `kjclfjfidoohlndnjldcbcjomjlcgicd` | **Formacao pre vendas diamond** |
| `njnehniaiehecdplafcbkdhhmjjcojfe` | **academy pass** |
| `dmenpfckkeafegadpafdndbnhgfmiffb` | **COMUNIDADE LENDÁRIA 2026** |
| `jncbkkimmoapjemleedmklnlgiioiffj` | **DOUG - SKOOL** |
| `ebfndfgcpnomfmbnpfhnghbemgogoehl` | sem nome no código |
| `ngjacbpbiegcnfkinikfpdkcplhejael` | sem nome no código |
| `kjlkomgkandjgpmecnfnindkkgdjadpe` | sem nome no código |
| `fbonkoeoabechghdcokphbmpejooaogh` | sem nome no código (teste) |
| `ibkaciaphpkbfikgjnjjfbjcdenlciia` | **BLUEPRINTPRO - BRANDSDECODED** |
| `hbokpkaoocpcecbfgfadoplblcfannke` | **CLAUDE CODE ARCHITECT** |
| `aachjpoooepljhlphhaplfijppgbjdfp` | **PIXEL AI HUB** |
| `kjadaimbcapjhdfeafmopnbfdbgofdko` | **comunidade subido** |
| `nicnjmokndbjnpjlikgmnfkihkklobce` | sem nome no código (André; inserido 2026-08-16) |
| `ocnhopnkhbkgknjhpfcmbihmialpjboj` | **PLANO DVD 3.1** |
| `gklblkkcpmbmnnmjclppoldcdbimoafc` | **Verificação de Atualização em Plataformas** |

Extensões com cobrança ativa (PDF `pendingProfiles` em
`browser-read-any-site-extension/api/extension-config.js`):

| ID | Nome (igual ao e-mail) |
|---|---|
| `jncbkkimmoapjemleedmklnlgiioiffj` | **DOUG - SKOOL** (profiles: Agent) |
| `ocnhopnkhbkgknjhpfcmbihmialpjboj` | **PLANO DVD 3.1** (perfis: Jen R$47, Andressa R$47) |
| `gklblkkcpmbmnnmjclppoldcdbimoafc` | **Verificação de Atualização em Plataformas** (perfis: Jen R$47, Andressa R$47) |

### Exemplo de uso

Em vez de citar apenas o ID, citar sempre o nome junto:

- "Vou cobrar o **DOUG - SKOOL** (`jncbkkimmoapjemleedmklnlgiioiffj`)"
- "Vou tirar a cobrança do **PLANO DVD 3.1** (`ocnhopnkhbkgknjhpfcmbihmialpjboj`)"

---

## Destinatário "Palacio"

- `recipientKey`: **Palacio**
- email: `adobepalacio@gmail.com`
- **ID da extensão onde "Palacio" está no `EXTENSION_EMAIL_MAP`:**
  **`kjadaimbcapjhdfeafmopnbfdbgofdko` = "comunidade subido"**
- Situação: **desbloqueado/removido da cobrança** no commit `a857f62`
  ("desbloqueio Palacio"). Ainda consta como destinatário no mapa da Vercel
  (extensão `comunidade subido`), mas hoje **não tem cobrança ativa**.

> Obs.: Jen tem cobrança própria (R$ 47,00 / 4700); os demais destinatários usam o
> valor padrão default (R$ 9,00 / 900).
