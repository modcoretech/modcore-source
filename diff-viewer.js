// =============================================================================
// modcore Source Diff - diff-viewer.js
// =============================================================================

// ---------------------------------------------------------------------------
// FILE TYPE MAPS (inherited from modcore Source)
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

const IMAGE_EXTS  = new Set(['png','jpg','jpeg','gif','webp','ico','bmp','tiff','tif','avif','svg','cur']);
const AUDIO_EXTS  = new Set(['mp3','ogg','wav','flac','aac','m4a','opus','weba']);
const VIDEO_EXTS  = new Set(['mp4','webm','ogv','mov','avi','mkv','m4v']);
const FONT_EXTS   = new Set(['woff','woff2','ttf','otf','eot']);
const BINARY_EXTS = new Set(['wasm','bin','dat','db','pak','pyc','class','so','dll','exe']);
const MEDIA_EXTS  = new Set([...IMAGE_EXTS, ...AUDIO_EXTS, ...VIDEO_EXTS, ...FONT_EXTS]);
const BINARY_LIMIT = 2 * 1024 * 1024;

const IMAGE_MIME = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', ico:'image/x-icon', bmp:'image/bmp', tiff:'image/tiff', tif:'image/tiff', avif:'image/avif', svg:'image/svg+xml', cur:'image/x-win-bitmap' };
const AUDIO_MIME = { mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', flac:'audio/flac', aac:'audio/aac', m4a:'audio/mp4', opus:'audio/ogg; codecs=opus', weba:'audio/webm' };
const VIDEO_MIME = { mp4:'video/mp4', webm:'video/webm', ogv:'video/ogg', mov:'video/quicktime', avi:'video/x-msvideo', mkv:'video/x-matroska', m4v:'video/mp4' };
const FONT_MIME  = { woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf', eot:'application/vnd.ms-fontobject' };

// ---------------------------------------------------------------------------
// DIFF STATUS CONSTANTS
// ---------------------------------------------------------------------------
const STATUS = { ADDED: 'added', REMOVED: 'removed', MODIFIED: 'modified', SAME: 'same' };

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------
const state = {
  pkgA: null,       // { zip, fileMap, manifest, name }
  pkgB: null,       // { zip, fileMap, manifest, name }
  diffMap: {},      // path -> { status, fileA, fileB }
  allPaths: [],     // sorted union of all paths
  activePath: null,
  monacoLoaded: false,
  monacoDiffEditor: null,
  singleEditor: null,
  mediaZoom: 1,
  currentFilter: 'all',
  diffMode: 'side',  // 'side' | 'inline'
  wrapEnabled: false,
  changesOnlyMode: false,
  activeBlobUrls: [],
  currentChanges: [],  // list of diff change objects for navigation
  currentChangeIdx: -1,
};

// ---------------------------------------------------------------------------
// DOM CACHE
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const el = {};

function cacheElements() {
  const ids = [
    'fileTree','diffTree','treePlaceholder',
    'crxInputA','crxInputB','dropZoneA','dropZoneB','heroDiffBtn',
    'searchBox','filterRow','filterCount',
    'sidebarMeta','fileCountLabel','collapseAllBtn',
    'fileStatusPanel','infoStatus','infoSizeA','infoSizeB','infoLines',
    'headerVersions','headerVerA','headerVerB',
    'diffModeToggle','modeSideBySide','modeInline',
    'filterToggle','showChangesOnly',
    'statsBtn','resetBtn',
    'editorToolbar','activeStatusBadge','filePathDisplay',
    'prevChangeBtn','nextChangeBtn','changeCounter','changeSep',
    'formatBtn','wrapBtn','copyDiffBtn',
    'viewerContainer',
    'welcomeScreen','noFileSelected',
    'monacoDiffHost','singleFileViewer','singleFileHeader','singleMonacoHost',
    'mediaDiffViewer','mediaLabelA','mediaLabelB',
    'mediaContainerLeft','mediaContainerRight',
    'mediaSizeLeft','mediaSizeRight',
    'mediaZoomIn','mediaZoomOut','mediaZoomReset','mediaZoomDisplay',
    'binaryDiffViewer',
    'binaryIconLeft','binaryNameLeft','binarySizeLeft',
    'binaryIconRight','binaryNameRight','binarySizeRight','binaryDiffMsg',
    'statsPanel','statsContent',
    'statusDot','statusMsg','diffSummaryBar',
    'diffAddedCount','diffRemovedCount','diffModifiedCount','langDisplay','cursorInfo',
    'contextMenu','ctxDiffFile','ctxViewLeft','ctxViewRight','ctxCopyPath',
    'loadingOverlay','loadingMsg',
    'toast','toastMsg','toastIcon',
    'resizeHandle', 'mainContent', 'sidebar',
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
  await loadMonaco();
  initEventListeners();
  initResizeHandle();
});

// ---------------------------------------------------------------------------
// MONACO SETUP
// ---------------------------------------------------------------------------
async function loadMonaco() {
  return new Promise(resolve => {
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
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
          { token: 'function', foreground: '60a5fa' },
          { token: 'variable', foreground: 'e2e8f0' },
          { token: 'constant', foreground: 'fbbf24' },
          { token: 'delimiter', foreground: '64748b' },
          { token: 'tag', foreground: '60a5fa' },
          { token: 'attribute.name', foreground: '86efac' },
          { token: 'attribute.value', foreground: 'fcd34d' },
          { token: 'operator', foreground: '94a3b8' },
        ],
        colors: {
          'editor.background': '#000000',
          'editor.foreground': '#d4d4d4',
          'editor.lineHighlightBackground': '#0a0a0a',
          'editor.selectionBackground': '#1d4ed840',
          'editorLineNumber.foreground': '#27272a',
          'editorLineNumber.activeForeground': '#52525b',
          'editorCursor.foreground': '#3b82f6',
          'editorGutter.background': '#000000',
          'diffEditor.insertedTextBackground': '#14532d40',
          'diffEditor.removedTextBackground': '#450a0a40',
          'diffEditor.insertedLineBackground': '#14532d30',
          'diffEditor.removedLineBackground': '#450a0a30',
          'diffEditor.diagonalFill': '#1f2937',
          'editorWidget.background': '#0a0a0a',
          'editorWidget.border': '#1f2937',
          'input.background': '#0a0a0a',
          'input.border': '#1f2937',
          'scrollbarSlider.background': '#1f2937aa',
          'minimap.background': '#000000',
        }
      });

      // Diff editor
      state.monacoDiffEditor = monaco.editor.createDiffEditor(el.monacoDiffHost, {
        theme: 'crx-dark',
        readOnly: true,
        fontSize: 13,
        fontFamily: "'Geist Mono', monospace",
        fontLigatures: true,
        lineNumbers: 'on',
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        automaticLayout: true,
        renderSideBySide: true,
        ignoreTrimWhitespace: false,
        originalEditable: false,
        smoothScrolling: true,
        padding: { top: 8, bottom: 8 },
        contextmenu: false,
      });

      // Single file editor (for added / removed)
      state.singleEditor = monaco.editor.create(el.singleMonacoHost, {
        theme: 'crx-dark',
        readOnly: true,
        fontSize: 13,
        fontFamily: "'Geist Mono', monospace",
        fontLigatures: true,
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        automaticLayout: true,
        smoothScrolling: true,
        padding: { top: 8, bottom: 8 },
        contextmenu: false,
      });

      state.singleEditor.onDidChangeCursorPosition(e => {
        el.cursorInfo.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
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
  // File inputs
  el.crxInputA.addEventListener('change', e => { const f = e.target.files[0]; if (f) loadPackage(f, 'A'); el.crxInputA.value = ''; });
  el.crxInputB.addEventListener('change', e => { const f = e.target.files[0]; if (f) loadPackage(f, 'B'); el.crxInputB.value = ''; });

  // Drop zones
  [el.dropZoneA, el.dropZoneB].forEach(zone => {
    zone.addEventListener('click', () => {
      (zone.id === 'dropZoneA' ? el.crxInputA : el.crxInputB).click();
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) loadPackage(f, zone.dataset.side);
    });
  });

  // Also accept global drops
  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', e => { e.preventDefault(); });

  el.heroDiffBtn.addEventListener('click', runDiff);

  // Header controls
  el.modeSideBySide.addEventListener('click', () => setDiffMode('side'));
  el.modeInline.addEventListener('click', () => setDiffMode('inline'));
  el.showChangesOnly.addEventListener('click', toggleChangesOnly);
  el.statsBtn.addEventListener('click', showStatsPanel);
  el.resetBtn.addEventListener('click', resetAll);

  // Toolbar
  el.wrapBtn.addEventListener('click', toggleWrap);
  el.formatBtn.addEventListener('click', formatCurrentFile);
  el.copyDiffBtn.addEventListener('click', copyPatch);
  el.prevChangeBtn.addEventListener('click', () => navigateChange(-1));
  el.nextChangeBtn.addEventListener('click', () => navigateChange(1));

  // Search
  let searchTimer;
  el.searchBox.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => filterDiffTree(e.target.value), 200);
  });
  el.searchBox.addEventListener('keydown', e => {
    if (e.key === 'Escape') { el.searchBox.value = ''; filterDiffTree(''); }
  });

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b === btn));
      applyFilter();
    });
  });

  el.collapseAllBtn.addEventListener('click', collapseAll);

  // Media zoom
  el.mediaZoomIn.addEventListener('click', () => adjustMediaZoom(0.15));
  el.mediaZoomOut.addEventListener('click', () => adjustMediaZoom(-0.15));
  el.mediaZoomReset.addEventListener('click', () => { state.mediaZoom = 1; applyMediaZoom(); });

  // Context menu
  document.addEventListener('click', () => el.contextMenu.classList.add('hidden'));
  el.contextMenu.addEventListener('click', e => e.stopPropagation());
  el.ctxDiffFile.addEventListener('click', () => {
    if (state._ctxPath) openFileDiff(state._ctxPath);
    el.contextMenu.classList.add('hidden');
  });
  el.ctxViewLeft.addEventListener('click', () => {
    if (state._ctxPath) openFileDiff(state._ctxPath, 'A');
    el.contextMenu.classList.add('hidden');
  });
  el.ctxViewRight.addEventListener('click', () => {
    if (state._ctxPath) openFileDiff(state._ctxPath, 'B');
    el.contextMenu.classList.add('hidden');
  });
  el.ctxCopyPath.addEventListener('click', () => {
    if (state._ctxPath) navigator.clipboard.writeText(state._ctxPath);
    el.contextMenu.classList.add('hidden');
    showToast('Path copied', 'green');
  });
}

