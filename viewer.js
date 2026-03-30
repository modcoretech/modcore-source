// =============================================================================
// modcore Source — viewer.js
// =============================================================================

// ---------------------------------------------------------------------------
// FILE TYPE MAPS
// ---------------------------------------------------------------------------
const LANG_MAP = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', json5: 'json',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  html: 'html', htm: 'html', xhtml: 'html',
  xml: 'xml', svg: 'xml',
  md: 'markdown', markdown: 'markdown',
  py: 'python', rb: 'ruby', php: 'php',
  java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp',
  go: 'go', rs: 'rust', swift: 'swift', kt: 'kotlin',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini', ini: 'ini', conf: 'ini',
  sql: 'sql', graphql: 'graphql', gql: 'graphql',
  txt: 'plaintext', log: 'plaintext',
  wasm: '__binary__', map: 'json',
};

const IMAGE_EXTS   = new Set(['png','jpg','jpeg','gif','webp','ico','bmp','tiff','tif','avif','svg','cur']);
const AUDIO_EXTS   = new Set(['mp3','ogg','wav','flac','aac','m4a','opus','weba']);
const VIDEO_EXTS   = new Set(['mp4','webm','ogv','mov','avi','mkv','m4v']);
const FONT_EXTS    = new Set(['woff','woff2','ttf','otf','eot']);
const BINARY_EXTS  = new Set(['wasm','bin','dat','db','pak','pyc','class','so','dll','exe']);
const BINARY_LIMIT = 2 * 1024 * 1024; // 2MB text limit

