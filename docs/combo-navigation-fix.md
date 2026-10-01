# Correção do erro DNR — Browser Read 1.3.69 / Combo Vitalício 1.5.5

## Causa confirmada pela captura

O aviso vermelho no `combo-links.html` informa que o Chrome ignorou a regra de sessão `9350`: o `regexFilter` ultrapassou 2 KB depois da compilação. O clique chama `openComboProduct`, que prepara a aba para autenticação nas duas extensões antes de navegar. A instalação dessa regra falha e o clique termina no menu com o erro. A mesma expressão era instalada pelo Combo Vitalício como regra `7490`; corrigir apenas o Browser Read deixaria o bloqueio global da outra extensão ativo.

A documentação oficial do Chrome confirma o limite compilado de 2 KB por regra de expressão regular e que, entre extensões, uma ação `block` prevalece sobre `allow`: [Declarative Net Request](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).

## Alteração

As regras temporárias `9350` e `7490` foram substituídas em **ambas** as extensões por 129 `urlFilter` curtos por pacote. Eles não usam `regexFilter`, portanto não estão sujeitos ao limite que gerou o aviso. Cada regra tem ação `allow`, prioridade 300, vale apenas para navegação principal (`main_frame`) e para a aba preparada (`tabIds`). A autorização expira em dez minutos, é revogada ao sair do fluxo e é removida de ambos os pacotes quando a navegação falha após a aprovação.

Os filtros começam com o esquema HTTPS e o host completo. As rotas de autenticação do SSO, SSO surrogate e consumer são delimitadas por fim de URL, `/`, `?` ou `#`; `/login;evil`, `/login+evil` e `/login-not-auth` não correspondem. As páginas intermediárias do Hotmart ficam limitadas à raiz de `/pt-br/club` e `/pt-br/area-de-membros`. Os 14 produtos e seus caminhos de aulas continuam listados individualmente nas regras permanentes; outros produtos e a biblioteca do consumer continuam bloqueados.

O menu ainda exige estado desbloqueado, URL e origem de conteúdo válidos, remetente interno e extensão companion selecionada. A aprovação é instalada nos dois workers antes de `tabs.update`. Um erro após essa aprovação agora envia uma revogação ao companion. As regras globais de bloqueio continuam ativas; a liberação de uma extensão não substitui a da outra.

## Validação

- 144 verificações automatizadas dos workers e do clique, com APIs Chrome simuladas: os 14 links, variação `pt-BR`, fluxo OIDC, precedência das duas extensões, expiração e revogação por aba.
- Regressão da regra legada: os IDs antigos são removidos; as novas regras de sessão não têm `regexFilter`.
- Testes negativos para outros produtos, domínios semelhantes, HTTP, rotas alheias, aba não autorizada e limites de caminho como `/login;evil`.
- Sintaxe dos JavaScripts, referências do manifesto e do HTML, integridade CRC e comparação byte a byte dos ZIPs com as fontes empacotadas. Hashes SHA-256 em `SHA256.txt`.

O perfil AdsPower da captura não está disponível nesta sessão. Os testes simulados verificam a lógica e o escopo, mas o clique real e os redirecionamentos da conta Hotmart só podem ser confirmados nesse perfil. O Chrome local não pôde ser usado como ambiente de teste isolado nesta sessão; a correção do limite de regex baseia-se no aviso exato da captura e na documentação do Chrome.

## Instalação no AdsPower

1. Substitua o pacote da entrada **Combo vitalicio** já instalada por `Combo-Vitalicio-v1.5.5-DNR-Fix-ADSPower.zip`.
2. Substitua o pacote da entrada **Browser Read Any Site** já instalada por `Browser-Read-v1.3.69-Combo-DNR-Fix-ADSPower.zip`.
3. Reabra o perfil, valide novamente o acesso e confira no aviso acima dos links: **Browser Read 1.3.69 • Combo Vitalício 1.5.5**.
4. Clique em um produto. Se houver outro erro, o aviso vermelho no alto da página mostrará a causa; copie o texto exato e, se possível, a versão das duas extensões exibida no mesmo menu.

Atualize as duas entradas existentes; criar uma instalação duplicada muda a identidade da extensão e pode impedir a comunicação entre elas. As credenciais permanecem nas opções já existentes e não entram nos ZIPs novos.

## Executar os testes

`node tests/combo-navigation.cjs` executa as verificações da versão corrigida. Definir `COMBO_BASELINE_DIR` para o diretório local da versão original acrescenta as regressões do worker antigo. Nenhum teste acessa contas ou servidores externos.