// ---------------------------------------------------------------------------
// SIDEBAR RESIZE
// ---------------------------------------------------------------------------
function initResizeHandle() {
  let dragging = false, startX = 0, startW = 0;
  el.resizeHandle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = el.sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.max(200, Math.min(600, startW + e.clientX - startX));
    el.sidebar.style.width = newW + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ---------------------------------------------------------------------------
// CRX LOADING
// ---------------------------------------------------------------------------
async function loadPackage(file, side) {
  if (!file.name.toLowerCase().endsWith('.crx')) {
    showToast('Only .crx files are supported', 'red');
    return;
  }

  setLoading(true, `Parsing Package ${side}…`);
  await tick();

  try {
    const buffer = await file.arrayBuffer();
    const zipBuf = parseCrxBuffer(buffer);
    const zip = await JSZip.loadAsync(zipBuf);

    const fileMap = {};
    for (const path of Object.keys(zip.files)) {
      if (!zip.files[path].dir) fileMap[path] = zip.files[path];
    }

    let manifest = null;
    if (fileMap['manifest.json']) {
      try { manifest = JSON.parse(await fileMap['manifest.json'].async('string')); } catch (_) {}
    }

    const pkg = { zip, fileMap, manifest, name: file.name };
    state[`pkg${side}`] = pkg;

    // Update drop zone appearance
    const zone = side === 'A' ? el.dropZoneA : el.dropZoneB;
    zone.classList.add('loaded');
    zone.innerHTML = `
      <div class="w-8 h-8 bg-green-950 rounded-lg flex items-center justify-center">
        <i class="fa-solid fa-check text-sm text-green-500"></i>
      </div>
      <div class="text-center">
        <p class="text-[11px] text-white font-semibold">${file.name}</p>
        <p class="text-[10px] text-zinc-500 font-mono">${Object.keys(fileMap).length} files ${manifest ? `· v${manifest.version || '?'}` : ''}</p>
      </div>
    `;

    // Show Diff button if both loaded
    if (state.pkgA && state.pkgB) {
      el.heroDiffBtn.classList.remove('hidden');
      el.heroDiffBtn.classList.add('flex');
    }

    setStatus(`Package ${side} loaded - ${Object.keys(fileMap).length} files`, 'green');
    showToast(`Package ${side} loaded`, 'green');

  } catch (err) {
    console.error(err);
    showToast(`Failed to load Package ${side}`, 'red');
  } finally {
    setLoading(false);
  }
}

function parseCrxBuffer(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (view.byteLength < 4) return buffer;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'Cr24') return buffer;
  const version = view.getUint32(4, true);
  if (version === 2) {
    const pubLen = view.getUint32(8, true);
    const sigLen = view.getUint32(12, true);
    return buffer.slice(16 + pubLen + sigLen);
  } else if (version === 3) {
    const hLen = view.getUint32(8, true);
    return buffer.slice(12 + hLen);
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// DIFF ENGINE
// ---------------------------------------------------------------------------
async function runDiff() {
  if (!state.pkgA || !state.pkgB) {
    showToast('Load both packages first', 'red');
    return;
  }

  setLoading(true, 'Computing diff…');
  await tick();

  try {
    const pathsA = new Set(Object.keys(state.pkgA.fileMap));
    const pathsB = new Set(Object.keys(state.pkgB.fileMap));
    const allPaths = [...new Set([...pathsA, ...pathsB])].sort();

    state.diffMap = {};
    state.allPaths = allPaths;

    for (const path of allPaths) {
      const inA = pathsA.has(path);
      const inB = pathsB.has(path);

      if (inA && !inB) {
        state.diffMap[path] = { status: STATUS.REMOVED, fileA: state.pkgA.fileMap[path], fileB: null };
      } else if (!inA && inB) {
        state.diffMap[path] = { status: STATUS.ADDED, fileA: null, fileB: state.pkgB.fileMap[path] };
      } else {
        // Both exist - compare hashes
        const bufA = await state.pkgA.fileMap[path].async('uint8array');
        const bufB = await state.pkgB.fileMap[path].async('uint8array');
        const same = arraysEqual(bufA, bufB);
        state.diffMap[path] = {
          status: same ? STATUS.SAME : STATUS.MODIFIED,
          fileA: state.pkgA.fileMap[path],
          fileB: state.pkgB.fileMap[path],
        };
      }
    }

    buildDiffTree();
    showDiffUI();

    const addedC   = allPaths.filter(p => state.diffMap[p].status === STATUS.ADDED).length;
    const removedC = allPaths.filter(p => state.diffMap[p].status === STATUS.REMOVED).length;
    const modC     = allPaths.filter(p => state.diffMap[p].status === STATUS.MODIFIED).length;
    const sameC    = allPaths.filter(p => state.diffMap[p].status === STATUS.SAME).length;

    setStatus(`Diff complete - ${modC} changed, ${addedC} added, ${removedC} removed, ${sameC} same`, 'green');
    showToast('Diff complete', 'green');

    // Status bar summary
    el.diffSummaryBar.classList.remove('hidden');
    el.diffSummaryBar.classList.add('flex');
    el.diffAddedCount.textContent = `+${addedC}`;
    el.diffRemovedCount.textContent = `-${removedC}`;
    el.diffModifiedCount.textContent = `~${modC}`;

    // Header version badges
    const mA = state.pkgA.manifest, mB = state.pkgB.manifest;
    el.headerVerA.textContent = (mA && mA.version) ? `A v${mA.version}` : 'A';
    el.headerVerB.textContent = (mB && mB.version) ? `B v${mB.version}` : 'B';
    el.headerVersions.classList.remove('hidden');
    el.headerVersions.classList.add('flex');

    // Auto-open first changed file
    const firstChanged = allPaths.find(p =>
      state.diffMap[p].status === STATUS.MODIFIED ||
      state.diffMap[p].status === STATUS.ADDED ||
      state.diffMap[p].status === STATUS.REMOVED
    );
    if (firstChanged) openFileDiff(firstChanged);
    else {
      hideAllViewers();
      el.noFileSelected.classList.remove('hidden');
    }

  } catch (err) {
    console.error(err);
    showToast('Diff failed', 'red');
    setStatus('Error', 'red');
  } finally {
    setLoading(false);
  }
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// DIFF UI SETUP
// ---------------------------------------------------------------------------
function showDiffUI() {
  el.treePlaceholder.classList.add('hidden');
  el.diffTree.classList.remove('hidden');
  el.filterRow.classList.remove('hidden');
  el.filterRow.classList.add('flex');
  el.sidebarMeta.classList.remove('hidden');
  el.fileCountLabel.textContent = `${state.allPaths.length} files`;
  el.diffModeToggle.classList.remove('hidden');
  el.diffModeToggle.classList.add('flex');
  el.filterToggle.classList.remove('hidden');
  el.filterToggle.classList.add('flex');
  el.statsBtn.classList.remove('hidden');
  el.statsBtn.classList.add('flex');
  el.resetBtn.classList.remove('hidden');
  el.resetBtn.classList.add('flex');
  el.welcomeScreen.classList.add('hidden');
  el.noFileSelected.classList.remove('hidden');

  updateDiffModeButtons();
  applyFilter();
}

// ---------------------------------------------------------------------------
// DIFF TREE
// ---------------------------------------------------------------------------
function buildDiffTree() {
  el.diffTree.innerHTML = '';

  // Build a virtual folder tree
  const root = { isDir: true, children: {}, name: '', path: '' };

  for (const path of state.allPaths) {
    const parts = path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!node.children[part]) {
        const isDir = i < parts.length - 1;
        node.children[part] = {
          isDir,
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          children: {},
          filePath: isDir ? null : path,
        };
      }
      node = node.children[part];
    }
  }

  renderDiffNodes(root.children, el.diffTree, 0);
}

function getStatusForDir(dirPath) {
  // Returns compound status for a folder
  const relevant = state.allPaths.filter(p => p.startsWith(dirPath + '/') || p === dirPath);
  const statuses = relevant.map(p => state.diffMap[p]?.status);
  if (statuses.includes(STATUS.ADDED)) return STATUS.ADDED;
  if (statuses.includes(STATUS.REMOVED)) return STATUS.REMOVED;
  if (statuses.includes(STATUS.MODIFIED)) return STATUS.MODIFIED;
  return STATUS.SAME;
}

function renderDiffNodes(children, parentEl, depth) {
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

    const status = item.isDir
      ? getStatusForDir(item.path)
      : (state.diffMap[item.filePath]?.status || STATUS.SAME);

    const statusColor = {
      [STATUS.ADDED]:    'diff-added',
      [STATUS.REMOVED]:  'diff-removed',
      [STATUS.MODIFIED]: 'diff-modified',
      [STATUS.SAME]:     'diff-same',
    }[status] || 'diff-same';

    const row = document.createElement('div');
    row.className = `flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs hover:bg-zinc-950 transition-colors group`;
    row.dataset.path = item.path;
    if (item.filePath) row.dataset.filePath = item.filePath;
    row.setAttribute('tabindex', '0');

    // Status dot
    if (!item.isDir) {
      const dot = document.createElement('span');
      dot.className = `w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        status === STATUS.ADDED    ? 'bg-green-500' :
        status === STATUS.REMOVED  ? 'bg-red-500' :
        status === STATUS.MODIFIED ? 'bg-yellow-500' :
                                     'bg-zinc-800'
      }`;
      row.appendChild(dot);
    } else {
      const icon = document.createElement('i');
      icon.className = `fa-solid fa-folder text-blue-500 text-[11px] flex-shrink-0 w-3.5 text-center`;
      icon.dataset.icon = 'folder';
      row.appendChild(icon);
    }

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.className = `truncate ${statusColor}`;
    nameSpan.textContent = item.name;
    row.appendChild(nameSpan);

    // Size delta badge for modified files
    if (!item.isDir && status === STATUS.MODIFIED) {
      const diff = state.diffMap[item.filePath];
      if (diff.fileA && diff.fileB) {
        const sA = diff.fileA._data?.uncompressedSize || 0;
        const sB = diff.fileB._data?.uncompressedSize || 0;
        const delta = sB - sA;
        if (delta !== 0) {
          const badge = document.createElement('span');
          badge.className = `ml-auto text-[9px] font-mono flex-shrink-0 ${delta > 0 ? 'text-green-800' : 'text-red-800'}`;
          badge.textContent = (delta > 0 ? '+' : '') + formatBytes(delta);
          row.appendChild(badge);
        }
      }
    }

    // Status label for added/removed
    if (!item.isDir && (status === STATUS.ADDED || status === STATUS.REMOVED)) {
      const lbl = document.createElement('span');
      lbl.className = `ml-auto text-[9px] font-mono flex-shrink-0 ${status === STATUS.ADDED ? 'text-green-800' : 'text-red-800'}`;
      lbl.textContent = status === STATUS.ADDED ? 'new' : 'del';
      row.appendChild(lbl);
    }

    // Context menu
    row.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (item.isDir) return;
      state._ctxPath = item.filePath;
      const status = state.diffMap[item.filePath]?.status;
      el.ctxViewLeft.style.display = status === STATUS.ADDED ? 'none' : '';
      el.ctxViewRight.style.display = status === STATUS.REMOVED ? 'none' : '';
      el.contextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 160)}px`;
      el.contextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
      el.contextMenu.classList.remove('hidden');
    });

    if (item.isDir) {
      const childContainer = document.createElement('div');
      childContainer.className = 'hidden';
      renderDiffNodes(item.children, childContainer, depth + 1);
      li.appendChild(row);
      li.appendChild(childContainer);

      const toggle = () => {
        const collapsed = childContainer.classList.contains('hidden');
        childContainer.classList.toggle('hidden');
        const icon = row.querySelector('[data-icon="folder"]');
        if (icon) icon.className = `fa-solid ${collapsed ? 'fa-folder-open text-blue-400' : 'fa-folder text-blue-500'} text-[11px] flex-shrink-0 w-3.5 text-center`;
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    } else {
      li.appendChild(row);
      row.addEventListener('click', () => openFileDiff(item.filePath));
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFileDiff(item.filePath); }
      });
    }

    ul.appendChild(li);
  });

  parentEl.appendChild(ul);
}

// ---------------------------------------------------------------------------
// FILTER & SEARCH
// ---------------------------------------------------------------------------
function applyFilter() {
  const allLIs = Array.from(el.diffTree.querySelectorAll('li[data-tree-path]'));
  const filter = state.currentFilter;
  const query = el.searchBox.value.toLowerCase().trim();

  let visible = 0;
  allLIs.forEach(li => {
    const filePath = li.querySelector('[data-file-path]')?.dataset?.filePath ||
                     li.querySelector('[data-path]')?.dataset?.path;
    const isDir = !li.querySelector('[data-file-path]') && li.querySelector('[data-path]');

    if (isDir) return; // Folders handled by their children

    const fp = li.querySelector('[data-file-path]')?.dataset?.filePath;
    if (!fp) return;

    const status = state.diffMap[fp]?.status;
    const nameMatch = !query || fp.toLowerCase().includes(query);
    const filterMatch = filter === 'all' || status === filter;

    const show = nameMatch && filterMatch;
    li.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  // Show/hide parent folders
  el.diffTree.querySelectorAll('li[data-tree-path]').forEach(li => {
    const child = li.querySelector(':scope > div:not([data-path])');
    if (!child) return;
    const hasVisible = Array.from(child.querySelectorAll('li[data-tree-path]')).some(c => c.style.display !== 'none');
    li.style.display = hasVisible ? '' : 'none';
  });

  el.filterCount.textContent = filter !== 'all' ? `${visible}` : '';
}

function filterDiffTree(query) {
  applyFilter();
}

function collapseAll() {
  el.diffTree.querySelectorAll('li > div:not([data-path])').forEach(c => c.classList.add('hidden'));
  el.diffTree.querySelectorAll('[data-icon="folder"]').forEach(i => {
    i.className = 'fa-solid fa-folder text-blue-500 text-[11px] flex-shrink-0 w-3.5 text-center';
  });
}

// ---------------------------------------------------------------------------
// OPEN FILE DIFF
// ---------------------------------------------------------------------------
async function openFileDiff(path, forceView) {
  if (!path || !state.diffMap[path]) return;

  state.activePath = path;
  const diff = state.diffMap[path];

  // Highlight in tree
  el.diffTree.querySelectorAll('[data-path]').forEach(n => n.classList.remove('bg-zinc-900'));
  const treeRow = el.diffTree.querySelector(`[data-file-path="${CSS.escape(path)}"]`);
  if (treeRow) {
    treeRow.classList.add('bg-zinc-900');
    treeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Update file status panel
  const sA = diff.fileA?._data?.uncompressedSize || 0;
  const sB = diff.fileB?._data?.uncompressedSize || 0;
  el.infoSizeA.textContent = diff.fileA ? formatBytes(sA) : '-';
  el.infoSizeB.textContent = diff.fileB ? formatBytes(sB) : '-';
  el.infoStatus.textContent = diff.status.toUpperCase();
  el.infoStatus.className = `font-semibold ${
    diff.status === STATUS.ADDED    ? 'text-green-400' :
    diff.status === STATUS.REMOVED  ? 'text-red-400' :
    diff.status === STATUS.MODIFIED ? 'text-yellow-400' :
                                      'text-zinc-500'
  }`;
  el.fileStatusPanel.classList.remove('hidden');

  // Show toolbar
  el.editorToolbar.classList.remove('hidden');
  el.filePathDisplay.textContent = path;

  // Status badge
  const badgeCfg = {
    [STATUS.ADDED]:    { text: 'ADDED',    cls: 'badge-added' },
    [STATUS.REMOVED]:  { text: 'REMOVED',  cls: 'badge-removed' },
    [STATUS.MODIFIED]: { text: 'MODIFIED', cls: 'badge-modified' },
    [STATUS.SAME]:     { text: 'SAME',     cls: 'badge-same' },
  }[diff.status];
  el.activeStatusBadge.textContent = badgeCfg.text;
  el.activeStatusBadge.className = `px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex-shrink-0 ${badgeCfg.cls}`;

  const ext = path.split('.').pop().toLowerCase();
  const lang = LANG_MAP[ext] || 'plaintext';

  el.langDisplay.textContent = lang === 'plaintext' ? ext.toUpperCase() || 'TEXT' : lang;

  // Reset change navigation
  state.currentChanges = [];
  state.currentChangeIdx = -1;
  el.prevChangeBtn.classList.add('hidden');
  el.nextChangeBtn.classList.add('hidden');
  el.changeCounter.classList.add('hidden');
  el.changeSep.classList.add('hidden');
  el.formatBtn.classList.add('hidden');
  el.copyDiffBtn.classList.add('hidden');
  el.infoLines.textContent = '-';

  // ── SAME file
  if (diff.status === STATUS.SAME && !forceView) {
    hideAllViewers();
    // Show a single read-only view
    el.singleFileViewer.classList.remove('hidden');
    el.singleFileHeader.textContent = `Unchanged - ${path}`;
    el.singleFileHeader.className = 'px-4 py-2 border-b border-zinc-900 flex-shrink-0 text-[10px] font-mono text-zinc-600';
    await loadSingleEditor(diff.fileA || diff.fileB, lang);
    setStatus('Unchanged', 'zinc');
    return;
  }

  // ── MEDIA files
  if (IMAGE_EXTS.has(ext) || AUDIO_EXTS.has(ext) || VIDEO_EXTS.has(ext) || FONT_EXTS.has(ext)) {
    await showMediaDiff(path, diff, ext);
    return;
  }

  // ── BINARY
  if (BINARY_EXTS.has(ext) || lang === '__binary__') {
    showBinaryDiff(path, diff, ext);
    return;
  }

  // ── TEXT / CODE - use Monaco diff editor
  hideAllViewers();
  el.monacoDiffHost.classList.remove('hidden');

  const contentA = diff.fileA ? await readFileText(diff.fileA) : '';
  const contentB = diff.fileB ? await readFileText(diff.fileB) : '';

  const monacoLang = lang === '__binary__' ? 'plaintext' : lang;
  const origModel = monaco.editor.createModel(contentA, monacoLang);
  const modModel  = monaco.editor.createModel(contentB, monacoLang);

  state.monacoDiffEditor.setModel({ original: origModel, modified: modModel });
  state.monacoDiffEditor.updateOptions({
    renderSideBySide: state.diffMode === 'side',
    wordWrap: state.wrapEnabled ? 'on' : 'off',
  });

  // Wait for diff to compute
  await tick();
  await tick();

  // Change navigation
  const changes = state.monacoDiffEditor.getLineChanges() || [];
  state.currentChanges = changes;

  if (changes.length > 0) {
    el.prevChangeBtn.classList.remove('hidden');
    el.prevChangeBtn.classList.add('flex');
    el.nextChangeBtn.classList.remove('hidden');
    el.nextChangeBtn.classList.add('flex');
    el.changeCounter.classList.remove('hidden');
    el.changeSep.classList.remove('hidden');
    updateChangeCounter();
    el.infoLines.textContent = `${changes.length} hunks`;
    el.copyDiffBtn.classList.remove('hidden');
    el.copyDiffBtn.classList.add('flex');
  }

  // Format button for code files
  if (['js','javascript','json','css','html','typescript'].includes(lang)) {
    el.formatBtn.classList.remove('hidden');
    el.formatBtn.classList.add('flex');
  }

  setStatus(diff.status === STATUS.MODIFIED ? `${changes.length} change${changes.length !== 1 ? 's' : ''}` : diff.status, 'green');
}

async function readFileText(file) {
  const sizeData = file._data;
  const size = sizeData ? (sizeData.uncompressedSize || 0) : 0;
  if (size > BINARY_LIMIT) return `// File too large to preview (${formatBytes(size)})`;
  try { return await file.async('string'); } catch (_) { return '// Binary or unreadable content.'; }
}

