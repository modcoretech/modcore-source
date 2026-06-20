import { state, revokeAllBlobs } from './state.js';
import {
  PERMISSIONS_API_URL, BINARY_LIMIT, formatBytes, yieldToMain, parseCrxBuffer, analyzeHostPermission
} from './utils.js';
import { el, cacheElements, createEl, clearEl, setText, setLoading, setStatus, showToast, toggleModal, hideAllViewers } from './dom.js';
import { buildTree, collapseAll, filterTree } from './tree.js';
import { openFile, closeTab, reopenClosedTab, closeAllTabs, renderTabs } from './tabs.js';
import {
  activateTab, saveTabViewState, toggleMarkdownPreview, toggleWordWrap,
  updateZoom, applyZoom, copyContent, downloadCurrentFile, formatCode, goToLine
} from './viewers.js';
import {
  toggleGlobalSearch, performGlobalSearch, openQuickOpen, updateQuickOpen, handleQuickOpenKey
} from './search.js';
import { registerShortcut, buildShortcutsHelp, handleEscape } from './keyboard.js';
import { showManifestPanel } from './manifest.js';
import { showStatsPanel } from './stats.js';
import { initAI } from './ai/ai.js';

window.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  initSplit();
  await Promise.all([loadMonaco(), fetchPermissions()]);
  initEventListeners();
  initKeyboardShortcuts();
  buildShortcutsHelp(el.shortcutsContent);
  initAI();
  setStatus('Ready');
});

function initSplit() {
  if (typeof Split === 'undefined') return;
  Split(['#sidebar', '#mainContent'], {
    sizes: [22, 78],
    minSize: [200, 380],
    gutterSize: 3,
    cursor: 'col-resize',
    gutter: (_index, direction) => {
      const g = document.createElement('div');
      g.className = `gutter gutter-${direction}`;
      return g;
    }
  });
}

