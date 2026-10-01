const accessStatus = document.querySelector('.access-status');
const EXPECTED_COMBO_VERSION = '1.5.7';
function showStatus(message, error = false) { accessStatus.textContent = message; accessStatus.classList.toggle('error', error); }
chrome.runtime.sendMessage({ type: 'combo:get-versions' }).then(result => {
  if (!result?.ok) throw Error('Não foi possível consultar as extensões.');
  const versions = `Browser Read ${result.browserRead} • Combo Vitalício ${result.combo}`;
  showStatus(versions + (result.combo === EXPECTED_COMBO_VERSION ? ' — selecione um produto.' :
    ` — atualize o Combo Vitalício para ${EXPECTED_COMBO_VERSION}.`), result.combo !== EXPECTED_COMBO_VERSION);
}).catch(error => showStatus(error.message, true));
document.addEventListener('click', async event => {
  const link = event.target.closest('a.card'); if (!link) return; event.preventDefault();
  if (document.body.dataset.opening === 'true') return;
  document.body.dataset.opening = 'true'; showStatus('Criando uma aba de preparação segura…');
  try {
    const tab = await chrome.tabs.getCurrent();
    const result = await chrome.runtime.sendMessage({ type: 'combo:open-product', url: link.href, tabId: tab?.id });
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível preparar o acesso.');
    showStatus(result.reused ? 'A abertura deste produto já está em andamento na aba preparada.' :
      'Aba preparada. Acompanhe a abertura do produto na nova aba.');
  } catch (error) { showStatus('Não foi possível abrir o produto: ' + (error?.message || String(error)), true); }
  finally { document.body.dataset.opening = 'false'; }
});