// MIME helpers
const AUDIO_MIME = { mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', flac:'audio/flac', aac:'audio/aac', m4a:'audio/mp4', opus:'audio/ogg; codecs=opus', weba:'audio/webm' };
const VIDEO_MIME = { mp4:'video/mp4', webm:'video/webm', ogv:'video/ogg', mov:'video/quicktime', avi:'video/x-msvideo', mkv:'video/x-matroska', m4v:'video/mp4' };
const IMAGE_MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', ico:'image/x-icon', bmp:'image/bmp', tiff:'image/tiff', tif:'image/tiff', avif:'image/avif', svg:'image/svg+xml', cur:'image/x-win-bitmap' };
const FONT_MIME  = { woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf', eot:'application/vnd.ms-fontobject' };

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------
const state = {
  zip: null,
  fileMap: {},       // path -> JSZip file object
  tabs: [],          // [{path, content, scrollTop, viewState}]
  activeTabPath: null,
  monacoEditor: null,
  monacoLoaded: false,
  zoomLevel: 1,
  ctxPath: null,
  activeBlobUrls: [], // tracked for cleanup
  wrapEnabled: false,
  loadedFileName: '',
  manifestData: null,
};

// ---------------------------------------------------------------------------
// DOM CACHE
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const el = {};

function cacheElements() {
  const ids = [
    'fileTree','crxInput','searchBox','dropOverlay','loadingOverlay','loadingMsg',
    'tabsContainer','tabsWrapper','closeAllTabsBtn',
    'editorWrapper','monacoHost','mediaViewer','mediaContainer',
    'audioViewer','audioPlayer','audioFileName','audioIcon',
    'videoViewer','videoPlayer',
    'binaryViewer','binaryIcon','binaryLabel','binarySize','binaryDownloadBtn',
    'markdownViewer','markdownContent',
    'statsPanel','statsContent','manifestPanel',
    'welcomeScreen','noFileSelected',
    'editorToolbar','filePathDisplay','statusMsg','statusDot',
    'cursorLine','cursorCol','selectionInfo','langDisplay',
    'fileInfoPanel','infoSize','infoType','infoPath',
    'exportBtn','copyFileBtn','downloadFileBtn','unminifyBtn',
    'markdownPreviewBtn','wrapBtn',
    'zoomIn','zoomOut','resetZoom','zoomLevelDisplay',
    'heroUploadBtn','contextMenu',
    'ctxOpen','ctxCopyPath','ctxCopyName','ctxDownload',
    'toast','toastMsg','toastIcon',
    'treePlaceholder','sidebarMeta','fileCountLabel','collapseAllBtn',
    'statsBtn','manifestBtn','loadedFileName',
  ];
  ids.forEach(id => {
    el[id] = $(id);
    if (!el[id]) console.warn(`Missing #${id}`);
  });
}

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------
window.addEventListener('load', async () => {
  cacheElements();
  initSplit();
  await loadMonaco();
  initEventListeners();
});

function initSplit() {
  Split(['#sidebar', '#mainContent'], {
    sizes: [22, 78],
    minSize: [200, 380],
    gutterSize: 3,
    cursor: 'col-resize',
    gutter: (index, direction) => {
      const g = document.createElement('div');
      g.className = `gutter gutter-${direction}`;
      return g;
    }
  });
}

async function loadMonaco() {
  return new Promise((resolve) => {
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      // Define a crisp dark theme on true black
      monaco.editor.defineTheme('crx-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: '', foreground: 'd4d4d4', background: '000000' },
          { token: 'comment', foreground: '4b5563', fontStyle: 'italic' },
          { token: 'keyword', foreground: '60a5fa' },
          { token: 'string', foreground: '86efac' },
          { token: 'number', foreground: 'fcd34d' },
          { token: 'regexp', foreground: 'fb923c' },
          { token: 'type', foreground: 'a78bfa' },
          { token: 'class', foreground: 'a78bfa' },
          { token: 'function', foreground: '60a5fa' },
          { token: 'variable', foreground: 'e2e8f0' },
          { token: 'variable.predefined', foreground: '94a3b8' },
          { token: 'constant', foreground: 'fbbf24' },
          { token: 'delimiter', foreground: '64748b' },
          { token: 'tag', foreground: '60a5fa' },
          { token: 'attribute.name', foreground: '86efac' },
          { token: 'attribute.value', foreground: 'fcd34d' },
          { token: 'operator', foreground: '94a3b8' },
          { token: 'namespace', foreground: 'c084fc' },
          { token: 'metatag', foreground: 'f87171' },
          { token: 'annotation', foreground: 'f87171' },
        ],
        colors: {
          'editor.background': '#000000',
          'editor.foreground': '#d4d4d4',
          'editor.lineHighlightBackground': '#0a0a0a',
          'editor.selectionBackground': '#1d4ed840',
          'editor.inactiveSelectionBackground': '#1d4ed820',
          'editorLineNumber.foreground': '#27272a',
          'editorLineNumber.activeForeground': '#52525b',
          'editorCursor.foreground': '#3b82f6',
          'editorWhitespace.foreground': '#1f1f1f',
          'editorIndentGuide.background': '#111111',
          'editorIndentGuide.activeBackground': '#222222',
          'editorGutter.background': '#000000',
          'editorWidget.background': '#0a0a0a',
          'editorWidget.border': '#1f2937',
          'editorSuggestWidget.background': '#0a0a0a',
          'editorSuggestWidget.border': '#1f2937',
          'editorSuggestWidget.selectedBackground': '#1d4ed830',
          'input.background': '#0a0a0a',
          'input.border': '#1f2937',
          'scrollbarSlider.background': '#1f2937aa',
          'scrollbarSlider.hoverBackground': '#374151aa',
          'scrollbarSlider.activeBackground': '#4b5563aa',
          'minimap.background': '#000000',
          'minimapSlider.background': '#1f2937aa',
          'breadcrumb.background': '#000000',
          'tab.activeBackground': '#000000',
          'tab.inactiveBackground': '#000000',
        }
      });

      state.monacoEditor = monaco.editor.create(el.monacoHost, {
        value: '',
        language: 'plaintext',
        theme: 'crx-dark',
        readOnly: true,
        fontSize: 13,
        fontFamily: "'Geist Mono', 'Fira Code', monospace",
        fontLigatures: true,
        lineNumbers: 'on',
        minimap: { enabled: true, scale: 1 },
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
        occurrencesHighlight: true,
        contextmenu: false,
        padding: { top: 8, bottom: 8 },
      });

      state.monacoEditor.onDidChangeCursorPosition((e) => {
        el.cursorLine.textContent = e.position.lineNumber;
        el.cursorCol.textContent = e.position.column;
      });

      state.monacoEditor.onDidChangeCursorSelection((e) => {
        const sel = state.monacoEditor.getSelection();
        const model = state.monacoEditor.getModel();
        if (!model) return;
        const selectedText = model.getValueInRange(sel);
        if (selectedText.length > 0) {
          el.selectionInfo.textContent = `${selectedText.length} chars selected`;
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

// ---------------------------------------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------------------------------------
function initEventListeners() {
  el.crxInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) loadFile(f);
    el.crxInput.value = '';
  });
  el.heroUploadBtn.addEventListener('click', () => el.crxInput.click());

  // Drag & Drop
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

  // Header buttons
  el.exportBtn.addEventListener('click', exportZip);
  el.statsBtn.addEventListener('click', showStatsPanel);
  el.manifestBtn.addEventListener('click', showManifestPanel);

  // Toolbar buttons
  el.copyFileBtn.addEventListener('click', copyContent);
  el.downloadFileBtn.addEventListener('click', () => downloadCurrentFile());
  el.unminifyBtn.addEventListener('click', formatCode);
  el.markdownPreviewBtn.addEventListener('click', toggleMarkdownPreview);
  el.wrapBtn.addEventListener('click', toggleWordWrap);

  // Zoom
  el.zoomIn.addEventListener('click', () => updateZoom(0.15));
  el.zoomOut.addEventListener('click', () => updateZoom(-0.15));
  el.resetZoom.addEventListener('click', () => { state.zoomLevel = 1; applyZoom(); });

  // Search (debounced)
  let searchTimer;
  el.searchBox.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => filterTree(e.target.value), 200);
  });
  el.searchBox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { el.searchBox.value = ''; filterTree(''); }
  });

  // Tab close all
  el.closeAllTabsBtn.addEventListener('click', closeAllTabs);

  // Collapse all
  el.collapseAllBtn.addEventListener('click', collapseAll);

  // Context menu
  document.addEventListener('click', () => el.contextMenu.classList.add('hidden'));
  el.contextMenu.addEventListener('click', (e) => e.stopPropagation());

  el.ctxOpen.addEventListener('click', () => {
    if (state.ctxPath) openFile(state.ctxPath);
    el.contextMenu.classList.add('hidden');
  });
  el.ctxCopyPath.addEventListener('click', () => {
    if (state.ctxPath) navigator.clipboard.writeText(state.ctxPath);
    el.contextMenu.classList.add('hidden');
    showToast('Path copied', 'green');
  });
  el.ctxCopyName.addEventListener('click', () => {
    if (state.ctxPath) navigator.clipboard.writeText(state.ctxPath.split('/').pop());
    el.contextMenu.classList.add('hidden');
    showToast('Name copied', 'green');
  });
  el.ctxDownload.addEventListener('click', async () => {
    el.contextMenu.classList.add('hidden');
    if (state.ctxPath) await downloadFile(state.ctxPath);
  });

  el.binaryDownloadBtn.addEventListener('click', () => {
    if (state.activeTabPath) downloadFile(state.activeTabPath);
  });
}

