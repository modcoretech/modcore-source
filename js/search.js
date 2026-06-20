import { state } from './state.js';
import { el, createEl, clearEl, setText, toggleModal, showToast } from './dom.js';
import {
  SEARCH_CHUNK_SIZE, BINARY_LIMIT, IMAGE_EXTS, AUDIO_EXTS, VIDEO_EXTS, FONT_EXTS, BINARY_EXTS,
  getFileIconInfo, buildSearchRegex, yieldToMain
} from './utils.js';
import { goToLine } from './viewers.js';
import { openFile } from './tabs.js';

let quickOpenSelected = 0;

export function toggleGlobalSearch() {
  if (!state.zip) { showToast('Open a CRX file first'); return; }
  const isOpen = !el.globalSearchPanel.classList.contains('translate-x-full');
  if (isOpen) {
    el.globalSearchPanel.classList.add('translate-x-full');
  } else {
    el.globalSearchPanel.classList.remove('translate-x-full');
    setTimeout(() => el.globalSearchInput.focus(), 200);
  }
}

export async function performGlobalSearch() {
  const query = el.globalSearchInput.value;
  if (!query || query.length < 2) {
    clearEl(el.globalSearchResults);
    el.globalSearchResults.appendChild(createEl('div', {
      className: 'flex flex-col items-center justify-center h-32 text-mc-text2',
      children: [
        createEl('i', { className: 'fa-solid fa-magnifying-glass text-xl mb-2' }),
        createEl('p', { className: 'text-[10px]', textContent: 'Type to search across all files' })
      ]
    }));
    el.globalSearchStats.classList.add('hidden');
    return;
  }

  const caseSensitive = el.searchCaseSensitive.checked;
  const useRegex = el.searchRegex.checked;
  const wholeWord = el.searchWholeWord.checked;

  clearEl(el.globalSearchResults);
  el.globalSearchStats.classList.remove('hidden');
  setText('globalSearchStats', 'Searching...');

  const results = [];
  const files = Object.keys(state.fileMap).sort();
  const regex = buildSearchRegex(query, caseSensitive, useRegex, wholeWord);
  if (!regex) {
    setText('globalSearchStats', 'Invalid regex');
    return;
  }

  let processed = 0;
  for (let i = 0; i < files.length; i += SEARCH_CHUNK_SIZE) {
    const chunk = files.slice(i, i + SEARCH_CHUNK_SIZE);
    await Promise.all(chunk.map(async (path) => {
      const file = state.fileMap[path];
      const ext = path.split('.').pop().toLowerCase();
      if (IMAGE_EXTS.has(ext) || AUDIO_EXTS.has(ext) || VIDEO_EXTS.has(ext) || FONT_EXTS.has(ext) || BINARY_EXTS.has(ext)) return;

      const sizeData = file._data;
      const size = sizeData ? (sizeData.uncompressedSize || 0) : 0;
      if (size > BINARY_LIMIT) return;

      try {
        const content = await file.async('string');
        const lines = content.split('\n');
        lines.forEach((line, lineNum) => {
          if (regex.test(line)) {
            const matchIndex = line.search(regex);
            results.push({ path, line: lineNum + 1, text: line.trim(), column: matchIndex });
          }
        });
      } catch (_) { /* skip unreadable */ }
    }));
    processed += chunk.length;
    setText('globalSearchStats', `Searched ${processed}/${files.length} files...`);
    await yieldToMain();
  }

  renderGlobalSearchResults(results, query);
}