async function fetchPermissions() {
  try {
    const res = await fetch(PERMISSIONS_API_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    state.permissionsData = await res.json();
  } catch (e) {
    state.permissionsData = null;
  }
}

async function loadMonaco() {
  return new Promise((resolve) => {
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      monaco.editor.defineTheme('crx-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          // Base
          { token: '', foreground: 'e2e8f0' },
          // Comments
          { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
          { token: 'comment.doc', foreground: '7c8a9a', fontStyle: 'italic' },
          // Keywords
          { token: 'keyword', foreground: 'c792ea' },
          { token: 'keyword.control', foreground: 'c792ea' },
          { token: 'keyword.operator', foreground: '89ddff' },
          // Strings
          { token: 'string', foreground: 'a3e635' },
          { token: 'string.escape', foreground: 'ffcb6b' },
          { token: 'string.template', foreground: 'a3e635' },
          // Numbers
          { token: 'number', foreground: 'f78c6c' },
          { token: 'number.hex', foreground: 'f78c6c' },
          // Types / Classes
          { token: 'type', foreground: 'ffcb6b' },
          { token: 'class', foreground: 'ffcb6b' },
          { token: 'typeParameter', foreground: 'ffcb6b' },
          // Functions
          { token: 'function', foreground: '82aaff' },
          { token: 'method', foreground: '82aaff' },
          // Variables
          { token: 'variable', foreground: 'e2e8f0' },
          { token: 'variable.predefined', foreground: 'c792ea' },
          { token: 'variable.parameter', foreground: 'f0a070' },
          // Constants
          { token: 'constant', foreground: 'f78c6c' },
          { token: 'constant.language', foreground: 'c792ea' },
          // Operators / Punctuation
          { token: 'operator', foreground: '89ddff' },
          { token: 'delimiter', foreground: 'a0aec0' },
          { token: 'delimiter.bracket', foreground: 'c792ea' },
          { token: 'delimiter.parenthesis', foreground: 'a0aec0' },
          // HTML / XML
          { token: 'tag', foreground: 'f07178' },
          { token: 'tag.id', foreground: 'f07178' },
          { token: 'tag.class', foreground: 'f07178' },
          { token: 'attribute.name', foreground: 'ffcb6b' },
          { token: 'attribute.value', foreground: 'a3e635' },
          { token: 'metatag', foreground: 'c792ea' },
          // CSS
          { token: 'attribute.name.css', foreground: '82aaff' },
          { token: 'attribute.value.css', foreground: 'a3e635' },
          { token: 'attribute.value.number.css', foreground: 'f78c6c' },
          { token: 'attribute.value.unit.css', foreground: 'f78c6c' },
          { token: 'string.css', foreground: 'a3e635' },
          // JSON
          { token: 'string.key.json', foreground: '82aaff' },
          { token: 'string.value.json', foreground: 'a3e635' },
          { token: 'number.json', foreground: 'f78c6c' },
          { token: 'keyword.json', foreground: 'c792ea' },
          // Other
          { token: 'regexp', foreground: 'ea80fc' },
          { token: 'namespace', foreground: 'ffcb6b' },
          { token: 'annotation', foreground: 'c792ea' },
          { token: 'decorator', foreground: 'c792ea' },
          { token: 'import', foreground: 'c792ea' },
        ],
        colors: {
          'editor.background': '#121317',
          'editor.foreground': '#e2e8f0',
          'editor.lineHighlightBackground': '#18191D',
          'editor.lineHighlightBorderColor': '#2F3034',
          'editor.selectionBackground': '#3730a360',
          'editor.inactiveSelectionBackground': '#2F303430',
          'editorLineNumber.foreground': '#3a3d45',
          'editorLineNumber.activeForeground': '#6b7280',
          'editorCursor.foreground': '#c792ea',
          'editorWhitespace.foreground': '#2F3034',
          'editorIndentGuide.background1': '#22242a',
          'editorIndentGuide.activeBackground1': '#3a3d45',
          'editorGutter.background': '#121317',
          'editorWidget.background': '#18191D',
          'editorWidget.border': '#2F3034',
          'editorSuggestWidget.background': '#18191D',
          'editorSuggestWidget.border': '#2F3034',
          'editorSuggestWidget.selectedBackground': '#2F303460',
          'editorSuggestWidget.highlightForeground': '#82aaff',
          'editorBracketMatch.background': '#3730a340',
          'editorBracketMatch.border': '#c792ea80',
          'input.background': '#18191D',
          'input.border': '#2F3034',
          'scrollbarSlider.background': '#2F3034aa',
          'scrollbarSlider.hoverBackground': '#6b7280aa',
          'scrollbarSlider.activeBackground': '#6b7280aa',
          'minimap.background': '#121317',
          'minimapSlider.background': '#2F3034aa',
          'breadcrumb.background': '#121317',
          'tab.activeBackground': '#121317',
          'tab.inactiveBackground': '#121317',
          'editorStickyScroll.background': '#121317',
          'editorStickyScrollHover.background': '#18191D',
          'editorOverviewRuler.border': '#2F3034',
          'editorHoverWidget.background': '#18191D',
          'editorHoverWidget.border': '#2F3034',
          'peekView.border': '#2F3034',
          'peekViewEditor.background': '#18191D',
          'peekViewResult.background': '#18191D',
        }
      });

      state.monacoEditor = monaco.editor.create(el.monacoHost, {
        value: '',
        language: 'plaintext',
        theme: 'crx-dark',
        readOnly: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontLigatures: true,
        lineNumbers: 'on',
        minimap: { enabled: true, scale: 1, showSlider: 'mouseover' },
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        automaticLayout: true,
        folding: true,
        bracketPairColorization: { enabled: true },
        renderLineHighlight: 'line',
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderWhitespace: 'none',
        guides: { indentation: true, bracketPairs: 'active' },
        occurrencesHighlight: 'singleFile',
        contextmenu: true,
        padding: { top: 8, bottom: 8 },
        semanticHighlighting: { enabled: true },
        quickSuggestions: false,
        parameterHints: { enabled: false },
        codeLens: false,
        lightbulb: { enabled: monaco.editor.ShowLightbulbIconMode.Off },
        inlineSuggest: { enabled: false },
        stickyScroll: { enabled: true, maxLineCount: 5 },
        inlayHints: { enabled: 'off' },
        hover: { enabled: true, delay: 600 },
        matchBrackets: 'always',
        dragAndDrop: false,
        links: true,
        multiCursorModifier: 'alt',
        roundedSelection: true,
        selectionHighlight: true,
        showFoldingControls: 'mouseover',
        scrollbar: {
          vertical: 'auto',
          horizontal: 'auto',
          useShadows: false,
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
        },
      });

      state.monacoEditor.onDidChangeCursorPosition((e) => {
        setText('cursorLine', e.position.lineNumber);
        setText('cursorCol', e.position.column);
      });

      state.monacoEditor.onDidChangeCursorSelection(() => {
        const sel = state.monacoEditor.getSelection();
        const model = state.monacoEditor.getModel();
        if (!model) return;
        const selectedText = model.getValueInRange(sel);
        if (selectedText.length > 0) {
          setText('selectionInfo', `${selectedText.length} chars selected`);
          el.selectionInfo.classList.remove('hidden');
        } else {
          el.selectionInfo.classList.add('hidden');
        }
      });

      state.monacoLoaded = true;
      resolve();
    });
  });
}

