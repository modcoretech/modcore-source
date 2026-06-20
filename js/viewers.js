import { state } from './state.js';
import { el, createEl, clearEl, setText, hideAllViewers, showError, showToast, setStatus } from './dom.js';
import {
  LANG_MAP, IMAGE_EXTS, AUDIO_EXTS, VIDEO_EXTS, FONT_EXTS, BINARY_EXTS, HEX_VIEWABLE,
  AUDIO_MIME, VIDEO_MIME, IMAGE_MIME, formatBytes, BINARY_LIMIT
} from './utils.js';

export function saveTabViewState(path) {
  if (!state.monacoEditor) return;
  const tab = state.tabs.find(t => t.path === path);
  if (tab) tab.viewState = state.monacoEditor.saveViewState();
}

export async function activateTab(path) {
  state.activeTabPath = path;

  el.noFileSelected.classList.add('hidden');
  el.welcomeScreen.classList.add('hidden');
  el.statsPanel.classList.add('hidden');
  el.manifestPanel.classList.add('hidden');
  el.tabsWrapper.classList.remove('hidden');
  el.editorToolbar.classList.remove('hidden');

  setText('filePathDisplay', path);

  el.unminifyBtn.classList.add('hidden');
  el.markdownPreviewBtn.classList.add('hidden');
  el.wrapBtn.classList.add('hidden');
  el.markdownViewer.classList.add('hidden');

  const file = state.fileMap[path];
  if (!file) return;

  const ext = path.split('.').pop().toLowerCase();
  hideAllViewers();

  setStatus(`Loading ${path.split('/').pop()}...`);

  if (IMAGE_EXTS.has(ext)) {
    el.mediaViewer.classList.remove('hidden');
    try {
      const blob = await file.async('blob');
      const mime = IMAGE_MIME[ext] || 'image/png';
      const typedBlob = new Blob([blob], { type: mime });
      const url = URL.createObjectURL(typedBlob);
      state.activeBlobUrls.push(url);
      clearEl(el.mediaContainer);
      const img = createEl('img', {
        src: url,
        alt: path.split('/').pop(),
        className: 'max-w-none rounded',
        style: { imageRendering: (ext === 'ico' || ext === 'cur') ? 'pixelated' : 'auto' }
      });
      el.mediaContainer.appendChild(img);
      state.zoomLevel = 1;
      state.imageRotation = 0;
      applyZoom();
      setText('langDisplay', ext.toUpperCase());
      setStatus('Image');
    } catch (e) {
      showError(el.mediaContainer, 'Could not render image');
    }
    return;
  }

  if (AUDIO_EXTS.has(ext)) {
    el.audioViewer.classList.remove('hidden');
    try {
      const blob = await file.async('blob');
      const mime = AUDIO_MIME[ext] || 'audio/mpeg';
      const typedBlob = new Blob([blob], { type: mime });
      const url = URL.createObjectURL(typedBlob);
      state.activeBlobUrls.push(url);
      el.audioPlayer.src = url;
      setText('audioFileName', path.split('/').pop());
      el.audioIcon.className = 'fa-solid fa-music text-3xl text-mc-text';
      setText('langDisplay', ext.toUpperCase());
      setStatus('Audio');
    } catch (e) {
      showError(el.audioViewer, 'Could not load audio');
    }
    return;
  }

  if (VIDEO_EXTS.has(ext)) {
    el.videoViewer.classList.remove('hidden');
    try {
      const blob = await file.async('blob');
      const mime = VIDEO_MIME[ext] || 'video/mp4';
      const typedBlob = new Blob([blob], { type: mime });
      const url = URL.createObjectURL(typedBlob);
      state.activeBlobUrls.push(url);
      el.videoPlayer.src = url;
      setText('langDisplay', ext.toUpperCase());
      setStatus('Video');
    } catch (e) {
      showError(el.videoViewer, 'Could not load video');
    }
    return;
  }

  if (FONT_EXTS.has(ext)) {
    el.binaryViewer.classList.remove('hidden');
    el.binaryIcon.className = 'fa-solid fa-font text-2xl text-mc-text';
    setText('binaryLabel', path.split('/').pop());
    const sizeData = file._data;
    setText('binarySize', sizeData ? formatBytes(sizeData.uncompressedSize || 0) : '');
    setText('langDisplay', ext.toUpperCase() + ' Font');
    setStatus('Font file');
    return;
  }

  if (BINARY_EXTS.has(ext)) {
    if (HEX_VIEWABLE.has(ext)) {
      el.hexViewer.classList.remove('hidden');
      await renderHexViewer(file, path);
    } else {
      el.binaryViewer.classList.remove('hidden');
      el.binaryIcon.className = 'fa-solid fa-file-code text-2xl text-mc-text';
      setText('binaryLabel', path.split('/').pop());
      const sizeData = file._data;
      setText('binarySize', sizeData ? formatBytes(sizeData.uncompressedSize || 0) : '');
    }
    setText('langDisplay', ext.toUpperCase());
    setStatus('Binary file');
    return;
  }

  el.monacoHost.classList.remove('hidden');
  el.wrapBtn.classList.remove('hidden');

  const lang = LANG_MAP[ext] || 'plaintext';
  setText('langDisplay', lang === 'plaintext' ? (ext.toUpperCase() || 'TEXT') : lang);

  if (['js','javascript','json','css','html','typescript'].includes(lang)) {
    el.unminifyBtn.classList.remove('hidden');
  }
  if (lang === 'markdown') {
    el.markdownPreviewBtn.classList.remove('hidden');
  }

  const tab = state.tabs.find(t => t.path === path);

  if (tab.content === null) {
    const sizeData = file._data;
    const size = sizeData ? (sizeData.uncompressedSize || 0) : 0;

    if (size > BINARY_LIMIT) {
      tab.content = `// File too large to preview (${formatBytes(size)})\n// Download it using the toolbar button.`;
      setText('infoLines', '–');
    } else {
      try {
        tab.content = await file.async('string');
        const lines = tab.content.split('\n').length;
        setText('infoLines', lines.toLocaleString());
      } catch (_) {
        tab.content = '// Binary or unreadable file content.';
        setText('infoLines', '–');
      }
    }
  } else {
    const lines = tab.content.split('\n').length;
    setText('infoLines', lines.toLocaleString());
  }

  const oldModel = state.monacoEditor.getModel();
  const model = monaco.editor.createModel(tab.content, lang === '__binary__' ? 'plaintext' : lang);
  state.monacoEditor.setModel(model);
  if (oldModel) oldModel.dispose();

  if (tab.viewState) {
    state.monacoEditor.restoreViewState(tab.viewState);
  }

  setStatus('Viewing');
}

