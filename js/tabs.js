import { state } from './state.js';
import { el, createEl, clearEl, setText, hideAllViewers, showToast } from './dom.js';
import { getFileIconInfo, formatBytes } from './utils.js';
import { activateTab, saveTabViewState } from './viewers.js';

export function openFile(path) {
  el.fileTree.querySelectorAll('[data-path]').forEach(n => {
    n.classList.remove('tree-item-active');
    n.removeAttribute('aria-selected');
  });
  const treeNode = el.fileTree.querySelector(`[data-path="${CSS.escape(path)}"]`);
  if (treeNode) {
    treeNode.classList.add('tree-item-active');
    treeNode.setAttribute('aria-selected', 'true');
    treeNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  if (!state.tabs.find(t => t.path === path)) {
    state.tabs.push({ path, content: null, viewState: null });
  }

  const file = state.fileMap[path];
  if (file) {
    const sizeData = file._data;
    setText('infoSize', sizeData ? formatBytes(sizeData.uncompressedSize || 0) : '–');
    setText('infoType', path.split('.').pop() || 'file');
    setText('infoPath', path);
    el.infoPath.title = path;
    el.fileInfoPanel.classList.remove('hidden');
  }

  saveTabViewState(state.activeTabPath);
  state.activeTabPath = path;
  renderTabs();
  activateTab(path);
}

export function closeTab(path, e) {
  if (e) e.stopPropagation();
  const idx = state.tabs.findIndex(t => t.path === path);
  if (idx === -1) return;

  const tab = state.tabs[idx];
  state.closedTabs.unshift({ path: tab.path, content: tab.content });
  if (state.closedTabs.length > 10) state.closedTabs.pop();

  state.tabs.splice(idx, 1);

  if (state.tabs.length === 0) {
    state.activeTabPath = null;
    renderTabs();
    el.tabsWrapper.classList.add('hidden');
    hideAllViewers();
    el.editorToolbar.classList.add('hidden');
    el.noFileSelected.classList.remove('hidden');
  } else {
    const next = state.tabs[idx] || state.tabs[idx - 1];
    saveTabViewState(state.activeTabPath);
    state.activeTabPath = next.path;
    renderTabs();
    activateTab(next.path);
  }
}

export function reopenClosedTab() {
  if (state.closedTabs.length === 0) { showToast('No recently closed tabs'); return; }
  const tab = state.closedTabs.shift();
  openFile(tab.path);
  showToast('Reopened tab');
}

export function closeAllTabs() {
  state.tabs.forEach(t => state.closedTabs.unshift({ path: t.path, content: t.content }));
  state.tabs = [];
  state.activeTabPath = null;
  renderTabs();
  el.tabsWrapper.classList.add('hidden');
  hideAllViewers();
  el.editorToolbar.classList.add('hidden');
  el.noFileSelected.classList.remove('hidden');
}

export function renderTabs() {
  clearEl(el.tabsContainer);

  if (state.tabs.length === 0) {
    el.tabsWrapper.classList.add('hidden');
    return;
  }
  el.tabsWrapper.classList.remove('hidden');

  state.tabs.forEach(tab => {
    const isActive = tab.path === state.activeTabPath;
    const name = tab.path.split('/').pop();
    const iconInfo = getFileIconInfo(name, false);

    const tabEl = createEl('div', {
      className: [
        'flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-r border-mc-border',
        'cursor-pointer select-none min-w-[90px] max-w-[180px] h-full group transition-colors',
        isActive ? 'bg-mc-bg text-mc-text border-t border-t-mc-text' : 'bg-mc-bg2 text-mc-text2 hover:text-mc-text hover:bg-mc-bg3',
      ].join(' '),
      attrs: { role: 'tab', 'aria-selected': isActive ? 'true' : 'false' }
    });

    tabEl.appendChild(createEl('i', { className: `${iconInfo.cls} text-[10px] flex-shrink-0` }));
    tabEl.appendChild(createEl('span', { className: 'truncate mono', textContent: name, title: tab.path }));

    const closeBtn = createEl('button', {
      className: 'ml-auto flex-shrink-0 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-mc-bg3 hover:text-red-500 transition-all text-[9px]',
      attrs: { 'aria-label': 'Close tab', tabindex: '-1' }
    });
    closeBtn.appendChild(createEl('i', { className: 'fa-solid fa-xmark' }));
    closeBtn.addEventListener('click', (e) => closeTab(tab.path, e));
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => {
      if (state.activeTabPath && state.activeTabPath !== tab.path) {
        saveTabViewState(state.activeTabPath);
      }
      state.activeTabPath = tab.path;
      renderTabs();
      activateTab(tab.path);
    });

    tabEl.addEventListener('mousedown', (e) => {
      if (e.button === 1) { e.preventDefault(); closeTab(tab.path); }
    });

    el.tabsContainer.appendChild(tabEl);
    if (isActive) tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  });
}