function renderGlobalSearchResults(results, query) {
  clearEl(el.globalSearchResults);
  setText('globalSearchStats', `${results.length} results in ${new Set(results.map(r => r.path)).size} files`);

  if (results.length === 0) {
    el.globalSearchResults.appendChild(createEl('div', {
      className: 'flex flex-col items-center justify-center h-32 text-mc-text2',
      children: [
        createEl('i', { className: 'fa-solid fa-circle-xmark text-xl mb-2' }),
        createEl('p', { className: 'text-[10px]', textContent: 'No results found' })
      ]
    }));
    return;
  }

  const byFile = {};
  results.forEach(r => { (byFile[r.path] = byFile[r.path] || []).push(r); });

  Object.keys(byFile).sort().forEach(path => {
    const fileResults = byFile[path];
    const name = path.split('/').pop();
    const iconInfo = getFileIconInfo(name, false);

    const fileSection = createEl('div', { className: 'mb-1' });
    const header = createEl('div', {
      className: 'px-3 py-1.5 text-[11px] font-medium text-mc-text2 hover:text-mc-text hover:bg-mc-bg2 cursor-pointer flex items-center gap-1.5 sticky top-0 bg-mc-bg z-10',
      onClick: () => openFile(path)
    });
    header.appendChild(createEl('i', { className: `${iconInfo.cls} text-[10px]` }));
    header.appendChild(createEl('span', { className: 'truncate', textContent: path }));
    header.appendChild(createEl('span', { className: 'ml-auto text-[10px] text-mc-text2', textContent: `${fileResults.length}` }));
    fileSection.appendChild(header);

    fileResults.forEach(r => {
      const row = createEl('div', {
        className: 'px-4 py-1.5 hover:bg-mc-bg2 cursor-pointer text-[11px] mono flex items-start gap-2 group',
        onClick: () => { openFile(path); goToLine(r.line, r.column); }
      });
      row.appendChild(createEl('span', { className: 'text-mc-text2 w-8 text-right flex-shrink-0', textContent: r.line }));
      const textSpan = createEl('span', { className: 'text-mc-text2 truncate' });
      const before = r.text.substring(0, r.column);
      const match = r.text.substring(r.column, r.column + query.length);
      const after = r.text.substring(r.column + query.length);
      if (before) textSpan.appendChild(document.createTextNode(before));
      const mark = createEl('mark', { className: 'rounded px-0.5', style: { backgroundColor: 'var(--text-secondary)', color: 'var(--text-primary)' }, textContent: match });
      textSpan.appendChild(mark);
      if (after) textSpan.appendChild(document.createTextNode(after));
      row.appendChild(textSpan);
      fileSection.appendChild(row);
    });

    el.globalSearchResults.appendChild(fileSection);
  });
}

export function openQuickOpen() {
  if (!state.zip) { showToast('Open a CRX file first'); return; }
  toggleModal('quickOpenModal', true);
  quickOpenSelected = 0;
  updateQuickOpen();
}

export function updateQuickOpen() {
  const query = el.quickOpenInput.value.toLowerCase().trim();
  clearEl(el.quickOpenResults);

  let files = state.quickOpenIndex;
  if (query) {
    files = files.filter(f => {
      const name = f.path.split('/').pop().toLowerCase();
      return name.includes(query) || f.path.toLowerCase().includes(query);
    });
    files.sort((a, b) => {
      const an = a.path.split('/').pop().toLowerCase();
      const bn = b.path.split('/').pop().toLowerCase();
      const aq = an.startsWith(query) ? 2 : an.includes(query) ? 1 : 0;
      const bq = bn.startsWith(query) ? 2 : bn.includes(query) ? 1 : 0;
      return bq - aq;
    });
  }

  if (files.length === 0) {
    el.quickOpenResults.appendChild(createEl('div', { className: 'px-4 py-3 text-xs text-mc-text2 text-center', textContent: 'No files found' }));
    return;
  }

  files.slice(0, 50).forEach((file, idx) => {
    const name = file.path.split('/').pop();
    const dir = file.path.substring(0, file.path.length - name.length - 1);
    const iconInfo = getFileIconInfo(name, false);

    const row = createEl('div', {
      className: `px-4 py-2 cursor-pointer flex items-center gap-2 text-xs transition ${idx === quickOpenSelected ? 'bg-mc-bg3 text-mc-text' : 'text-mc-text2 hover:bg-mc-bg2 hover:text-mc-text'}`,
      onClick: () => { openFile(file.path); toggleModal('quickOpenModal', false); }
    });
    row.dataset.idx = idx;
    row.appendChild(createEl('i', { className: `${iconInfo.cls} w-4 text-center text-[10px]` }));
    row.appendChild(createEl('span', { className: 'truncate', textContent: name }));
    if (dir) row.appendChild(createEl('span', { className: 'ml-auto text-[10px] text-mc-text2 truncate max-w-[200px]', textContent: dir }));
    el.quickOpenResults.appendChild(row);
  });
}

export function handleQuickOpenKey(e) {
  const items = el.quickOpenResults.querySelectorAll('[data-idx]');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    quickOpenSelected = Math.min(quickOpenSelected + 1, items.length - 1);
    updateQuickOpen();
    scrollToQuickOpenItem();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    quickOpenSelected = Math.max(quickOpenSelected - 1, 0);
    updateQuickOpen();
    scrollToQuickOpenItem();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const selected = items[quickOpenSelected];
    if (selected) selected.click();
  } else if (e.key === 'Escape') {
    toggleModal('quickOpenModal', false);
  }
}

export function scrollToQuickOpenItem() {
  const item = el.quickOpenResults.querySelector(`[data-idx="${quickOpenSelected}"]`);
  if (item) item.scrollIntoView({ block: 'nearest' });
}