export async function renderHexViewer(file, path) {
  clearEl(el.hexContent);
  try {
    const blob = await file.async('blob');
    const arr = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 16;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < arr.length; i += chunkSize) {
      const row = createEl('div', { className: 'flex gap-3 hover:bg-mc-bg2/50' });
      const offset = createEl('span', { className: 'text-mc-text2 w-16 text-right select-none', textContent: i.toString(16).padStart(8, '0') });
      row.appendChild(offset);

      const hexBytes = createEl('span', { className: 'text-mc-text flex gap-1 mono' });
      const asciiChars = createEl('span', { className: 'text-mc-text2 ml-2' });

      for (let j = 0; j < chunkSize; j++) {
        const idx = i + j;
        if (idx < arr.length) {
          const byte = arr[idx];
          hexBytes.appendChild(createEl('span', {
            className: 'w-5 text-center hover:text-mc-text hover:bg-mc-bg3 rounded cursor-default',
            textContent: byte.toString(16).padStart(2, '0')
          }));
          const char = byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.';
          asciiChars.appendChild(document.createTextNode(char));
        } else {
          hexBytes.appendChild(createEl('span', { className: 'w-5 text-center', textContent: '  ' }));
          asciiChars.appendChild(document.createTextNode(' '));
        }
      }
      row.appendChild(hexBytes);
      row.appendChild(asciiChars);
      frag.appendChild(row);
    }
    el.hexContent.appendChild(frag);
  } catch (e) {
    el.hexContent.appendChild(createEl('div', { className: 'text-mc-text text-sm', textContent: 'Failed to render hex dump' }));
  }
}

export function toggleMarkdownPreview() {
  if (!state.markdownPreviewActive) {
    const md = state.monacoEditor ? state.monacoEditor.getValue() : '';
    clearEl(el.markdownContent);

    const html = marked.parse(md);
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','strong','em','a','code','pre','blockquote','table','thead','tbody','tr','th','td','img','div','span'],
      ALLOWED_ATTR: ['href','title','src','alt','class','id']
    });

    const parser = new DOMParser();
    const doc = parser.parseFromString(clean, 'text/html');
    Array.from(doc.body.childNodes).forEach(node => {
      el.markdownContent.appendChild(document.adoptNode(node));
    });

    el.monacoHost.classList.add('hidden');
    el.markdownViewer.classList.remove('hidden');
    const icon = el.markdownPreviewBtn.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-code text-[10px]';
    if (el.markdownPreviewText) el.markdownPreviewText.textContent = ' Code';
    state.markdownPreviewActive = true;
  } else {
    el.markdownViewer.classList.add('hidden');
    el.monacoHost.classList.remove('hidden');
    const icon = el.markdownPreviewBtn.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-book-open text-[10px]';
    if (el.markdownPreviewText) el.markdownPreviewText.textContent = ' Preview';
    state.markdownPreviewActive = false;
  }
}

export function toggleWordWrap() {
  state.wrapEnabled = !state.wrapEnabled;
  if (state.monacoEditor) {
    state.monacoEditor.updateOptions({ wordWrap: state.wrapEnabled ? 'on' : 'off' });
  }
  el.wrapBtn.classList.toggle('text-mc-text', state.wrapEnabled);
  el.wrapBtn.classList.toggle('text-mc-text2', !state.wrapEnabled);
}

export function updateZoom(delta) {
  state.zoomLevel = Math.max(0.05, Math.min(state.zoomLevel + delta, 10));
  applyZoom();
}

export function applyZoom() {
  el.mediaContainer.style.transform = `scale(${state.zoomLevel}) rotate(${state.imageRotation}deg)`;
  setText('zoomLevelDisplay', `${Math.round(state.zoomLevel * 100)}%`);
}

export function copyContent() {
  if (!state.monacoEditor) return;
  navigator.clipboard.writeText(state.monacoEditor.getValue()).then(() => {
    showToast('Copied to clipboard');
  });
}

export function downloadCurrentFile() {
  if (state.activeTabPath) import('./app.js').then(m => m.downloadFile(state.activeTabPath));
}

export function formatCode() {
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
    showToast('Formatted');
  } catch (e) {
    showToast('Format failed');
  }
}

export function goToLine(line, column = 1) {
  if (!state.monacoEditor) return;
  state.monacoEditor.revealLineInCenter(line);
  state.monacoEditor.setPosition({ lineNumber: line, column: column + 1 });
  state.monacoEditor.focus();
}