function initEventListeners() {
  el.crxInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadFile(f);
    el.crxInput.value = '';
  });
  el.heroUploadBtn.addEventListener('click', () => el.crxInput.click());

  ['dragenter','dragover','dragleave','drop'].forEach(ev =>
    document.body.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); })
  );
  document.body.addEventListener('dragenter', () => el.dropOverlay.classList.remove('hidden'));
  el.dropOverlay.addEventListener('dragleave', (e) => {
    if (e.target === el.dropOverlay) el.dropOverlay.classList.add('hidden');
  });
  el.dropOverlay.addEventListener('drop', (e) => {
    el.dropOverlay.classList.add('hidden');
    const f = e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  el.exportBtn.addEventListener('click', exportZip);
  el.statsBtn.addEventListener('click', showStatsPanel);
  el.manifestBtn.addEventListener('click', showManifestPanel);
  el.searchFilesBtn.addEventListener('click', toggleGlobalSearch);
  el.shortcutsBtn.addEventListener('click', () => toggleModal('shortcutsModal', true));
  el.closeShortcuts.addEventListener('click', () => toggleModal('shortcutsModal', false));

  el.securityBtn.addEventListener('click', showSecurityReport);
  el.closeSecurityModal.addEventListener('click', () => toggleModal('securityModal', false));

  el.aiBtn.addEventListener('click', toggleAiPanel);
  el.closeAiPanel.addEventListener('click', () => el.aiPanel.classList.add('translate-x-full'));

  el.copyFileBtn.addEventListener('click', copyContent);
  el.downloadFileBtn.addEventListener('click', downloadCurrentFile);
  el.unminifyBtn.addEventListener('click', formatCode);
  el.markdownPreviewBtn.addEventListener('click', toggleMarkdownPreview);
  el.wrapBtn.addEventListener('click', toggleWordWrap);

  el.zoomIn.addEventListener('click', () => updateZoom(0.15));
  el.zoomOut.addEventListener('click', () => updateZoom(-0.15));
  el.resetZoom.addEventListener('click', () => { state.zoomLevel = 1; state.imageRotation = 0; applyZoom(); });
  el.rotateImage.addEventListener('click', () => { state.imageRotation = (state.imageRotation + 90) % 360; applyZoom(); });

  let searchTimer;
  el.searchBox.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => filterTree(e.target.value), 150);
  });
  el.searchBox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { el.searchBox.value = ''; filterTree(''); }
  });

  el.closeGlobalSearch.addEventListener('click', toggleGlobalSearch);
  let globalSearchTimer;
  el.globalSearchInput.addEventListener('input', () => {
    clearTimeout(globalSearchTimer);
    globalSearchTimer = setTimeout(performGlobalSearch, 300);
  });
  [el.searchCaseSensitive, el.searchRegex, el.searchWholeWord].forEach(cb => {
    cb.addEventListener('change', performGlobalSearch);
  });

  el.quickOpenBtn.addEventListener('click', openQuickOpen);
  el.quickOpenInput.addEventListener('input', updateQuickOpen);
  el.quickOpenInput.addEventListener('keydown', handleQuickOpenKey);

  el.closeAllTabsBtn.addEventListener('click', closeAllTabs);
  el.collapseAllBtn.addEventListener('click', collapseAll);

  document.addEventListener('click', () => el.contextMenu.classList.add('hidden'));
  el.contextMenu.addEventListener('click', (e) => e.stopPropagation());

  el.ctxOpen.addEventListener('click', () => { if (state.ctxPath) openFile(state.ctxPath); el.contextMenu.classList.add('hidden'); });
  el.ctxCopyPath.addEventListener('click', () => { if (state.ctxPath) navigator.clipboard.writeText(state.ctxPath); el.contextMenu.classList.add('hidden'); showToast('Path copied'); });
  el.ctxCopyName.addEventListener('click', () => { if (state.ctxPath) navigator.clipboard.writeText(state.ctxPath.split('/').pop()); el.contextMenu.classList.add('hidden'); showToast('Name copied'); });
  el.ctxDownload.addEventListener('click', async () => { el.contextMenu.classList.add('hidden'); if (state.ctxPath) await downloadFile(state.ctxPath); });

  el.binaryDownloadBtn.addEventListener('click', () => { if (state.activeTabPath) downloadFile(state.activeTabPath); });
  el.hexDownloadBtn.addEventListener('click', () => { if (state.activeTabPath) downloadFile(state.activeTabPath); });

  ['quickOpenModal','shortcutsModal','securityModal'].forEach(id => {
    el[id].addEventListener('click', (e) => { if (e.target === el[id]) toggleModal(id, false); });
  });
}