async function loadSingleEditor(file, lang) {
  if (!file) return;
  const content = await readFileText(file);
  const monacoLang = lang === '__binary__' ? 'plaintext' : lang;
  const model = monaco.editor.createModel(content, monacoLang);
  state.singleEditor.setModel(model);
}

// ---------------------------------------------------------------------------
// MEDIA DIFF
// ---------------------------------------------------------------------------
async function showMediaDiff(path, diff, ext) {
  hideAllViewers();
  el.mediaDiffViewer.classList.remove('hidden');
  state.mediaZoom = 1;
  applyMediaZoom();

  const name = path.split('/').pop();
  el.mediaLabelA.textContent = diff.fileA ? name : '(not present)';
  el.mediaLabelB.textContent = diff.fileB ? name : '(not present)';

  revokeBlobs();
  el.mediaContainerLeft.innerHTML = '';
  el.mediaContainerRight.innerHTML = '';
  el.mediaSizeLeft.textContent = '';
  el.mediaSizeRight.textContent = '';

  async function renderMedia(file, container, sizeEl) {
    if (!file) {
      container.innerHTML = '<p class="text-xs text-zinc-700 font-mono">Not present</p>';
      return;
    }

    const sizeData = file._data;
    sizeEl.textContent = sizeData ? formatBytes(sizeData.uncompressedSize || 0) : '';

    if (IMAGE_EXTS.has(ext)) {
      const blob = await file.async('blob');
      const mime = IMAGE_MIME[ext] || 'image/png';
      const url = URL.createObjectURL(new Blob([blob], { type: mime }));
      trackBlob(url);
      const img = document.createElement('img');
      img.src = url;
      img.alt = name;
      img.className = 'max-w-none shadow-2xl rounded';
      img.style.imageRendering = (ext === 'ico' || ext === 'cur') ? 'pixelated' : 'auto';
      img.onload = () => { sizeEl.textContent += ` · ${img.naturalWidth}×${img.naturalHeight}`; };
      container.appendChild(img);
    } else if (AUDIO_EXTS.has(ext)) {
      const blob = await file.async('blob');
      const mime = AUDIO_MIME[ext] || 'audio/mpeg';
      const url = URL.createObjectURL(new Blob([blob], { type: mime }));
      trackBlob(url);
      const wrap = document.createElement('div');
      wrap.className = 'flex flex-col items-center gap-3';
      wrap.innerHTML = `<div class="w-12 h-12 bg-zinc-900 rounded-xl flex items-center justify-center"><i class="fa-solid fa-music text-2xl text-blue-400"></i></div>`;
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.src = url;
      audio.style = 'filter:invert(1)hue-rotate(180deg);width:200px;';
      wrap.appendChild(audio);
      container.appendChild(wrap);
    } else if (FONT_EXTS.has(ext)) {
      const wrap = document.createElement('div');
      wrap.className = 'flex flex-col items-center gap-3 p-6';
      wrap.innerHTML = `<i class="fa-solid fa-font text-4xl text-purple-500"></i><p class="text-xs font-mono text-zinc-500">${name}</p>`;
      container.appendChild(wrap);
    } else {
      container.innerHTML = `<p class="text-xs text-zinc-600 font-mono">${name}</p>`;
    }
  }

  await renderMedia(diff.fileA, el.mediaContainerLeft, el.mediaSizeLeft);
  await renderMedia(diff.fileB, el.mediaContainerRight, el.mediaSizeRight);
  setStatus('Media diff', 'green');
}

