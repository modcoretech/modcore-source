import { el, createEl, clearEl, toggleModal } from './dom.js';
import { state } from './state.js';

export const KEYBOARD_SHORTCUTS = [];

export function registerShortcut(keys, description, handler) {
  KEYBOARD_SHORTCUTS.push({ keys, description, handler });
}

export function buildShortcutsHelp(containerEl) {
  clearEl(containerEl);
  const groups = {};
  KEYBOARD_SHORTCUTS.forEach(s => {
    const g = s.keys.includes('Escape') ? 'Modal' : 'Global';
    (groups[g] = groups[g] || []).push(s);
  });

  Object.keys(groups).forEach(groupName => {
    containerEl.appendChild(createEl('h4', {
      className: 'text-[10px] font-semibold text-mc-text2 uppercase tracking-wider mt-3 mb-2',
      textContent: groupName
    }));
    groups[groupName].forEach(s => {
      const row = createEl('div', { className: 'flex items-center justify-between py-1.5 border-b border-mc-border/50' });
      row.appendChild(createEl('span', { className: 'text-mc-text', textContent: s.description }));
      row.appendChild(createEl('span', { className: 'mono text-[11px] bg-mc-bg3 border border-mc-border rounded px-1.5 py-0.5 text-mc-text2', textContent: s.keys }));
      containerEl.appendChild(row);
    });
  });
}

export function handleEscape() {
  const modals = ['quickOpenModal', 'shortcutsModal', 'securityModal'];
  for (const id of modals) {
    if (el[id] && !el[id].classList.contains('hidden')) {
      toggleModal(id, false);
      return;
    }
  }
  // Close sliding panels
  if (el.globalSearchPanel && !el.globalSearchPanel.classList.contains('translate-x-full')) {
    import('./search.js').then(m => m.toggleGlobalSearch());
    return;
  }
  if (el.aiPanel && !el.aiPanel.classList.contains('translate-x-full')) {
    el.aiPanel.classList.add('translate-x-full');
    return;
  }
}