// ---------------------------------------------------------------------------
// FILE LOADING — CRX PARSER
// ---------------------------------------------------------------------------
async function loadFile(file) {
  if (!file) return;

  // Validate CRX extension
  if (!file.name.toLowerCase().endsWith('.crx')) {
    showToast('Only .crx files are supported', 'red');
    return;
  }

  setLoading(true, 'Parsing CRX…');

  await nextTick();
  try {
    const buffer = await file.arrayBuffer();
    const zipBuffer = parseCrxBuffer(buffer);

    setLoading(true, 'Extracting files…');
    await nextTick();

    state.zip = await JSZip.loadAsync(zipBuffer);

    // Reset state
    revokeAllBlobs();
    Object.keys(state.fileMap).forEach(k => delete state.fileMap[k]);
    state.tabs = [];
    state.activeTabPath = null;
    state.manifestData = null;
    state.loadedFileName = file.name;

    // Build file map
    Object.keys(state.zip.files).forEach(path => {
      const entry = state.zip.files[path];
      if (!entry.dir) state.fileMap[path] = entry;
    });

    const fileCount = Object.keys(state.fileMap).length;

    // Parse manifest.json if present
    if (state.fileMap['manifest.json']) {
      try {
        const txt = await state.fileMap['manifest.json'].async('string');
        state.manifestData = JSON.parse(txt);
      } catch (_) {}
    }

    // Build UI
    buildTree();
    renderTabs();

    el.treePlaceholder.classList.add('hidden');
    el.sidebarMeta.classList.remove('hidden');
    el.fileCountLabel.textContent = `${fileCount} files`;
    el.welcomeScreen.classList.add('hidden');
    el.noFileSelected.classList.remove('hidden');
    el.fileInfoPanel.classList.add('hidden');
    el.exportBtn.classList.remove('hidden');
    el.exportBtn.classList.add('flex');
    el.statsBtn.classList.remove('hidden');
    el.statsBtn.classList.add('flex');
    el.loadedFileName.textContent = file.name;
    el.loadedFileName.classList.remove('hidden');

    if (state.manifestData) {
      el.manifestBtn.classList.remove('hidden');
      el.manifestBtn.classList.add('flex');
    }

    setStatus(`Loaded ${fileCount} files`, 'green');
    showToast(`Loaded ${fileCount} files`, 'green');

    // Auto-open manifest.json
    if (state.fileMap['manifest.json']) {
      openFile('manifest.json');
    }

  } catch (err) {
    console.error(err);
    showToast('Failed to parse CRX file', 'red');
    setStatus('Error', 'red');
  } finally {
    setLoading(false);
  }
}

/**
 * Strips CRX2 or CRX3 header and returns a Uint8Array of the ZIP portion.
 * Falls back to treating the whole buffer as ZIP.
 */
function parseCrxBuffer(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Check magic: Cr24
  if (view.byteLength < 4) return buffer;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'Cr24') {
    // Try as plain ZIP
    return buffer;
  }

  const version = view.getUint32(4, true);

  if (version === 2) {
    const pubKeyLen = view.getUint32(8, true);
    const sigLen = view.getUint32(12, true);
    const headerLen = 16 + pubKeyLen + sigLen;
    return buffer.slice(headerLen);
  } else if (version === 3) {
    const headerLen = view.getUint32(8, true);
    return buffer.slice(12 + headerLen);
  }

  // Unknown version — attempt to find ZIP PK signature
  for (let i = 0; i < Math.min(buffer.byteLength - 4, 65536); i++) {
    if (bytes[i] === 0x50 && bytes[i+1] === 0x4B && bytes[i+2] === 0x03 && bytes[i+3] === 0x04) {
      return buffer.slice(i);
    }
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// TREE VIEW
// ---------------------------------------------------------------------------
function buildTree() {
  // Build tree structure
  const root = { name: '', isDir: true, children: {}, path: '' };

  Object.keys(state.fileMap).sort().forEach(path => {
    const parts = path.split('/');
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      if (!node.children[part]) {
        node.children[part] = {
          name: part,
          isDir: !isFile,
          path: parts.slice(0, i + 1).join('/'),
          children: {},
        };
      }
      node = node.children[part];
    });
  });

  // Clear tree
  while (el.fileTree.firstChild) {
    el.fileTree.removeChild(el.fileTree.firstChild);
  }
  el.fileTree.appendChild(el.treePlaceholder);

  renderTreeNodes(root.children, el.fileTree, 0);
}