// ---------------------------------------------------------------------------
// BINARY DIFF
// ---------------------------------------------------------------------------
function showBinaryDiff(path, diff, ext) {
  hideAllViewers();
  el.binaryDiffViewer.classList.remove('hidden');

  const name = path.split('/').pop();
  const iconCls = FONT_EXTS.has(ext) ? 'fa-font text-purple-500' :
                  BINARY_EXTS.has(ext) ? 'fa-microchip text-green-500' : 'fa-file text-zinc-500';

  el.binaryIconLeft.className = `fa-solid ${iconCls} text-2xl mb-2`;
  el.binaryIconRight.className = `fa-solid ${iconCls} text-2xl mb-2`;

  el.binaryNameLeft.textContent  = diff.fileA ? name : '(not present)';
  el.binaryNameRight.textContent = diff.fileB ? name : '(not present)';

  const sA = diff.fileA?._data?.uncompressedSize || 0;
  const sB = diff.fileB?._data?.uncompressedSize || 0;
  el.binarySizeLeft.textContent  = diff.fileA ? formatBytes(sA) : '';
  el.binarySizeRight.textContent = diff.fileB ? formatBytes(sB) : '';

  const delta = sB - sA;
  if (diff.status === STATUS.SAME) {
    el.binaryDiffMsg.textContent = 'Binary files are identical';
    el.binaryDiffMsg.className = 'text-[11px] font-mono text-zinc-600';
  } else if (diff.status === STATUS.ADDED) {
    el.binaryDiffMsg.textContent = `New binary file - ${formatBytes(sB)}`;
    el.binaryDiffMsg.className = 'text-[11px] font-mono text-green-700';
  } else if (diff.status === STATUS.REMOVED) {
    el.binaryDiffMsg.textContent = `Binary file removed - was ${formatBytes(sA)}`;
    el.binaryDiffMsg.className = 'text-[11px] font-mono text-red-700';
  } else {
    el.binaryDiffMsg.textContent = `Binary content changed - size delta: ${delta >= 0 ? '+' : ''}${formatBytes(delta)}`;
    el.binaryDiffMsg.className = `text-[11px] font-mono ${delta > 0 ? 'text-green-700' : 'text-red-700'}`;
  }

  setStatus('Binary diff', 'zinc');
}

