# Correção de navegação — Browser Read 1.3.67 / Combo Vitalício 1.5.3

## Resultado da investigação

As fontes examinadas eram Browser Read 1.3.66 e Combo Vitalício 1.5.2. A cópia do Browser Read no Box corresponde ao conteúdo do GitHub no commit `0b25413`, desconsiderando quebras de linha. O manifesto antigo na raiz do repositório (1.3.2, worker `sw-v132.js`) é outro pacote; o pacote correto fica em `browser-read-any-site-extension/`.

O retorno para `chrome-extension://miipjameglmiodjjgghegcidmkiefmlg/combo-links.html` é executado pelo Browser Read:

`tabs.onUpdated → enforceLockedTab → isAllowedTabAfterUnlock(false) → getScopedFallbackUrl → tabs.update`.

`enforceScopedBrowser` também usa esse destino ao rejeitar uma aba. As regras DNR globais `9101` (Browser Read) e `7401` (Combo) têm ação **block**, e não redirect; por si só não abrem o menu.

### Reprodução lógica comprovada

1. Um evento antigo guarda um URL não permitido, por exemplo `about:blank`.
2. O listener aguarda leitura do estado e das permissões.
3. A mesma aba já navega para Light Copy, produto `2438760`.
4. A implementação antiga avalia o URL antigo e chama `tabs.update` com o menu, sobrescrevendo o produto.
5. O teste executa o worker original com as APIs do Chrome simuladas e reproduz exatamente esse destino. O worker corrigido verifica o URL atual e descarta a decisão antiga.

Isso comprova um caminho de falha no código; não identifica, sem um registro do perfil real, qual evento ocorreu na instalação do usuário. Os 14 URLs diretos, com estado válido e as regras atuais instaladas, já passavam nas verificações antigas. Não foi encontrada uma regra que rejeite incondicionalmente os 14 URLs.

### Outros defeitos encontrados

- O manifesto do Browser Read admitia mensagens externas somente do Pixel, bloqueando a mensagem de autenticação enviada pelo Combo.
- `isAuthorizedComboCompanionSender` chamava `normalizeExtensionName`, inexistente nesse worker; o erro era capturado e o remetente rejeitado.
- Toda consulta de produto em `isAllowedTabAfterUnlock` revogava a autenticação. Eventos de título, favicon e carregamento podiam desfazer a preparação do login.
- Alterações simultâneas da lista de abas autorizadas podiam sobrescrever uma à outra.
- `enableGate` recarregava produtos e redirecionava páginas de autenticação em cada aprovação, mesmo quando o gate já estava ativo.
- `setAuthFlowForTab` devolvia sucesso mesmo quando o Browser Read não aceitava a sincronização.
- A permissão temporária não tinha expiração no DNR. O endpoint OIDC era permitido globalmente.

## Correção aplicada

O clique normal no menu passa por `combo-links.js`. O worker confirma a página interna de origem, o estado desbloqueado, o destinatário, `allowedContentUrl`, `allowedContentOrigin` e o produto solicitado. Ele instala as regras nos dois workers, prepara a mesma aba nas duas extensões e aguarda as confirmações antes de navegar.

As duas extensões continuam com seus próprios bloqueios globais. Uma regra `allow` de uma não vence o `block` da outra. A preparação coordenada resolve essa divergência; aumentar a prioridade ou mudar a ordem de instalação não resolve. Referência: [avaliação de regras DNR do Chrome](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#rule-evaluation).

As mensagens externas podem alcançar o Browser Read, mas o handler exige o ID do companion selecionado, nome reconhecido, extensão ativa e sessão Combo desbloqueada. Não foi liberada comunicação de páginas web.

Os 14 produtos e seus caminhos internos permanecem como lista de conteúdo permitido. O OIDC deixou de ter exceção global. As rotas de autenticação em SSO, SSO surrogate e consumer, e as páginas intermediárias previstas, exigem uma autorização de aba com expiração em dez minutos. A liberação não abrange a biblioteca de produtos do consumer. As alterações de sessão são serializadas e a expiração usa alarmes do Chrome. O retorno ao produto encerra a autorização; o autologin em andamento é preservado enquanto ainda prepara o envio das credenciais.

O Browser Read registra a última rejeição em `chrome.storage.local.comboLastNavigationRejection`, sem query string nem fragmento. Isso permite identificar a rota real rejeitada se o perfil apresentar outro caminho de autenticação.

## Validação

- 122 asserções automatizadas, executando os workers em ambiente Node com APIs do Chrome simuladas.
- Regressões na versão antiga e correção do retorno por evento obsoleto.
- Os 14 URLs, variações `pt-br`/`pt-BR` e caminhos de aulas.
- Preparação e confirmação dos dois workers; precedência block/allow representada no teste.
- URLs de outros produtos, IDs com sufixos, HTTP, domínio falso, biblioteca consumer e abas não autorizadas continuam bloqueados.
- Concorrência, expiração, revogação e estado inválido.
- Sintaxe dos JavaScripts, referências de manifesto e scripts HTML, integridade CRC dos ZIPs e comparação byte a byte com os arquivos empacotados.
- Manifesto na raiz, sem arquivos duplicados; nomes e ausência de `key` preservados. SHA-256 em `SHA256.txt`.

**Limite:** não foi executado um login real na Hotmart/AdsPower. O teste simula DNR; não substitui a validação do motor do Chrome nem comprova todos os redirects do servidor. Uma rota de autenticação não contemplada continuará bloqueada e poderá ser identificada pelo registro de rejeição.

## Instalação no AdsPower

1. Atualize/substitua o ZIP na entrada já existente do **Combo vitalicio**, usando a versão **1.5.3**.
2. Atualize/substitua o ZIP na entrada já existente do **Browser Read Any Site**, usando a versão **1.3.67**.
3. Não cadastre novas extensões. Reabra o perfil e valide novamente o acesso ao Combo; confirme as versões nas extensões.
4. Clique normalmente em um produto no menu. Se a preparação falhar, o menu agora mostra o erro em vez de navegar sem a autorização das duas extensões.

As credenciais continuam nas opções da extensão; esta correção não adiciona credenciais aos arquivos. A identidade final no AdsPower depende de atualizar as entradas existentes.

## Executar os testes

`node tests/combo-navigation.cjs` executa 115 verificações da versão corrigida. A execução local de investigação acrescenta sete regressões com os workers originais via `COMBO_BASELINE_DIR`, totalizando 122. Nenhum teste acessa contas ou servidores externos.