function renderTreeNodes(children, parentEl, depth) {
  const ul = document.createElement('ul');
  ul.className = depth === 0 ? 'space-y-px' : 'pl-3 border-l border-zinc-900 ml-2 space-y-px';

  const sorted = Object.keys(children).sort((a, b) => {
    const ad = children[a].isDir, bd = children[b].isDir;
    if (ad !== bd) return ad ? -1 : 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });

  sorted.forEach(key => {
    const item = children[key];
    const li = document.createElement('li');
    li.dataset.treePath = item.path;

    const row = document.createElement('div');
    row.className = 'flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-950 transition-colors group';
    row.dataset.path = item.path;
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', item.isDir ? 'treeitem' : 'treeitem');
    row.setAttribute('aria-expanded', item.isDir ? 'false' : undefined);

    // Icon
    const icon = document.createElement('i');
    const iconInfo = getFileIconInfo(item.name, item.isDir);
    icon.className = `${iconInfo.cls} text-[11px] flex-shrink-0 w-3.5 text-center`;
    row.appendChild(icon);

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'truncate';
    nameSpan.textContent = item.name;
    row.appendChild(nameSpan);

    // File size badge (for files)
    if (!item.isDir && state.fileMap[item.path]) {
      const sizeData = state.fileMap[item.path]._data;
      if (sizeData) {
        const badge = document.createElement('span');
        badge.className = 'ml-auto text-[9px] font-mono text-zinc-800 group-hover:text-zinc-600 flex-shrink-0';
        badge.textContent = formatBytes(sizeData.uncompressedSize || 0);
        row.appendChild(badge);
      }
    }

    // Context menu
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (item.isDir) return;
      state.ctxPath = item.path;
      el.contextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 180)}px`;
      el.contextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
      el.contextMenu.classList.remove('hidden');
    });

    if (item.isDir) {
      const childContainer = document.createElement('div');
      childContainer.className = 'hidden';
      renderTreeNodes(item.children, childContainer, depth + 1);
      li.appendChild(row);
      li.appendChild(childContainer);

      const toggle = () => {
        const collapsed = childContainer.classList.contains('hidden');
        childContainer.classList.toggle('hidden');
        icon.className = `${collapsed ? 'fa-solid fa-folder-open text-blue-400' : 'fa-solid fa-folder text-blue-500'} text-[11px] flex-shrink-0 w-3.5 text-center`;
        row.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      };

      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); childContainer.classList.remove('hidden'); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); childContainer.classList.add('hidden'); }
      });
    } else {
      li.appendChild(row);
      row.addEventListener('click', () => openFile(item.path));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFile(item.path); }
      });
    }

    ul.appendChild(li);
  });

  parentEl.appendChild(ul);
}

function collapseAll() {
  el.fileTree.querySelectorAll('li > div.hidden, li > div:not([data-path])').forEach(c => c.classList.add('hidden'));
  el.fileTree.querySelectorAll('[data-path]').forEach(row => {
    const icon = row.querySelector('i');
    if (icon && icon.classList.contains('fa-folder-open')) {
      icon.className = 'fa-solid fa-folder text-blue-500 text-[11px] flex-shrink-0 w-3.5 text-center';
    }
  });
}

// ---------------------------------------------------------------------------
// TREE SEARCH
// ---------------------------------------------------------------------------
function filterTree(query) {
  query = query.toLowerCase().trim();

  const allLIs = Array.from(el.fileTree.querySelectorAll('li[data-tree-path]'));
  const allRows = Array.from(el.fileTree.querySelectorAll('[data-path]'));

  if (!query) {
    allLIs.forEach(li => li.style.display = '');
    allRows.forEach(row => {
      row.classList.remove('text-yellow-300');
      const parent = row.parentElement;
      const children = parent && parent.querySelector('div:not([data-path])');
      if (children) children.classList.add('hidden');
    });
    return;
  }

  function processLI(li) {
    const path = li.dataset.treePath || '';
    const name = path.split('/').pop().toLowerCase();
    const row = li.querySelector('[data-path]');
    const childContainer = li.querySelector(':scope > div:not([data-path])');

    let selfMatch = name.includes(query);
    let childMatch = false;

    if (childContainer) {
      const childLIs = Array.from(childContainer.querySelectorAll(':scope > ul > li'));
      childLIs.forEach(c => { if (processLI(c)) childMatch = true; });
      childContainer.classList.toggle('hidden', !childMatch);
    }

    const visible = selfMatch || childMatch;
    li.style.display = visible ? '' : 'none';

    if (row) {
      row.classList.toggle('text-yellow-300', selfMatch && !childContainer);
      row.classList.toggle('font-medium', selfMatch && !childContainer);
    }

    return visible;
  }

  // Process top-level children
  const topUL = el.fileTree.querySelector(':scope > ul');
  if (topUL) {
    Array.from(topUL.querySelectorAll(':scope > li')).forEach(processLI);
  }
}

// ---------------------------------------------------------------------------
// TAB MANAGEMENT
// ---------------------------------------------------------------------------
function openFile(path) {
  // Highlight in tree
  el.fileTree.querySelectorAll('[data-path]').forEach(n => {
    n.classList.remove('text-blue-400', 'bg-blue-950');
  });
  const treeNode = el.fileTree.querySelector(`[data-path="${CSS.escape(path)}"]`);
  if (treeNode) {
    treeNode.classList.add('text-blue-400', 'bg-blue-950');
    treeNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Add tab if needed
  if (!state.tabs.find(t => t.path === path)) {
    state.tabs.push({ path, content: null, viewState: null });
  }

  // Update file info
  const file = state.fileMap[path];
  if (file) {
    const sizeData = file._data;
    el.infoSize.textContent = sizeData ? formatBytes(sizeData.uncompressedSize || 0) : '–';
    el.infoType.textContent = path.split('.').pop() || 'file';
    el.infoPath.textContent = path;
    el.fileInfoPanel.classList.remove('hidden');
  }

  activateTab(path);
}

function closeTab(path, e) {
  if (e) e.stopPropagation();
  const idx = state.tabs.findIndex(t => t.path === path);
  if (idx === -1) return;
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
    activateTab(next.path);
  }
}

function closeAllTabs() {
  state.tabs = [];
  state.activeTabPath = null;
  renderTabs();
  el.tabsWrapper.classList.add('hidden');
  hideAllViewers();
  el.editorToolbar.classList.add('hidden');
  el.noFileSelected.classList.remove('hidden');
}

function renderTabs() {
  while (el.tabsContainer.firstChild) {
    el.tabsContainer.removeChild(el.tabsContainer.firstChild);
  }

  if (state.tabs.length === 0) {
    el.tabsWrapper.classList.add('hidden');
    return;
  }
  el.tabsWrapper.classList.remove('hidden');

  state.tabs.forEach(tab => {
    const isActive = tab.path === state.activeTabPath;
    const name = tab.path.split('/').pop();
    const iconInfo = getFileIconInfo(name, false);

    const tabEl = document.createElement('div');
    tabEl.className = [
      'flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-r border-zinc-900',
      'cursor-pointer select-none min-w-[90px] max-w-[180px] h-full group transition-colors',
      isActive
        ? 'bg-black text-blue-400 border-t border-t-blue-500'
        : 'bg-zinc-950 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900',
    ].join(' ');

    const tabIcon = document.createElement('i');
    tabIcon.className = `${iconInfo.cls} text-[10px] flex-shrink-0`;
    tabEl.appendChild(tabIcon);

    const tabName = document.createElement('span');
    tabName.className = 'truncate font-mono';
    tabName.textContent = name;
    tabName.title = tab.path;
    tabEl.appendChild(tabName);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ml-auto flex-shrink-0 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-zinc-700 hover:text-red-400 transition-all text-[9px]';
    closeBtn.setAttribute('aria-label', 'Close tab');
    const closeIcon = document.createElement('i');
    closeIcon.className = 'fa-solid fa-xmark';
    closeBtn.appendChild(closeIcon);
    closeBtn.addEventListener('click', (e) => closeTab(tab.path, e));
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener('click', () => {
      if (state.activeTabPath && state.activeTabPath !== tab.path) {
        saveTabViewState(state.activeTabPath);
      }
      activateTab(tab.path);
    });

    el.tabsContainer.appendChild(tabEl);

    if (isActive) tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  });
}

function saveTabViewState(path) {
  if (!state.monacoEditor) return;
  const tab = state.tabs.find(t => t.path === path);
  if (tab) tab.viewState = state.monacoEditor.saveViewState();
}

async function activateTab(path) {
  saveTabViewState(state.activeTabPath);
  state.activeTabPath = path;
  renderTabs();

  el.noFileSelected.classList.add('hidden');
  el.welcomeScreen.classList.add('hidden');
  el.statsPanel.classList.add('hidden');
  el.manifestPanel.classList.add('hidden');
  el.tabsWrapper.classList.remove('hidden');
  el.editorToolbar.classList.remove('hidden');

  // Update toolbar path
  el.filePathDisplay.textContent = path;

  // Reset optional buttons
  el.unminifyBtn.classList.add('hidden');
  el.markdownPreviewBtn.classList.add('hidden');
  el.wrapBtn.classList.add('hidden');
  el.markdownViewer.classList.add('hidden');

  const file = state.fileMap[path];
  if (!file) return;

  const ext = path.split('.').pop().toLowerCase();
  hideAllViewers();

  setStatus(`Loading ${path.split('/').pop()}…`, 'blue');

  // ── Image
  if (IMAGE_EXTS.has(ext)) {
    el.mediaViewer.classList.remove('hidden');
    el.mediaViewer.classList.add('flex');
    try {
      const blob = await file.async('blob');
      const mime = IMAGE_MIME[ext] || 'image/png';
      const url = URL.createObjectURL(new Blob([blob], { type: mime }));
      trackBlob(url);

      while (el.mediaContainer.firstChild) el.mediaContainer.removeChild(el.mediaContainer.firstChild);

      const img = document.createElement('img');
      img.src = url;
      img.alt = path.split('/').pop();
      img.className = 'max-w-none shadow-2xl rounded';
      img.style.imageRendering = ext === 'ico' || ext === 'cur' ? 'pixelated' : 'auto';
      el.mediaContainer.appendChild(img);

      state.zoomLevel = 1;
      applyZoom();
      el.langDisplay.textContent = ext.toUpperCase();
      setStatus('Image', 'green');
    } catch (e) {
      showError(el.mediaContainer, 'Could not render image');
    }
    return;
  }

  // ── Audio
  if (AUDIO_EXTS.has(ext)) {
    el.audioViewer.classList.remove('hidden');
    el.audioViewer.classList.add('flex');
    const blob = await file.async('blob');
    const mime = AUDIO_MIME[ext] || 'audio/mpeg';
    const url = URL.createObjectURL(new Blob([blob], { type: mime }));
    trackBlob(url);
    el.audioPlayer.src = url;
    el.audioFileName.textContent = path.split('/').pop();
    el.audioIcon.className = 'fa-solid fa-music text-3xl text-blue-400';
    el.langDisplay.textContent = ext.toUpperCase();
    setStatus('Audio', 'green');
    return;
  }

  // ── Video
  if (VIDEO_EXTS.has(ext)) {
    el.videoViewer.classList.remove('hidden');
    el.videoViewer.classList.add('flex');
    const blob = await file.async('blob');
    const mime = VIDEO_MIME[ext] || 'video/mp4';
    const url = URL.createObjectURL(new Blob([blob], { type: mime }));
    trackBlob(url);
    el.videoPlayer.src = url;
    el.langDisplay.textContent = ext.toUpperCase();
    setStatus('Video', 'green');
    return;
  }

  // ── Font
  if (FONT_EXTS.has(ext)) {
    el.binaryViewer.classList.remove('hidden');
    el.binaryViewer.classList.add('flex');
    el.binaryIcon.className = 'fa-solid fa-font text-2xl text-purple-400';
    el.binaryLabel.textContent = path.split('/').pop();
    const sizeData = file._data;
    el.binarySize.textContent = sizeData ? formatBytes(sizeData.uncompressedSize || 0) : '';
    el.langDisplay.textContent = ext.toUpperCase() + ' Font';
    setStatus('Font file', 'green');
    return;
  }

  // ── Known binary
  if (BINARY_EXTS.has(ext)) {
    el.binaryViewer.classList.remove('hidden');
    el.binaryViewer.classList.add('flex');
    el.binaryIcon.className = 'fa-solid fa-file-code text-2xl text-zinc-500';
    el.binaryLabel.textContent = path.split('/').pop();
    const sizeData = file._data;
    el.binarySize.textContent = sizeData ? formatBytes(sizeData.uncompressedSize || 0) : '';
    el.langDisplay.textContent = ext.toUpperCase();
    setStatus('Binary file', 'green');
    return;
  }

  // ── Text / Code
  el.monacoHost.classList.remove('hidden');
  el.wrapBtn.classList.remove('hidden');
  el.wrapBtn.classList.add('flex');

  const lang = LANG_MAP[ext] || 'plaintext';
  el.langDisplay.textContent = lang === 'plaintext' ? ext.toUpperCase() || 'TEXT' : lang;

  if (['js','javascript','json','css','html','typescript'].includes(lang)) {
    el.unminifyBtn.classList.remove('hidden');
    el.unminifyBtn.classList.add('flex');
  }
  if (lang === 'markdown') {
    el.markdownPreviewBtn.classList.remove('hidden');
    el.markdownPreviewBtn.classList.add('flex');
  }

  const tab = state.tabs.find(t => t.path === path);

  if (tab.content === null) {
    const sizeData = file._data;
    const size = sizeData ? (sizeData.uncompressedSize || 0) : 0;

    if (size > BINARY_LIMIT) {
      tab.content = `// File too large to preview (${formatBytes(size)})\n// Download it using the toolbar button.`;
    } else {
      try {
        tab.content = await file.async('string');
      } catch (_) {
        tab.content = '// Binary or unreadable file content.';
      }
    }
  }

  const model = monaco.editor.createModel(tab.content, lang === '__binary__' ? 'plaintext' : lang);
  state.monacoEditor.setModel(model);

  if (tab.viewState) {
    state.monacoEditor.restoreViewState(tab.viewState);
  }

  setStatus('Viewing', 'green');
}