function initKeyboardShortcuts() {
  // Use Alt-based shortcuts to avoid conflicts with browser/OS
  registerShortcut('Alt+O', 'Quick Open file', openQuickOpen);
  registerShortcut('Alt+F', 'Search across files', toggleGlobalSearch);
  registerShortcut('Alt+W', 'Close active tab', () => { if (state.activeTabPath) closeTab(state.activeTabPath); });
  registerShortcut('Alt+Shift+T', 'Reopen closed tab', reopenClosedTab);
  registerShortcut('Alt+B', 'Toggle sidebar', toggleSidebar);
  registerShortcut('Alt+S', 'Show Security Report', showSecurityReport);
  registerShortcut('Alt+A', 'Toggle AI Assistant', toggleAiPanel);
  registerShortcut('Ctrl+/', 'Show keyboard shortcuts', () => toggleModal('shortcutsModal', true));
  registerShortcut('Escape', 'Close panels/modals', handleEscape);

  document.addEventListener('keydown', (e) => {
    const key = e.key;
    const alt = e.altKey;
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // Alt shortcuts (no browser conflicts)
    if (alt && !ctrl && key === 'o') { e.preventDefault(); openQuickOpen(); return; }
    if (alt && !ctrl && key === 'f') { e.preventDefault(); toggleGlobalSearch(); return; }
    if (alt && !ctrl && key === 'w') { e.preventDefault(); if (state.activeTabPath) closeTab(state.activeTabPath); return; }
    if (alt && !ctrl && shift && key === 'T') { e.preventDefault(); reopenClosedTab(); return; }
    if (alt && !ctrl && key === 'b') { e.preventDefault(); toggleSidebar(); return; }
    if (alt && !ctrl && key === 's') { e.preventDefault(); showSecurityReport(); return; }
    if (alt && !ctrl && key === 'a') { e.preventDefault(); toggleAiPanel(); return; }

    // Ctrl shortcuts that don't conflict with browser
    if (ctrl && key === '/') { e.preventDefault(); toggleModal('shortcutsModal', true); return; }

    if (key === 'Escape') { handleEscape(); return; }
  });
}

