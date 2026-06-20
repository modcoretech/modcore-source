import { state } from './state.js';

export const el = {};

export function cacheElements() {
  const ids = [
    'fileTree','crxInput','searchBox','dropOverlay','loadingOverlay','loadingMsg',
    'tabsContainer','tabsWrapper','closeAllTabsBtn',
    'monacoHost','mediaViewer','mediaContainer',
    'audioViewer','audioPlayer','audioFileName','audioIcon',
    'videoViewer','videoPlayer',
    'binaryViewer','binaryIcon','binaryLabel','binarySize','binaryDownloadBtn',
    'markdownViewer','markdownContent',
    'statsPanel','statsContent',
    'welcomeScreen','noFileSelected',
    'editorToolbar','filePathDisplay','statusMsg','statusDot',
    'cursorLine','cursorCol','selectionInfo','langDisplay',
    'fileInfoPanel','infoSize','infoType','infoPath','infoLines',
    'exportBtn','copyFileBtn','downloadFileBtn','unminifyBtn',
    'markdownPreviewBtn','markdownPreviewText','wrapBtn',
    'zoomIn','zoomOut','resetZoom','zoomLevelDisplay','rotateImage',
    'heroUploadBtn','contextMenu',
    'ctxOpen','ctxCopyPath','ctxCopyName','ctxDownload',
    'toast','toastMsg','toastIcon',
    'treePlaceholder','sidebarMeta','fileCountLabel','collapseAllBtn',
    'statsBtn','manifestBtn','loadedFileName','searchFilesBtn',
    'globalSearchPanel','globalSearchInput','globalSearchResults','globalSearchStats',
    'closeGlobalSearch','searchCaseSensitive','searchRegex','searchWholeWord',
    'quickOpenModal','quickOpenInput','quickOpenResults','quickOpenBtn',
    'shortcutsModal','shortcutsContent','shortcutsBtn','closeShortcuts',
    'hexViewer','hexContent','hexDownloadBtn',
    'sidebar','manifestPanel',
    'securityBtn','securityModal','securityContent','closeSecurityModal',
    'aiBtn','aiPanel','aiConsentScreen','aiChatScreen','aiLoadBtn','aiLoadProgress',
    'aiLoadStatus','aiLoadPct','aiLoadBar','aiModelSelect','aiModelBadge',
    'aiMessages','aiInput','aiSendBtn','aiUseFileBtn','aiClearChat',
    'aiContextBar','aiContextFile','aiClearContext','closeAiPanel',
  ];
  ids.forEach(id => { el[id] = document.getElementById(id); });
}

export function createEl(tag, opts = {}) {
  const e = document.createElement(tag);
  if (opts.className) e.className = opts.className;
  if (opts.textContent !== undefined) e.textContent = opts.textContent;
  if (opts.title) e.title = opts.title;
  if (opts.id) e.id = opts.id;
  if (opts.src !== undefined) e.src = opts.src;
  if (opts.alt !== undefined) e.alt = opts.alt;
  if (opts.attrs) Object.entries(opts.attrs).forEach(([k,v]) => e.setAttribute(k, v));
  if (opts.style) Object.assign(e.style, opts.style);
  if (opts.children) opts.children.forEach(c => e.appendChild(c));
  if (opts.parent) opts.parent.appendChild(e);
  if (opts.onClick) e.addEventListener('click', opts.onClick);
  if (opts.onKeydown) e.addEventListener('keydown', opts.onKeydown);
  return e;
}

export function clearEl(e) {
  while (e.firstChild) e.removeChild(e.firstChild);
}

export function setText(id, text) {
  const element = el[id];
  if (element) element.textContent = text;
}

export function setLoading(visible, msg = 'Loading...') {
  setText('loadingMsg', msg);
  el.loadingOverlay.classList.toggle('hidden', !visible);
  el.loadingOverlay.classList.toggle('flex', visible);
}

export function setStatus(msg) {
  setText('statusMsg', msg);
  el.statusDot.className = 'w-1.5 h-1.5 rounded-full bg-mc-text2';
}

export function showToast(msg) {
  setText('toastMsg', msg);
  el.toastIcon.className = 'fa-solid fa-check text-mc-text text-xs';
  el.toast.className = 'fixed bottom-5 right-5 px-4 py-2.5 rounded-std bg-mc-bg2 border border-mc-border text-sm font-medium text-mc-text transform transition-all duration-300 z-[100] flex items-center gap-2.5 max-w-xs';
  el.toast.classList.remove('translate-y-16', 'opacity-0');

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.toast.classList.add('translate-y-16', 'opacity-0');
  }, 3000);
}

export function toggleModal(id, show) {
  if (show) {
    el[id].classList.remove('hidden');
    el[id].classList.add('flex');
    const input = el[id].querySelector('input');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
  } else {
    el[id].classList.add('hidden');
    el[id].classList.remove('flex');
  }
}

export function hideAllViewers() {
  const viewers = [
    el.monacoHost, el.mediaViewer, el.audioViewer,
    el.videoViewer, el.binaryViewer, el.markdownViewer,
    el.statsPanel, el.manifestPanel, el.hexViewer,
  ];
  viewers.forEach(v => {
    if (v) v.classList.add('hidden');
  });
  setText('langDisplay', '');
  el.selectionInfo.classList.add('hidden');
}

export function showError(container, msg) {
  if (!container) return;
  clearEl(container);
  container.appendChild(createEl('p', { className: 'text-sm mono text-mc-text', textContent: msg }));
}