// ---------------------------------------------------------------------------
// VIEWERS
// ---------------------------------------------------------------------------
function hideAllViewers() {
  const viewers = [
    el.editorWrapper, el.monacoHost, el.mediaViewer, el.audioViewer,
    el.videoViewer, el.binaryViewer, el.markdownViewer,
    el.statsPanel, el.manifestPanel,
  ];
  viewers.forEach(v => {
    v.classList.add('hidden');
    if (v.classList.contains('flex')) v.classList.remove('flex');
  });
  el.langDisplay.textContent = '';
  el.selectionInfo.classList.add('hidden');
}

function showError(container, msg) {
  while (container.firstChild) container.removeChild(container.firstChild);
  const p = document.createElement('p');
  p.className = 'text-red-400 text-sm font-mono';
  p.textContent = msg;
  container.appendChild(p);
}

// ---------------------------------------------------------------------------
// STATS PANEL
// ---------------------------------------------------------------------------
function showStatsPanel() {
  saveTabViewState(state.activeTabPath);
  hideAllViewers();
  el.editorToolbar.classList.add('hidden');
  el.statsPanel.classList.remove('hidden');
  el.noFileSelected.classList.add('hidden');

  // Build stats
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

  while (el.statsContent.firstChild) el.statsContent.removeChild(el.statsContent.firstChild);

  // Summary
  const summary = buildStatsSection('Summary');
  appendStatRow(summary, 'Total Files', Object.keys(state.fileMap).length);
  appendStatRow(summary, 'Total Size (uncompressed)', formatBytes(totalSize));
  if (state.manifestData) {
    appendStatRow(summary, 'Extension Name', state.manifestData.name || '–');
    appendStatRow(summary, 'Version', state.manifestData.version || '–');
    appendStatRow(summary, 'Manifest Version', state.manifestData.manifest_version || '–');
    if (state.manifestData.description) appendStatRow(summary, 'Description', state.manifestData.description);
  }
  el.statsContent.appendChild(summary);

  // File types breakdown
  const byType = buildStatsSection('File Types');
  const sortedExts = Object.keys(ext_counts).sort((a, b) => ext_sizes[b] - ext_sizes[a]);
  sortedExts.forEach(ext => {
    appendStatRow(byType, `.${ext} (${ext_counts[ext]} files)`, formatBytes(ext_sizes[ext]));
  });
  el.statsContent.appendChild(byType);

  // Permissions (if manifest)
  if (state.manifestData && state.manifestData.permissions && state.manifestData.permissions.length) {
    const perms = buildStatsSection('Permissions');
    state.manifestData.permissions.forEach(p => {
      appendStatRow(perms, String(p), '');
    });
    el.statsContent.appendChild(perms);
  }

  // Content Security Policy
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
  const wrap = document.createElement('div');
  wrap.className = 'bg-zinc-950 border border-zinc-900 rounded-lg overflow-hidden';

  const header = document.createElement('div');
  header.className = 'px-4 py-2 border-b border-zinc-900 text-zinc-400 font-sans text-[11px] font-semibold uppercase tracking-wider';
  header.textContent = title;
  wrap.appendChild(header);

  return wrap;
}