// ---------------------------------------------------------------------------
// DIFF MODE
// ---------------------------------------------------------------------------
function setDiffMode(mode) {
  state.diffMode = mode;
  if (state.monacoDiffEditor) {
    state.monacoDiffEditor.updateOptions({ renderSideBySide: mode === 'side' });
  }
  updateDiffModeButtons();
}

function updateDiffModeButtons() {
  const isside = state.diffMode === 'side';
  el.modeSideBySide.classList.toggle('text-white', isside);
  el.modeSideBySide.classList.toggle('bg-zinc-900', isside);
  el.modeSideBySide.classList.toggle('text-zinc-400', !isside);
  el.modeInline.classList.toggle('text-white', !isside);
  el.modeInline.classList.toggle('bg-zinc-900', !isside);
  el.modeInline.classList.toggle('text-zinc-400', isside);
}

function toggleChangesOnly() {
  state.changesOnlyMode = !state.changesOnlyMode;
  el.showChangesOnly.classList.toggle('text-blue-400', state.changesOnlyMode);
  el.showChangesOnly.classList.toggle('border-blue-800', state.changesOnlyMode);
  el.showChangesOnly.classList.toggle('text-zinc-400', !state.changesOnlyMode);
  // Filter to only changed files
  if (state.changesOnlyMode) {
    const prevFilter = state.currentFilter;
    document.querySelectorAll('.filter-tab[data-filter="same"]').forEach(b => b.style.display = 'none');
    if (prevFilter === 'all' || prevFilter === 'same') {
      state.currentFilter = 'modified';
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.filter === 'modified'));
    }
  } else {
    document.querySelectorAll('.filter-tab[data-filter="same"]').forEach(b => b.style.display = '');
    state.currentFilter = 'all';
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
  }
  applyFilter();
}