function toggleSidebar() {
  state.sidebarVisible = !state.sidebarVisible;
  el.sidebar.style.display = state.sidebarVisible ? '' : 'none';
}

function toggleAiPanel() {
  if (!state.zip) { showToast('Open a CRX file first'); return; }
  const isOpen = !el.aiPanel.classList.contains('translate-x-full');
  el.aiPanel.classList.toggle('translate-x-full', isOpen);
}

// ── Security Report ──────────────────────────────────────────────────────────

function showSecurityReport() {
  if (!state.zip) { showToast('Open a CRX file first'); return; }
  toggleModal('securityModal', true);
  renderSecurityReport();
}

function renderSecurityReport() {
  clearEl(el.securityContent);
  const findings = collectSecurityFindings();

  if (findings.length === 0) {
    el.securityContent.appendChild(createEl('div', {
      className: 'flex flex-col items-center justify-center h-32 text-mc-text2',
      children: [
        createEl('i', { className: 'fa-solid fa-shield-check text-2xl mb-2 text-mc-text' }),
        createEl('p', { className: 'text-xs', textContent: 'No obvious issues detected' })
      ]
    }));
    return;
  }

  // Summary bar
  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach(f => { counts[f.severity] = (counts[f.severity] || 0) + 1; });

  const summary = createEl('div', { className: 'flex gap-3 mb-4 flex-wrap' });
  const severityColors = {
    high: 'text-red-400 bg-red-400/10 border-red-400/30',
    medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    low: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    info: 'text-mc-text2 bg-mc-bg2 border-mc-border',
  };
  ['high','medium','low','info'].forEach(sev => {
    if (!counts[sev]) return;
    summary.appendChild(createEl('div', {
      className: `px-3 py-1.5 rounded-lg border text-[11px] font-semibold ${severityColors[sev]}`,
      textContent: `${counts[sev]} ${sev.toUpperCase()}`
    }));
  });
  el.securityContent.appendChild(summary);

  // Group by category
  const byCategory = {};
  findings.forEach(f => { (byCategory[f.category] = byCategory[f.category] || []).push(f); });

  Object.keys(byCategory).forEach(cat => {
    const section = createEl('div', { className: 'mb-4' });
    section.appendChild(createEl('h4', {
      className: 'text-[10px] font-semibold text-mc-text2 uppercase tracking-wider mb-2',
      textContent: cat
    }));
    byCategory[cat].forEach(finding => {
      const card = createEl('div', {
        className: `rounded-lg border p-3 mb-2 ${severityColors[finding.severity]}`,
      });
      const cardHead = createEl('div', { className: 'flex items-start justify-between gap-2 mb-1' });
      cardHead.appendChild(createEl('span', { className: 'text-[11px] font-medium', textContent: finding.title }));
      cardHead.appendChild(createEl('span', {
        className: `text-[9px] font-bold uppercase px-1 py-0.5 rounded border ${severityColors[finding.severity]} flex-shrink-0`,
        textContent: finding.severity
      }));
      card.appendChild(cardHead);
      card.appendChild(createEl('p', { className: 'text-[11px] leading-relaxed opacity-80', textContent: finding.detail }));
      if (finding.value) {
        card.appendChild(createEl('code', {
          className: 'block mt-1 text-[10px] mono opacity-70 truncate',
          textContent: finding.value
        }));
      }
      section.appendChild(card);
    });
    el.securityContent.appendChild(section);
  });
}