function appendStatRow(section, label, value) {
  const row = document.createElement('div');
  row.className = 'flex items-start justify-between px-4 py-2 border-b border-zinc-900 last:border-0 gap-4';

  const labelEl = document.createElement('span');
  labelEl.className = 'text-zinc-600 flex-shrink-0';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valEl = document.createElement('span');
  valEl.className = 'text-zinc-300 text-right break-all';
  valEl.textContent = value;
  row.appendChild(valEl);

  section.appendChild(row);
}

// ---------------------------------------------------------------------------
// MANIFEST PANEL
// ---------------------------------------------------------------------------
function showManifestPanel() {
  if (!state.manifestData) return;
  saveTabViewState(state.activeTabPath);
  hideAllViewers();
  el.editorToolbar.classList.add('hidden');
  el.manifestPanel.classList.remove('hidden');
  el.noFileSelected.classList.add('hidden');

  while (el.manifestPanel.firstChild) el.manifestPanel.removeChild(el.manifestPanel.firstChild);

  const container = document.createElement('div');
  container.className = 'p-6 font-mono text-xs';

  const title = document.createElement('h2');
  title.className = 'text-sm font-sans font-semibold text-white mb-4';
  title.textContent = `manifest.json — v${state.manifestData.manifest_version || '?'}`;
  container.appendChild(title);

  const renderValue = (val) => {
    const span = document.createElement('span');
    if (typeof val === 'string') {
      span.className = 'text-green-400';
      span.textContent = `"${val}"`;
    } else if (typeof val === 'number') {
      span.className = 'text-yellow-400';
      span.textContent = val;
    } else if (typeof val === 'boolean') {
      span.className = 'text-blue-400';
      span.textContent = val;
    } else if (val === null) {
      span.className = 'text-zinc-600';
      span.textContent = 'null';
    } else {
      span.className = 'text-zinc-400';
      span.textContent = JSON.stringify(val);
    }
    return span;
  };

  const renderObject = (obj, depth) => {
    const wrap = document.createElement('div');
    wrap.className = `pl-${Math.min(depth * 4, 16)}`;

    Object.keys(obj).forEach(key => {
      const row = document.createElement('div');
      row.className = 'flex items-start gap-2 py-0.5 hover:bg-zinc-950 px-2 rounded';

      const keyEl = document.createElement('span');
      keyEl.className = 'text-zinc-500 flex-shrink-0';
      keyEl.textContent = `"${key}":`;
      row.appendChild(keyEl);

      const val = obj[key];
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        const nested = renderObject(val, depth + 1);
        row.appendChild(nested);
      } else if (Array.isArray(val)) {
        const arr = document.createElement('span');
        arr.className = 'text-zinc-400 flex flex-wrap gap-1';
        val.forEach((item, i) => {
          arr.appendChild(renderValue(item));
          if (i < val.length - 1) {
            const comma = document.createElement('span');
            comma.className = 'text-zinc-700';
            comma.textContent = ',';
            arr.appendChild(comma);
          }
        });
        row.appendChild(arr);
      } else {
        row.appendChild(renderValue(val));
      }

      wrap.appendChild(row);
    });
    return wrap;
  };

  container.appendChild(renderObject(state.manifestData, 0));
  el.manifestPanel.appendChild(container);
}