// ---------------------------------------------------------------------------
// CHANGE NAVIGATION
// ---------------------------------------------------------------------------
function navigateChange(dir) {
  const changes = state.currentChanges;
  if (!changes || changes.length === 0) return;

  state.currentChangeIdx = Math.max(0, Math.min(changes.length - 1, state.currentChangeIdx + dir));
  const change = changes[state.currentChangeIdx];

  if (state.monacoDiffEditor) {
    const modEditor = state.monacoDiffEditor.getModifiedEditor();
    modEditor.revealLineInCenter(change.modifiedStartLineNumber || 1);
  }
  updateChangeCounter();
}

function updateChangeCounter() {
  const total = state.currentChanges.length;
  const idx = state.currentChangeIdx;
  el.changeCounter.textContent = idx >= 0 ? `${idx + 1}/${total}` : `${total} changes`;
}

// ---------------------------------------------------------------------------
// WORD WRAP
// ---------------------------------------------------------------------------
function toggleWrap() {
  state.wrapEnabled = !state.wrapEnabled;
  if (state.monacoDiffEditor) {
    state.monacoDiffEditor.updateOptions({ wordWrap: state.wrapEnabled ? 'on' : 'off' });
    state.monacoDiffEditor.getOriginalEditor().updateOptions({ wordWrap: state.wrapEnabled ? 'on' : 'off' });
    state.monacoDiffEditor.getModifiedEditor().updateOptions({ wordWrap: state.wrapEnabled ? 'on' : 'off' });
  }
  if (state.singleEditor) {
    state.singleEditor.updateOptions({ wordWrap: state.wrapEnabled ? 'on' : 'off' });
  }
  el.wrapBtn.classList.toggle('text-blue-400', state.wrapEnabled);
}

// ---------------------------------------------------------------------------
// FORMAT
// ---------------------------------------------------------------------------
function formatCurrentFile() {
  if (!state.activePath) return;
  const ext = state.activePath.split('.').pop().toLowerCase();
  const origEditor = state.monacoDiffEditor?.getOriginalEditor();
  const modEditor  = state.monacoDiffEditor?.getModifiedEditor();
  if (!modEditor) return;

  const content = modEditor.getValue();
  try {
    let formatted = content;
    if (ext === 'json') {
      formatted = JSON.stringify(JSON.parse(content), null, 2);
    } else if (['js','jsx','ts','tsx','mjs'].includes(ext)) {
      formatted = js_beautify(content, { indent_size: 2 });
    } else if (['html','htm'].includes(ext)) {
      formatted = html_beautify(content, { indent_size: 2 });
    } else if (['css','scss'].includes(ext)) {
      formatted = css_beautify(content, { indent_size: 2 });
    }

    const origContent = origEditor.getValue();
    let formattedOrig = origContent;
    if (ext === 'json') {
      try { formattedOrig = JSON.stringify(JSON.parse(origContent), null, 2); } catch (_) {}
    } else if (['js','jsx','ts','tsx','mjs'].includes(ext)) {
      formattedOrig = js_beautify(origContent, { indent_size: 2 });
    } else if (['html','htm'].includes(ext)) {
      formattedOrig = html_beautify(origContent, { indent_size: 2 });
    } else if (['css','scss'].includes(ext)) {
      formattedOrig = css_beautify(origContent, { indent_size: 2 });
    }

    const monacoLang = LANG_MAP[ext] || 'plaintext';
    state.monacoDiffEditor.setModel({
      original: monaco.editor.createModel(formattedOrig, monacoLang),
      modified: monaco.editor.createModel(formatted, monacoLang),
    });
    showToast('Formatted both sides', 'green');
  } catch (e) {
    showToast('Format failed', 'red');
  }
}

// ---------------------------------------------------------------------------
// COPY PATCH
// ---------------------------------------------------------------------------
async function copyPatch() {
  if (!state.activePath) return;
  const diff = state.diffMap[state.activePath];
  if (!diff) return;

  const contentA = diff.fileA ? await readFileText(diff.fileA) : '';
  const contentB = diff.fileB ? await readFileText(diff.fileB) : '';
  const patch = generateUnifiedDiff(state.activePath, contentA, contentB);
  navigator.clipboard.writeText(patch).then(() => showToast('Patch copied', 'green'));
}