function collectSecurityFindings() {
  const findings = [];
  const m = state.manifestData;
  if (!m) return findings;

  // ── Permissions ────────────────────────────────────────────────────────────
  const highRiskPerms = new Set(['<all_urls>','*://*/*','http://*/*','https://*/*','nativeMessaging','debugger','proxy','privacy','history','webRequest','webRequestBlocking','declarativeNetRequestWithHostAccess']);
  const allPerms = [...(m.permissions || []), ...(m.host_permissions || []), ...(m.optional_permissions || [])];

  allPerms.forEach(p => {
    const ps = String(p);
    if (ps === '<all_urls>' || ps === '*://*/*') {
      findings.push({ category: 'Permissions', severity: 'high', title: 'Wildcard host access', detail: 'Extension can read/modify data on all websites.', value: ps });
    } else if (highRiskPerms.has(ps)) {
      findings.push({ category: 'Permissions', severity: 'high', title: `Sensitive permission: ${ps}`, detail: 'This permission grants powerful capabilities that could be abused.', value: ps });
    } else if (ps.includes('*') && ps.includes('://')) {
      const risk = analyzeHostPermission(ps);
      findings.push({ category: 'Permissions', severity: risk.level === 'high' ? 'high' : 'medium', title: 'Broad host permission', detail: risk.description, value: ps });
    }
  });

  // ── Content Security Policy ────────────────────────────────────────────────
  const cspRaw = m.content_security_policy;
  const cspStr = typeof cspRaw === 'object' ? JSON.stringify(cspRaw) : String(cspRaw || '');
  if (!cspRaw) {
    findings.push({ category: 'CSP', severity: 'medium', title: 'No Content Security Policy defined', detail: 'A missing CSP allows inline scripts and arbitrary sources, increasing XSS risk.' });
  } else if (cspStr.includes("'unsafe-eval'")) {
    findings.push({ category: 'CSP', severity: 'high', title: "CSP allows 'unsafe-eval'", detail: "eval() and similar functions are permitted, enabling code injection.", value: cspStr.substring(0, 120) });
  } else if (cspStr.includes("'unsafe-inline'")) {
    findings.push({ category: 'CSP', severity: 'medium', title: "CSP allows 'unsafe-inline'", detail: 'Inline scripts/styles are permitted, weakening XSS protection.', value: cspStr.substring(0, 120) });
  }

  // ── Remote Code ───────────────────────────────────────────────────────────
  if (cspStr && (cspStr.includes('http://') || /script-src[^;]*https?:\/\/(?!cdn\.jsdelivr|cdnjs|fonts\.googleapis)/.test(cspStr))) {
    findings.push({ category: 'Remote Code', severity: 'medium', title: 'CSP permits external script sources', detail: 'Extension may load scripts from remote servers, creating supply-chain risk.', value: cspStr.substring(0, 120) });
  }

  // ── Background / Service Worker ───────────────────────────────────────────
  if (m.background) {
    if (m.background.persistent === true) {
      findings.push({ category: 'Background', severity: 'low', title: 'Persistent background page', detail: 'Manifest v2 persistent background pages consume resources and increase attack surface.' });
    }
    if (m.background.scripts) {
      findings.push({ category: 'Background', severity: 'info', title: 'Background scripts', detail: `${m.background.scripts.length} background script(s) declared.`, value: m.background.scripts.join(', ') });
    }
    if (m.background.service_worker) {
      findings.push({ category: 'Background', severity: 'info', title: 'Service worker', detail: 'Service worker declared for background processing.', value: m.background.service_worker });
    }
  }

  // ── Web Accessible Resources ──────────────────────────────────────────────
  if (m.web_accessible_resources) {
    const war = m.web_accessible_resources;
    const hasWildcard = war.some(r => {
      if (typeof r === 'string') return r.includes('*');
      return (r.matches || []).includes('<all_urls>') || (r.matches || []).includes('*://*/*');
    });
    if (hasWildcard) {
      findings.push({ category: 'Web Accessible Resources', severity: 'medium', title: 'WAR accessible to all websites', detail: 'Extension resources are accessible from any webpage, enabling fingerprinting.' });
    } else {
      findings.push({ category: 'Web Accessible Resources', severity: 'info', title: `${war.length} resource group(s) declared`, detail: 'Check that only necessary files are exposed to web pages.' });
    }
  }

  // ── Content Scripts ───────────────────────────────────────────────────────
  if (m.content_scripts && m.content_scripts.length) {
    const allMatches = m.content_scripts.flatMap(cs => cs.matches || []);
    const broadMatches = allMatches.filter(x => x.includes('*://*/*') || x === '<all_urls>');
    if (broadMatches.length) {
      findings.push({ category: 'Content Scripts', severity: 'medium', title: 'Content scripts injected on all sites', detail: 'Scripts run on every page the user visits, with full DOM access.', value: broadMatches[0] });
    }
    if (m.content_scripts.some(cs => cs.all_frames)) {
      findings.push({ category: 'Content Scripts', severity: 'low', title: 'Content scripts injected in all frames', detail: 'Scripts also run inside iframes, widening the attack surface.' });
    }
  }

  // ── Source code pattern scanning ──────────────────────────────────────────
  const dangerousPatterns = [
    { re: /eval\s*\(/, title: 'Use of eval()', severity: 'high', detail: 'eval() executes arbitrary code and is a common attack vector.' },
    { re: /new\s+Function\s*\(/, title: 'Dynamic function construction', severity: 'high', detail: 'new Function() executes arbitrary code strings at runtime.' },
    { re: /innerHTML\s*=/, title: 'innerHTML assignment', severity: 'medium', detail: 'Direct innerHTML writes can introduce XSS if input is not sanitized.' },
    { re: /document\.write\s*\(/, title: 'document.write()', severity: 'medium', detail: 'document.write() can introduce script injection vulnerabilities.' },
    { re: /chrome\.tabs\.executeScript|scripting\.executeScript/, title: 'Dynamic script injection', severity: 'medium', detail: 'Extension injects scripts into tabs at runtime.' },
    { re: /fetch\s*\(\s*['"`][^'"` ]*https?:\/\//, title: 'External HTTP fetch', severity: 'low', detail: 'Extension makes requests to external servers; verify trustworthiness.' },
    { re: /XMLHttpRequest/, title: 'XMLHttpRequest usage', severity: 'info', detail: 'Extension uses XHR for network requests.' },
    { re: /localStorage|sessionStorage/, title: 'Web storage access', severity: 'info', detail: 'Extension reads/writes browser storage.' },
    { re: /password|passwd|token|api[_-]?key|secret/i, title: 'Potential credential handling', severity: 'low', detail: 'Source code references credential-like terms. Verify no secrets are hardcoded.' },
  ];

  const scanned = {};
  Object.keys(state.fileMap).forEach(path => {
    const ext = path.split('.').pop().toLowerCase();
    if (!['js','mjs','cjs','ts','html','htm'].includes(ext)) return;
    const tab = state.tabs.find(t => t.path === path);
    const content = tab?.content;
    if (!content || typeof content !== 'string') return;

    dangerousPatterns.forEach(({ re, title, severity, detail }) => {
      const key = `${title}:${path}`;
      if (scanned[key]) return;
      if (re.test(content)) {
        scanned[key] = true;
        const lineNum = content.substring(0, content.search(re)).split('\n').length;
        findings.push({
          category: 'Code Patterns',
          severity,
          title,
          detail,
          value: `${path}:${lineNum}`
        });
      }
    });
  });

  return findings;
}

// ── File loading ──────────────────────────────────────────────────────────────

export async function loadFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (!name.endsWith('.crx') && !name.endsWith('.zip')) {
    showToast('Only .crx or .zip files are supported');
    return;
  }

  setLoading(true, 'Parsing archive...');
  await yieldToMain();

  try {
    const buffer = await file.arrayBuffer();
    const zipBuffer = parseCrxBuffer(buffer);

    setLoading(true, 'Extracting files...');
    await yieldToMain();

    state.zip = await JSZip.loadAsync(zipBuffer);

    revokeAllBlobs();
    state.fileMap = {};
    state.tabs = [];
    state.activeTabPath = null;
    state.manifestData = null;
    state.closedTabs = [];
    state.quickOpenIndex = [];
    state.loadedFileName = file.name;
    state.aiAttachments = [];
    state.aiContext = null;

    Object.keys(state.zip.files).forEach(path => {
      const entry = state.zip.files[path];
      if (!entry.dir) state.fileMap[path] = entry;
    });

    const fileCount = Object.keys(state.fileMap).length;

    if (state.fileMap['manifest.json']) {
      try {
        const txt = await state.fileMap['manifest.json'].async('string');
        state.manifestData = JSON.parse(txt);
      } catch (_) { state.manifestData = null; }
    }

    Object.keys(state.fileMap).sort().forEach(path => {
      state.quickOpenIndex.push({ path });
    });

    buildTree();
    renderTabs();

    el.treePlaceholder.classList.add('hidden');
    el.sidebarMeta.classList.remove('hidden');
    setText('fileCountLabel', `${fileCount} files`);
    el.welcomeScreen.classList.add('hidden');
    el.noFileSelected.classList.remove('hidden');
    el.fileInfoPanel.classList.add('hidden');

    el.exportBtn.classList.remove('hidden');
    el.exportBtn.classList.add('flex');
    el.statsBtn.classList.remove('hidden');
    el.statsBtn.classList.add('flex');
    el.searchFilesBtn.classList.remove('hidden');
    el.searchFilesBtn.classList.add('flex');
    el.securityBtn.classList.remove('hidden');
    el.securityBtn.classList.add('flex');
    el.aiBtn.classList.remove('hidden');
    el.aiBtn.classList.add('flex');

    setText('loadedFileName', file.name);
    el.loadedFileName.classList.remove('hidden');

    if (state.manifestData) {
      el.manifestBtn.classList.remove('hidden');
      el.manifestBtn.classList.add('flex');
    }

    setStatus(`Loaded ${fileCount} files`);
    showToast(`Loaded ${fileCount} files`);

    if (state.fileMap['manifest.json']) openFile('manifest.json');

    // Rebuild modAI context with full manifest
    import('./ai/ai.js').then(m => {
      if (m.buildExtensionContext) m.buildExtensionContext();
    }).catch(() => {});

  } catch (err) {
    showToast('Failed to parse archive');
    setStatus('Error');
  } finally {
    setLoading(false);
  }
}

export async function downloadFile(path) {
  const file = state.fileMap[path];
  if (!file) return;
  try {
    const blob = await file.async('blob');
    const url = URL.createObjectURL(blob);
    const a = createEl('a', { attrs: { href: url, download: path.split('/').pop() } });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Downloading...');
  } catch (e) {
    showToast('Download failed');
  }
}

export async function exportZip() {
  if (!state.zip) return showToast('No file loaded');
  setLoading(true, 'Preparing ZIP...');
  try {
    const blob = await state.zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url = URL.createObjectURL(blob);
    const baseName = state.loadedFileName.replace(/\.crx$/i, '').replace(/\.zip$/i, '') || 'archive';
    const a = createEl('a', { attrs: { href: url, download: `${baseName}_extracted.zip` } });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('ZIP exported');
  } catch (e) {
    showToast('Export failed');
  } finally {
    setLoading(false);
  }
}