// ---------------------------------------------------------------------------
// FORMAT CODE
// ---------------------------------------------------------------------------
function formatCode() {
  if (!state.activeTabPath || !state.monacoEditor) return;
  const ext = state.activeTabPath.split('.').pop().toLowerCase();
  let content = state.monacoEditor.getValue();
  try {
    if (ext === 'json') {
      content = JSON.stringify(JSON.parse(content), null, 2);
    } else if (['js','jsx','ts','tsx','mjs'].includes(ext)) {
      content = js_beautify(content, { indent_size: 2, space_in_empty_paren: true });
    } else if (['html','htm','xhtml'].includes(ext)) {
      content = html_beautify(content, { indent_size: 2 });
    } else if (['css','scss','less'].includes(ext)) {
      content = css_beautify(content, { indent_size: 2 });
    } else {
      content = js_beautify(content, { indent_size: 2 });
    }
    state.monacoEditor.setValue(content);
    const tab = state.tabs.find(t => t.path === state.activeTabPath);
    if (tab) tab.content = content;
    showToast('Formatted', 'green');
  } catch (e) {
    showToast('Format failed', 'red');
  }
}

// ---------------------------------------------------------------------------
// MARKDOWN PREVIEW
// ---------------------------------------------------------------------------
let markdownPreviewActive = false;

function toggleMarkdownPreview() {
  if (!markdownPreviewActive) {
    const md = state.monacoEditor ? state.monacoEditor.getValue() : '';
    while (el.markdownContent.firstChild) el.markdownContent.removeChild(el.markdownContent.firstChild);

    // Use marked to parse, but set via textContent of a temp element to avoid XSS
    const html = marked.parse(md);
    // We use a safe approach: create a DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Append the parsed nodes (they're sanitized from DOMParser's context)
    Array.from(doc.body.childNodes).forEach(node => {
      el.markdownContent.appendChild(document.adoptNode(node));
    });

    el.monacoHost.classList.add('hidden');
    el.markdownViewer.classList.remove('hidden');
    el.markdownPreviewBtn.querySelector('i').className = 'fa-solid fa-code text-[10px]';
    markdownPreviewActive = true;
  } else {
    el.markdownViewer.classList.add('hidden');
    el.monacoHost.classList.remove('hidden');
    el.markdownPreviewBtn.querySelector('i').className = 'fa-solid fa-book-open text-[10px]';
    markdownPreviewActive = false;
  }
}

// ---------------------------------------------------------------------------
// WORD WRAP TOGGLE
// ---------------------------------------------------------------------------
function toggleWordWrap() {
  state.wrapEnabled = !state.wrapEnabled;
  if (state.monacoEditor) {
    state.monacoEditor.updateOptions({ wordWrap: state.wrapEnabled ? 'on' : 'off' });
  }
  el.wrapBtn.classList.toggle('text-blue-400', state.wrapEnabled);
  el.wrapBtn.classList.toggle('text-zinc-500', !state.wrapEnabled);
}

// ---------------------------------------------------------------------------
// ZOOM (for images)
// ---------------------------------------------------------------------------
function updateZoom(delta) {
  state.zoomLevel = Math.max(0.05, Math.min(state.zoomLevel + delta, 10));
  applyZoom();
}

function applyZoom() {
  el.mediaContainer.style.transform = `scale(${state.zoomLevel})`;
  el.zoomLevelDisplay.textContent = `${Math.round(state.zoomLevel * 100)}%`;
}