function generateUnifiedDiff(path, oldText, newText) {
  // Minimal unified diff generator
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const header = `--- a/${path}\n+++ b/${path}\n`;
  let result = header;

  // Simple line-by-line diff (LCS based)
  const lcs = computeLCS(oldLines, newLines);
  let oi = 0, ni = 0, li = 0;
  const hunks = [];
  let currentHunk = null;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcs.length && oi === lcs[li][0] && ni === lcs[li][1]) {
      // Common line
      if (currentHunk) {
        currentHunk.lines.push(` ${oldLines[oi]}`);
        if (currentHunk.lines.filter(l => l[0] !== ' ').length > 0) {
          currentHunk.contextAfter++;
          if (currentHunk.contextAfter >= 3) {
            hunks.push(currentHunk);
            currentHunk = null;
          }
        }
      }
      oi++; ni++; li++;
    } else {
      if (!currentHunk) {
        currentHunk = {
          oldStart: oi + 1, newStart: ni + 1,
          oldCount: 0, newCount: 0,
          lines: [],
          contextAfter: 0,
        };
        // Add 3 lines of context before
        const ctxStart = Math.max(0, oi - 3);
        for (let c = ctxStart; c < oi; c++) {
          currentHunk.lines.push(` ${oldLines[c]}`);
          currentHunk.oldStart = c + 1;
          currentHunk.newStart = ni - (oi - c) + 1;
        }
      }
      currentHunk.contextAfter = 0;
      // Check what changed
      if (oi < oldLines.length && (li >= lcs.length || oi !== lcs[li][0])) {
        currentHunk.lines.push(`-${oldLines[oi]}`);
        currentHunk.oldCount++;
        oi++;
      } else if (ni < newLines.length && (li >= lcs.length || ni !== lcs[li][1])) {
        currentHunk.lines.push(`+${newLines[ni]}`);
        currentHunk.newCount++;
        ni++;
      }
    }
  }
  if (currentHunk && currentHunk.lines.some(l => l[0] !== ' ')) {
    hunks.push(currentHunk);
  }

  for (const hunk of hunks) {
    const oldCount = hunk.lines.filter(l => l[0] !== '+').length;
    const newCount = hunk.lines.filter(l => l[0] !== '-').length;
    result += `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@\n`;
    result += hunk.lines.join('\n') + '\n';
  }

  return result;
}

function computeLCS(a, b) {
  // Patience diff-inspired: for small files use DP
  if (a.length > 2000 || b.length > 2000) return []; // Skip for very large files
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  // Backtrack
  const lcs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i-1] === b[j-1]) { lcs.unshift([i-1, j-1]); i--; j--; }
    else if (dp[i-1][j] > dp[i][j-1]) i--;
    else j--;
  }
  return lcs;
}

// ---------------------------------------------------------------------------
// STATS PANEL
// ---------------------------------------------------------------------------
function showStatsPanel() {
  if (!state.pkgA || !state.pkgB || Object.keys(state.diffMap).length === 0) {
    showToast('Run diff first', 'red');
    return;
  }

  hideAllViewers();
  el.statsPanel.classList.remove('hidden');
  el.editorToolbar.classList.add('hidden');
  el.noFileSelected.classList.add('hidden');

  const paths = state.allPaths;
  const added    = paths.filter(p => state.diffMap[p].status === STATUS.ADDED);
  const removed  = paths.filter(p => state.diffMap[p].status === STATUS.REMOVED);
  const modified = paths.filter(p => state.diffMap[p].status === STATUS.MODIFIED);
  const same     = paths.filter(p => state.diffMap[p].status === STATUS.SAME);

  const totalSizeA = paths.reduce((acc, p) => acc + (state.diffMap[p].fileA?._data?.uncompressedSize || 0), 0);
  const totalSizeB = paths.reduce((acc, p) => acc + (state.diffMap[p].fileB?._data?.uncompressedSize || 0), 0);

  // Extension breakdown of changed files
  const changedByExt = {};
  [...added, ...removed, ...modified].forEach(p => {
    const ext = p.split('.').pop().toLowerCase() || 'other';
    changedByExt[ext] = (changedByExt[ext] || 0) + 1;
  });

  el.statsContent.innerHTML = '';

  // Overview
  const overview = mkSection('Overview');
  const mA = state.pkgA.manifest, mB = state.pkgB.manifest;
  if (mA || mB) {
    appendRow(overview, 'Extension', (mA?.name || mB?.name || '-'));
    appendRow(overview, 'Version A → B', `${mA?.version || '?'} → ${mB?.version || '?'}`);
  }
  appendRow(overview, 'Files in A', Object.keys(state.pkgA.fileMap).length);
  appendRow(overview, 'Files in B', Object.keys(state.pkgB.fileMap).length);
  appendRow(overview, 'Total files compared', paths.length);
  appendRow(overview, 'Package size A', formatBytes(totalSizeA));
  appendRow(overview, 'Package size B', formatBytes(totalSizeB));
  appendRow(overview, 'Size delta', `${totalSizeB - totalSizeA >= 0 ? '+' : ''}${formatBytes(totalSizeB - totalSizeA)}`);
  el.statsContent.appendChild(overview);

  // Change summary with visual bar
  const changeSec = mkSection('Change Summary');
  const totalChanged = added.length + removed.length + modified.length + same.length;
  const barWrap = document.createElement('div');
  barWrap.className = 'px-4 py-3 space-y-2';

  const barRow = document.createElement('div');
  barRow.className = 'flex h-2 rounded overflow-hidden gap-px';

  const segments = [
    { count: modified.length, cls: 'bg-yellow-600', label: 'Modified' },
    { count: added.length,    cls: 'bg-green-600',  label: 'Added' },
    { count: removed.length,  cls: 'bg-red-700',    label: 'Removed' },
    { count: same.length,     cls: 'bg-zinc-800',   label: 'Same' },
  ];
  segments.forEach(s => {
    if (s.count === 0) return;
    const seg = document.createElement('div');
    seg.className = s.cls;
    seg.style.flex = s.count;
    seg.title = `${s.label}: ${s.count}`;
    barRow.appendChild(seg);
  });
  barWrap.appendChild(barRow);

  const legend = document.createElement('div');
  legend.className = 'flex flex-wrap gap-3 text-[10px] font-mono mt-2';
  segments.forEach(s => {
    const item = document.createElement('span');
    const pct = totalChanged > 0 ? Math.round(s.count / totalChanged * 100) : 0;
    item.className = `flex items-center gap-1 text-zinc-500`;
    item.innerHTML = `<span class="w-2 h-2 rounded-sm inline-block ${s.cls}"></span>${s.label}: ${s.count} (${pct}%)`;
    legend.appendChild(item);
  });
  barWrap.appendChild(legend);
  changeSec.appendChild(barWrap);
  el.statsContent.appendChild(changeSec);

  // Changed files by extension
  if (Object.keys(changedByExt).length > 0) {
    const extSec = mkSection('Changed Files by Extension');
    Object.entries(changedByExt).sort((a, b) => b[1] - a[1]).forEach(([ext, count]) => {
      appendRow(extSec, `.${ext}`, `${count} file${count !== 1 ? 's' : ''}`);
    });
    el.statsContent.appendChild(extSec);
  }

  // Top modified files by size delta
  const modDelta = modified.map(p => {
    const sA = state.diffMap[p].fileA?._data?.uncompressedSize || 0;
    const sB = state.diffMap[p].fileB?._data?.uncompressedSize || 0;
    return { path: p, delta: Math.abs(sB - sA), raw: sB - sA };
  }).sort((a, b) => b.delta - a.delta).slice(0, 10);

  if (modDelta.length > 0) {
    const topSec = mkSection('Largest Changes (by size)');
    modDelta.forEach(item => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between px-4 py-1.5 border-b border-zinc-900 last:border-0 gap-4 cursor-pointer hover:bg-zinc-950 transition';
      row.innerHTML = `
        <span class="text-zinc-600 font-mono text-[10px] truncate">${item.path}</span>
        <span class="text-[10px] font-mono flex-shrink-0 ${item.raw >= 0 ? 'text-green-700' : 'text-red-700'}">${item.raw >= 0 ? '+' : ''}${formatBytes(item.raw)}</span>
      `;
      row.addEventListener('click', () => openFileDiff(item.path));
      topSec.appendChild(row);
    });
    el.statsContent.appendChild(topSec);
  }

  // New files list
  if (added.length > 0) {
    const addSec = mkSection(`Added Files (${added.length})`);
    added.slice(0, 30).forEach(p => {
      const row = document.createElement('div');
      row.className = 'flex items-center px-4 py-1.5 border-b border-zinc-900 last:border-0 cursor-pointer hover:bg-zinc-950 transition';
      row.innerHTML = `<span class="text-green-800 font-mono text-[10px] truncate">+ ${p}</span>`;
      row.addEventListener('click', () => openFileDiff(p));
      addSec.appendChild(row);
    });
    if (added.length > 30) {
      const more = document.createElement('div');
      more.className = 'px-4 py-1.5 text-[10px] font-mono text-zinc-700';
      more.textContent = `… and ${added.length - 30} more`;
      addSec.appendChild(more);
    }
    el.statsContent.appendChild(addSec);
  }

  // Removed files list
  if (removed.length > 0) {
    const remSec = mkSection(`Removed Files (${removed.length})`);
    removed.slice(0, 30).forEach(p => {
      const row = document.createElement('div');
      row.className = 'flex items-center px-4 py-1.5 border-b border-zinc-900 last:border-0 cursor-pointer hover:bg-zinc-950 transition';
      row.innerHTML = `<span class="text-red-900 font-mono text-[10px] truncate">- ${p}</span>`;
      row.addEventListener('click', () => openFileDiff(p));
      remSec.appendChild(row);
    });
    if (removed.length > 30) {
      const more = document.createElement('div');
      more.className = 'px-4 py-1.5 text-[10px] font-mono text-zinc-700';
      more.textContent = `… and ${removed.length - 30} more`;
      remSec.appendChild(more);
    }
    el.statsContent.appendChild(remSec);
  }
}

