const accessStatus = document.querySelector('.access-status');
function showStatus(message, error = false) {
  accessStatus.textContent = message;
  accessStatus.classList.toggle('error', error);
}
chrome.runtime.sendMessage({ type: 'combo:get-versions' }).then(result => {
  if (!result?.ok) throw Error('Não foi possível consultar as extensões.');
  const versions = `Browser Read ${result.browserRead} • Combo Vitalício ${result.combo}`;
  showStatus(versions + (result.combo === '1.5.4' ? ' — selecione um produto.' :
    ' — atualize o Combo Vitalício para 1.5.4.'), result.combo !== '1.5.4');
}).catch(error => showStatus(error.message, true));

document.addEventListener('click', async event => {
  const link = event.target.closest('a.card');
  if (!link) return;
  event.preventDefault();
  if (document.body.dataset.opening === 'true') return;
  document.body.dataset.opening = 'true';
  showStatus('Preparando a navegação nas duas extensões…');
  try {
    const tab = await chrome.tabs.getCurrent();
    const result = await chrome.runtime.sendMessage({ type: 'combo:open-product', url: link.href, tabId: tab?.id });
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível preparar o acesso.');
  } catch (error) {
    showStatus('Não foi possível abrir o produto: ' + error.message, true);
  } finally {
    document.body.dataset.opening = 'false';
  }
});
