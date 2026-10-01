document.addEventListener('click', async event => {
  const link = event.target.closest('a.card');
  if (!link) return;
  event.preventDefault();
  if (document.body.dataset.opening === 'true') return;
  document.body.dataset.opening = 'true';
  const footer = document.querySelector('.footer');
  footer.textContent = 'Preparando acesso ao produto…';
  try {
    const tab = await chrome.tabs.getCurrent();
    const result = await chrome.runtime.sendMessage({ type: 'combo:open-product', url: link.href, tabId: tab?.id });
    if (!result?.ok) throw new Error(result?.error || 'Não foi possível preparar o acesso.');
  } catch (error) {
    footer.textContent = error.message;
  } finally {
    document.body.dataset.opening = 'false';
  }
});