function mkSection(title) {
  const wrap = document.createElement('div');
  wrap.className = 'bg-zinc-950 border border-zinc-900 rounded-lg overflow-hidden';
  const hdr = document.createElement('div');
  hdr.className = 'px-4 py-2 border-b border-zinc-900 text-zinc-400 font-sans text-[11px] font-semibold uppercase tracking-wider';
  hdr.textContent = title;
  wrap.appendChild(hdr);
  return wrap;
}

function appendRow(section, label, value) {
  const row = document.createElement('div');
  row.className = 'flex items-start justify-between px-4 py-2 border-b border-zinc-900 last:border-0 gap-4';
  row.innerHTML = `
    <span class="text-zinc-600 flex-shrink-0 text-[11px] font-mono">${label}</span>
    <span class="text-zinc-300 text-right break-all text-[11px] font-mono">${value}</span>
  `;
  section.appendChild(row);
}

// ---------------------------------------------------------------------------
// RESET
// ---------------------------------------------------------------------------
function resetAll() {
  state.pkgA = null;
  state.pkgB = null;
  state.diffMap = {};
  state.allPaths = [];
  state.activePath = null;
  state.currentChanges = [];
  state.currentChangeIdx = -1;
  revokeBlobs();

  // Reset editors
  if (state.monacoDiffEditor) state.monacoDiffEditor.setModel(null);
  if (state.singleEditor) state.singleEditor.setModel(null);

  // Reset drop zones
  resetDropZone(el.dropZoneA, 'A', 'Old / Base');
  resetDropZone(el.dropZoneB, 'B', 'New / Changed');
  el.heroDiffBtn.classList.add('hidden');

  // Reset UI
  el.diffTree.innerHTML = '';
  el.diffTree.classList.add('hidden');
  el.treePlaceholder.classList.remove('hidden');
  el.filterRow.classList.add('hidden');
  el.sidebarMeta.classList.add('hidden');
  el.fileStatusPanel.classList.add('hidden');
  el.headerVersions.classList.add('hidden');
  el.diffModeToggle.classList.add('hidden');
  el.filterToggle.classList.add('hidden');
  el.statsBtn.classList.add('hidden');
  el.resetBtn.classList.add('hidden');
  el.diffSummaryBar.classList.add('hidden');
  el.editorToolbar.classList.add('hidden');

  hideAllViewers();
  el.welcomeScreen.classList.remove('hidden');
  setStatus('Ready', 'zinc');
}

function resetDropZone(zone, side, subtitle) {
  zone.classList.remove('loaded', 'drag-over');
  zone.innerHTML = `
    <div class="w-8 h-8 bg-zinc-950 rounded-lg flex items-center justify-center">
      <i class="fa-solid fa-puzzle-piece text-sm text-zinc-600"></i>
    </div>
    <div class="text-center">
      <p class="text-[11px] text-zinc-500 font-semibold">Package ${side}</p>
      <p class="text-[10px] text-zinc-700 font-mono">${subtitle}</p>
    </div>
  `;
  // Re-attach input
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.crx';
  input.className = 'hidden';
  input.id = `crxInput${side}`;
  zone.appendChild(input);
  el[`crxInput${side}`] = input;
  input.addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) loadPackage(f, side);
    input.value = '';
  });
  zone.addEventListener('click', () => input.click());
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function hideAllViewers() {
  [
    el.monacoDiffHost, el.mediaDiffViewer, el.binaryDiffViewer,
    el.singleFileViewer, el.statsPanel, el.noFileSelected, el.welcomeScreen,
  ].forEach(v => {
    v.classList.add('hidden');
    v.classList.remove('flex');
  });
  el.langDisplay.textContent = '';
}

function adjustMediaZoom(delta) {
  state.mediaZoom = Math.max(0.05, Math.min(state.mediaZoom + delta, 8));
  applyMediaZoom();
}

function applyMediaZoom() {
  const scale = `scale(${state.mediaZoom})`;
  el.mediaContainerLeft.style.transform = scale;
  el.mediaContainerRight.style.transform = scale;
  el.mediaZoomDisplay.textContent = `${Math.round(state.mediaZoom * 100)}%`;
}

function trackBlob(url) { state.activeBlobUrls.push(url); }
function revokeBlobs() {
  state.activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
  state.activeBlobUrls = [];
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const sign = bytes < 0 ? '-' : '';
  bytes = Math.abs(bytes);
  const units = ['B','KB','MB','GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${sign}${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
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
  const borderColors = { green:'border-green-500', blue:'border-blue-500', red:'border-red-500' };
  const iconColors   = { green:'text-green-400',   blue:'text-blue-400',   red:'text-red-400' };
  const icons        = { green:'fa-check',          blue:'fa-info-circle',  red:'fa-triangle-exclamation' };

  el.toastMsg.textContent = msg;
  el.toastIcon.className = `fa-solid ${icons[color]||icons.blue} ${iconColors[color]||iconColors.blue} text-xs`;
  el.toast.className = `fixed bottom-5 right-5 px-4 py-2.5 rounded-lg bg-zinc-900 border ${borderColors[color]||borderColors.blue} shadow-xl text-sm font-medium text-white transform transition-all duration-300 z-[100] flex items-center gap-2.5 max-w-xs`;
  el.toast.classList.remove('translate-y-16', 'opacity-0');

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.toast.classList.add('translate-y-16', 'opacity-0'), 3000);
}

function tick() { return new Promise(r => setTimeout(r, 50)); }

if (!CSS.escape) {
  CSS.escape = str => str.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, '\\$&');
}