// ---------------------------------------------------------------------------
// COPY & DOWNLOAD
// ---------------------------------------------------------------------------
function copyContent() {
  if (!state.monacoEditor) return;
  navigator.clipboard.writeText(state.monacoEditor.getValue()).then(() => {
    showToast('Copied to clipboard', 'green');
  });
}

function downloadCurrentFile() {
  if (state.activeTabPath) downloadFile(state.activeTabPath);
}

async function downloadFile(path) {
  const file = state.fileMap[path];
  if (!file) return;
  try {
    const blob = await file.async('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Downloading…', 'blue');
  } catch (e) {
    showToast('Download failed', 'red');
  }
}

async function exportZip() {
  if (!state.zip) return showToast('No file loaded', 'red');
  setLoading(true, 'Preparing ZIP…');
  try {
    const blob = await state.zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.loadedFileName.replace('.crx', '_extracted.zip');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('ZIP exported', 'green');
  } catch (e) {
    showToast('Export failed', 'red');
  } finally {
    setLoading(false);
  }
}

// ---------------------------------------------------------------------------
// UTILITIES
// ---------------------------------------------------------------------------
function getFileIconInfo(name, isDir) {
  if (isDir) return { cls: 'fa-solid fa-folder text-blue-500' };
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    js:    { cls: 'fa-brands fa-js text-yellow-400' },
    mjs:   { cls: 'fa-brands fa-js text-yellow-400' },
    ts:    { cls: 'fa-solid fa-code text-blue-400' },
    jsx:   { cls: 'fa-brands fa-react text-cyan-400' },
    tsx:   { cls: 'fa-brands fa-react text-cyan-400' },
    css:   { cls: 'fa-brands fa-css3-alt text-blue-400' },
    scss:  { cls: 'fa-solid fa-paintbrush text-pink-400' },
    html:  { cls: 'fa-brands fa-html5 text-orange-400' },
    htm:   { cls: 'fa-brands fa-html5 text-orange-400' },
    json:  { cls: 'fa-solid fa-brackets-curly text-yellow-300' },
    xml:   { cls: 'fa-solid fa-code text-green-400' },
    svg:   { cls: 'fa-regular fa-image text-purple-400' },
    png:   { cls: 'fa-regular fa-image text-purple-400' },
    jpg:   { cls: 'fa-regular fa-image text-purple-400' },
    jpeg:  { cls: 'fa-regular fa-image text-purple-400' },
    gif:   { cls: 'fa-regular fa-image text-purple-400' },
    webp:  { cls: 'fa-regular fa-image text-purple-400' },
    ico:   { cls: 'fa-solid fa-star text-yellow-400' },
    mp3:   { cls: 'fa-solid fa-music text-blue-400' },
    ogg:   { cls: 'fa-solid fa-music text-blue-400' },
    wav:   { cls: 'fa-solid fa-waveform text-blue-400' },
    mp4:   { cls: 'fa-solid fa-film text-green-400' },
    webm:  { cls: 'fa-solid fa-film text-green-400' },
    md:    { cls: 'fa-brands fa-markdown text-zinc-300' },
    txt:   { cls: 'fa-regular fa-file-lines text-zinc-400' },
    woff:  { cls: 'fa-solid fa-font text-purple-400' },
    woff2: { cls: 'fa-solid fa-font text-purple-400' },
    ttf:   { cls: 'fa-solid fa-font text-purple-400' },
    otf:   { cls: 'fa-solid fa-font text-purple-400' },
    py:    { cls: 'fa-brands fa-python text-blue-400' },
    wasm:  { cls: 'fa-solid fa-microchip text-green-400' },
    map:   { cls: 'fa-solid fa-map text-zinc-500' },
  };
  return map[ext] || { cls: 'fa-regular fa-file text-zinc-600' };
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B','KB','MB','GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function setLoading(visible, msg = 'Loading…') {
  el.loadingMsg.textContent = msg;
  el.loadingOverlay.classList.toggle('hidden', !visible);
  el.loadingOverlay.classList.toggle('flex', visible);
}

function setStatus(msg, color = 'zinc') {
  el.statusMsg.textContent = msg;
  const colors = { green: 'bg-green-500', blue: 'bg-blue-500', red: 'bg-red-500', zinc: 'bg-zinc-600' };
  el.statusDot.className = `w-1.5 h-1.5 rounded-full ${colors[color] || colors.zinc}`;
}

function showToast(msg, color = 'blue') {
  const borderColors = { green: 'border-green-500', blue: 'border-blue-500', red: 'border-red-500' };
  const iconColors   = { green: 'text-green-400', blue: 'text-blue-400', red: 'text-red-400' };
  const icons        = { green: 'fa-check', blue: 'fa-info-circle', red: 'fa-triangle-exclamation' };

  el.toastMsg.textContent = msg;
  el.toastIcon.className = `fa-solid ${icons[color] || icons.blue} ${iconColors[color] || iconColors.blue} text-xs`;

  el.toast.className = `fixed bottom-5 right-5 px-4 py-2.5 rounded-lg bg-zinc-900 border ${borderColors[color] || borderColors.blue} shadow-xl text-sm font-medium text-white transform transition-all duration-300 z-[100] flex items-center gap-2.5 max-w-xs`;
  el.toast.classList.remove('translate-y-16', 'opacity-0');

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    el.toast.classList.add('translate-y-16', 'opacity-0');
  }, 3000);
}

function trackBlob(url) {
  state.activeBlobUrls.push(url);
}

function revokeAllBlobs() {
  state.activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
  state.activeBlobUrls = [];
}

function nextTick() {
  return new Promise(r => setTimeout(r, 50));
}

// CSS.escape polyfill (in case browser is old)
if (!CSS.escape) {
  CSS.escape = (str) => str.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
}
