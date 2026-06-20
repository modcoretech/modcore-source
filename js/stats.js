import { state } from './state.js';
import { el, createEl, clearEl, hideAllViewers } from './dom.js';
import { formatBytes } from './utils.js';
import { saveTabViewState } from './viewers.js';

export function showStatsPanel() {
  saveTabViewState(state.activeTabPath);
  hideAllViewers();
  el.editorToolbar.classList.add('hidden');
  el.statsPanel.classList.remove('hidden');
  el.noFileSelected.classList.add('hidden');

  const ext_counts = {};
  const ext_sizes = {};
  let totalSize = 0;

  Object.keys(state.fileMap).forEach(path => {
    const sizeData = state.fileMap[path]._data;
    const size = sizeData ? (sizeData.uncompressedSize || 0) : 0;
    const ext = path.split('.').pop().toLowerCase() || 'no ext';
    ext_counts[ext] = (ext_counts[ext] || 0) + 1;
    ext_sizes[ext] = (ext_sizes[ext] || 0) + size;
    totalSize += size;
  });

  clearEl(el.statsContent);

  const summary = buildStatsSection('Summary');
  appendStatRow(summary, 'Total Files', Object.keys(state.fileMap).length.toLocaleString());
  appendStatRow(summary, 'Total Size (uncompressed)', formatBytes(totalSize));
  if (state.manifestData) {
    appendStatRow(summary, 'Extension Name', state.manifestData.name || '–');
    appendStatRow(summary, 'Version', state.manifestData.version || '–');
    appendStatRow(summary, 'Manifest Version', state.manifestData.manifest_version || '–');
    if (state.manifestData.description) appendStatRow(summary, 'Description', state.manifestData.description);
  }
  el.statsContent.appendChild(summary);

  const byType = buildStatsSection('File Types');
  const sortedExts = Object.keys(ext_counts).sort((a, b) => ext_sizes[b] - ext_sizes[a]);
  sortedExts.forEach(ext => {
    const barWidth = totalSize > 0 ? (ext_sizes[ext] / totalSize * 100).toFixed(1) : 0;
    const row = appendStatRow(byType, `.${ext} (${ext_counts[ext]} files)`, formatBytes(ext_sizes[ext]));
    const bar = createEl('div', { className: 'h-1 rounded-full mt-1 overflow-hidden', style: { backgroundColor: 'var(--text-secondary)' } });
    bar.appendChild(createEl('div', { className: 'h-full rounded-full', style: { backgroundColor: 'var(--text-primary)', width: `${barWidth}%` } }));
    row.appendChild(bar);
  });
  el.statsContent.appendChild(byType);

  if (state.manifestData && state.manifestData.content_security_policy) {
    const csp = buildStatsSection('Content Security Policy');
    const cspVal = typeof state.manifestData.content_security_policy === 'object'
      ? JSON.stringify(state.manifestData.content_security_policy, null, 2)
      : String(state.manifestData.content_security_policy);
    appendStatRow(csp, 'CSP', cspVal);
    el.statsContent.appendChild(csp);
  }
}

function buildStatsSection(title) {
  const wrap = createEl('div', { className: 'bg-mc-bg2 border border-mc-border rounded-lg overflow-hidden' });
  wrap.appendChild(createEl('div', {
    className: 'px-4 py-2 border-b border-mc-border text-mc-text font-sans text-[11px] font-semibold uppercase tracking-wider',
    textContent: title
  }));
  return wrap;
}

function appendStatRow(section, label, value) {
  const row = createEl('div', { className: 'flex items-start justify-between px-4 py-2 border-b border-mc-border last:border-0 gap-4' });
  row.appendChild(createEl('span', { className: 'text-mc-text2 flex-shrink-0', textContent: label }));
  row.appendChild(createEl('span', { className: 'text-mc-text text-right break-all', textContent: value }));
  section.appendChild(row);
  return row;
}