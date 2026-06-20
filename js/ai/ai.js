/**
 * ai/ai.js
 * modAI — Privacy-first local AI assistant for extension inspection.
 * Runs entirely in-browser via WebLLM (WebGPU). No data leaves your device.
 */

import { state } from '../state.js';
import { el, createEl, clearEl, setText, showToast } from '../dom.js';

const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm';

const MODELS = {
  'Llama-3.2-1B': {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    size: '~1.0 GB',
    desc: 'Fast, lightweight',
    maxTokens: 8192,
  },
  'Qwen2.5-1.5B': {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    size: '~1.5 GB',
    desc: 'Great for code',
    maxTokens: 8192,
  },
  'Gemma-2-2B': {
    id: 'Gemma-2-2B-it-q4f16_1-MLC',
    size: '~2.0 GB',
    desc: 'Balanced',
    maxTokens: 8192,
  },
  'Llama-3.2-3B': {
    id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',
    size: '~2.5 GB',
    desc: 'Better quality',
    maxTokens: 8192,
  },
  'Mistral-7B': {
    id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
    size: '~5.5 GB',
    desc: 'Powerful',
    maxTokens: 8192,
  },
};

let engine = null;
let webllmModule = null;
let aiReady = false;
let loading = false;
let isGenerating = false;
let currentModelKey = null;

let chatHistory = [];
let messageIdCounter = 0;
let currentAssistantElement = null;
let currentAssistantText = '';
let pendingRender = false;
let attachedFile = null;

// ── Init ──────────────────────────────────────────────────────────────────────

export function initAI() {
  if (!el.aiLoadBtn) return;

  buildModelSelect();
  el.aiLoadBtn.addEventListener('click', () => {
    if (el.aiLoadBtn._clearOnRetry) {
      el.aiLoadBtn._clearOnRetry = false;
      clearModelCache().then(() => setTimeout(handleLoadModel, 300));
      return;
    }
    handleLoadModel();
  });
  el.aiSendBtn.addEventListener('click', handleSend);
  el.aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });
  el.aiUseFileBtn.addEventListener('click', attachCurrentFile);
  el.aiClearChat.addEventListener('click', clearChat);
  el.aiClearContext.addEventListener('click', detachFile);
  el.closeAiPanel.addEventListener('click', () => el.aiPanel.classList.add('translate-x-full'));

  // Reset cache button
  const resetCacheBtn = document.getElementById('aiResetCacheBtn');
  if (resetCacheBtn) resetCacheBtn.addEventListener('click', clearModelCache);
}

function buildModelSelect() {
  clearEl(el.aiModelSelect);
  Object.entries(MODELS).forEach(([key, cfg]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${key} (${cfg.size}) — ${cfg.desc}`;
    el.aiModelSelect.appendChild(opt);
  });
}

// ── Context Building (Full Manifest + File Inventory) ─────────────────────────

export function buildExtensionContext() {
  if (!state.zip || !state.manifestData) {
    return 'No extension loaded.';
  }

  const m = state.manifestData;
  const files = Object.keys(state.fileMap).sort();
  const fileList = files.slice(0, 200).join('\n');
  const moreFiles = files.length > 200 ? `\n... and ${files.length - 200} more files.` : '';

  // Full manifest JSON (truncated only if absolutely necessary)
  let manifestStr = JSON.stringify(m, null, 2);
  if (manifestStr.length > 6000) {
    manifestStr = manifestStr.substring(0, 6000) + '\n/* ... manifest truncated ... */';
  }

  return `You are modAI, a security and inspection assistant for Chrome extensions. You analyze extensions for security risks, code quality, and suspicious patterns. You do NOT write new code or suggest modifications to the extension. You only inspect, analyze, and explain what already exists.

EXTENSION MANIFEST (manifest.json):
${manifestStr}

FILE INVENTORY (${files.length} total files):
${fileList}${moreFiles}

CURRENTLY VIEWING: ${state.activeTabPath || 'No file open'}

RULES:
- You are an inspector, not a builder. Never generate new code for the extension.
- If asked about a file that exists in the inventory but is NOT attached, say: "I can see that file exists in the extension, but you haven't attached it. Click 'Attach file' to let me read its contents."
- If asked about a file that does NOT exist in the inventory, say: "That file doesn't appear to exist in this extension."
- Be concise. Use markdown for formatting. Use code blocks for code references.`;
}

function getAttachedFileContext() {
  if (!attachedFile) return '';
  return `\n\nATTACHED FILE (${attachedFile.path}):
\`\`\`
${attachedFile.content}
\`\`\``;
}

// ── Memory Management ─────────────────────────────────────────────────────────

function disposeModel() {
  engine = null;
  webllmModule = null;
  aiReady = false;
  isGenerating = false;
  attachedFile = null;
  chatHistory = [];
  messageIdCounter = 0;
  if (el.aiMessages) clearEl(el.aiMessages);
  if (el.aiConsentScreen && el.aiChatScreen) {
    el.aiConsentScreen.classList.remove('hidden');
    el.aiChatScreen.classList.add('hidden');
    el.aiChatScreen.classList.remove('flex');
  }
  if (el.aiModelBadge) el.aiModelBadge.classList.add('hidden');
  if (el.aiLoadBtn) {
    el.aiLoadBtn.disabled = false;
    el.aiLoadBtn.textContent = 'Load Model';
  }
  if (el.aiLoadProgress) el.aiLoadProgress.classList.add('hidden');
  setInputEnabled(true);
}

export async function clearModelCache() {
  try {
    for (const name of await caches.keys()) {
      if (name.includes('webllm') || name.includes('mlc')) await caches.delete(name);
    }
    const dbs = await window.indexedDB?.databases?.() || [];
    for (const db of dbs) {
      if (db.name?.includes('webllm') || db.name?.includes('mlc')) {
        window.indexedDB.deleteDatabase(db.name);
      }
    }
    for (const key of Object.keys(localStorage)) {
      if (key.includes('webllm') || key.includes('mlc')) localStorage.removeItem(key);
    }
    showToast('Model cache cleared');
  } catch (err) {
    showToast('Clear failed: ' + (err?.message || 'unknown'));
  }
}

// ── Model Loading ─────────────────────────────────────────────────────────────

async function handleLoadModel() {
  if (loading) return;
  const modelKey = el.aiModelSelect.value;
  const modelCfg = MODELS[modelKey];
  if (!modelCfg) return;

  if (aiReady && currentModelKey && currentModelKey !== modelKey) {
    disposeModel();
    await new Promise(r => setTimeout(r, 200));
  }

  loading = true;
  currentModelKey = modelKey;
  el.aiLoadBtn.disabled = true;
  el.aiLoadBtn.textContent = 'Loading…';
  el.aiLoadProgress.classList.remove('hidden');
  setText('aiLoadStatus', 'Fetching WebLLM…');
  setText('aiLoadPct', '');
  el.aiLoadBar.style.width = '0%';

  try {
    if (!webllmModule) {
      setText('aiLoadStatus', 'Importing WebLLM runtime…');
      webllmModule = await import(WEBLLM_CDN);
    }
    const { CreateMLCEngine } = webllmModule;

    setText('aiLoadStatus', `Downloading ${modelKey}…`);
    setText('aiModelBadge', `${modelKey}`);

    const appConfig = webllmModule.prebuiltAppConfig
      ? { ...webllmModule.prebuiltAppConfig, cacheBackend: 'indexeddb' }
      : { cacheBackend: 'indexeddb' };

    engine = await CreateMLCEngine(modelCfg.id, {
      appConfig,
      initProgressCallback: (p) => {
        const pct = Math.round(p.progress * 100);
        setText('aiLoadStatus', p.text || 'Loading…');
        setText('aiLoadPct', `${pct}%`);
        el.aiLoadBar.style.width = `${pct}%`;
      },
    });

    aiReady = true;
    el.aiConsentScreen.classList.add('hidden');
    el.aiChatScreen.classList.remove('hidden');
    el.aiChatScreen.classList.add('flex');
    el.aiModelBadge.classList.remove('hidden');
    addSystemMessage(`${modelKey} ready · Ask me anything about this extension`);
    showToast(`${modelKey} ready`);
  } catch (err) {
    console.error(err);
    const msg = err?.message || String(err);
    let friendly = msg;
    let action = 'Retry';

    if (msg.includes('Cache') || msg.includes('cache') || msg.includes('Failed to execute')) {
      friendly = 'Model download failed. Browser storage may be full or restricted. Try clearing storage or reloading.';
      action = 'Clear Storage & Retry';
      el.aiLoadBtn._clearOnRetry = true;
    } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch')) {
      friendly = 'Network error while downloading the model. Check your connection.';
    } else if (msg.includes('WebGPU') || msg.includes('webgpu') || msg.includes('GPU')) {
      friendly = 'WebGPU is not available. Enable it in chrome://flags or use Chrome/Edge 113+.';
      action = 'Dismiss';
    } else if (msg.includes('out of memory') || msg.includes('OOM') || msg.includes('Memory')) {
      friendly = `Model too large for this device (${modelCfg.size}). Try a smaller model.`;
      action = 'Dismiss';
    } else if (msg.includes('import') || msg.includes('module')) {
      friendly = 'Failed to load WebLLM runtime. Check your internet connection.';
    }

    setText('aiLoadStatus', friendly);
    el.aiLoadBtn.disabled = false;
    el.aiLoadBtn.textContent = action;
    showToast('Load failed: ' + friendly);
  } finally {
    loading = false;
  }
}

// ── Token Budget with Sliding Window ───────────────────────────────────────────

function estimateTokens(text) {
  return Math.ceil(text.length / 2.5);
}

function buildMessages() {
  const cfg = MODELS[currentModelKey] || { maxTokens: 8192 };
  const maxCtx = cfg.maxTokens;
  const reserve = 2048;
  let budget = maxCtx - reserve;

  const sys = buildExtensionContext();
  budget -= estimateTokens(sys);

  const messages = [{ role: 'system', content: sys }];

  // Attached file context
  if (attachedFile) {
    let fileMsg = `ATTACHED FILE (${attachedFile.path}):
\`\`\`
${attachedFile.content}
\`\`\``;
    let ft = estimateTokens(fileMsg);
    if (ft >= budget * 0.5) {
      const allowedChars = Math.floor(Math.floor(budget * 0.5) * 2.5);
      const truncated = attachedFile.content.substring(0, allowedChars) +
        '\n/* … truncated to fit context window … */';
      fileMsg = `ATTACHED FILE (${attachedFile.path}, truncated):
\`\`\`
${truncated}
\`\`\``;
      ft = estimateTokens(fileMsg);
      setTimeout(() => showToast('File truncated to fit model limits'), 50);
    }
    budget -= ft;
    messages.push({ role: 'user', content: fileMsg });
  }

  // Sliding window history
  const history = [];
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    const msg = chatHistory[i];
    const t = estimateTokens(msg.content);
    if (budget - t < 0) break;
    budget -= t;
    history.unshift({ role: msg.role, content: msg.content });
  }
  messages.push(...history);

  return messages;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

async function handleSend() {
  if (!aiReady || !engine) { showToast('Load a model first'); return; }
  if (isGenerating) return;

  const text = el.aiInput.value.trim();
  if (!text) return;

  el.aiInput.value = '';
  setInputEnabled(false);

  const msgId = ++messageIdCounter;
  chatHistory.push({ id: msgId, role: 'user', content: text });
  appendMessage('user', text, msgId);

  await generateResponse();
}

async function generateResponse() {
  if (!engine) return;
  isGenerating = true;

  const messages = buildMessages();
  const msgId = ++messageIdCounter;
  currentAssistantElement = appendMessage('assistant', '', msgId);
  currentAssistantText = '';
  pendingRender = false;

  try {
    const chunks = await engine.chat.completions.create({
      messages,
      temperature: 0.5,
      max_tokens: 2048,
      stream: true,
    });

    for await (const chunk of chunks) {
      const delta = chunk.choices[0]?.delta?.content || '';
      currentAssistantText += delta;
      scheduleRender();
    }

    await flushRender();
    const fullReply = await engine.getMessage();
    const reply = (fullReply || currentAssistantText).trim();
    chatHistory.push({ id: msgId, role: 'assistant', content: reply });
  } catch (err) {
    console.error(err);
    await flushRender();
    const errText = `Error: ${err.message}`;
    renderMarkdown(currentAssistantElement, errText, true);
    chatHistory.push({ id: msgId, role: 'assistant', content: errText });
  } finally {
    isGenerating = false;
    currentAssistantElement = null;
    currentAssistantText = '';
    pendingRender = false;
    setInputEnabled(true);
    el.aiInput.focus();
  }
}

function scheduleRender() {
  if (pendingRender) return;
  pendingRender = true;
  requestAnimationFrame(() => {
    if (currentAssistantElement && currentAssistantText) {
      renderMarkdown(currentAssistantElement, currentAssistantText, false);
    }
    pendingRender = false;
  });
}

async function flushRender() {
  if (pendingRender) await new Promise(r => requestAnimationFrame(r));
  if (currentAssistantElement && currentAssistantText) {
    renderMarkdown(currentAssistantElement, currentAssistantText, true);
  }
}

// ── Markdown Rendering (Monaco for code, proper formatting) ───────────────────

function renderMarkdown(element, text, isFinal) {
  try {
    const renderer = new marked.Renderer();

    renderer.paragraph = (token) => {
      return `<p class="text-mc-text2 leading-relaxed mb-2">${token.text}</p>`;
    };

    renderer.text = (token) => token.text;

    // Code blocks with Monaco integration
    renderer.code = (token) => {
      const lang = token.lang || 'text';
      const code = token.text;
      const blockId = `code-${Math.random().toString(36).slice(2, 9)}`;

      // Use Monaco if available for final renders, otherwise pre
      if (isFinal && typeof monaco !== 'undefined') {
        setTimeout(() => initMonacoBlock(blockId, code, lang), 0);
        return `<div class="my-2 rounded-lg border border-mc-border overflow-hidden">
          <div class="flex items-center justify-between px-3 py-1.5 bg-mc-bg3 border-b border-mc-border">
            <span class="text-[9px] mono text-mc-text2 uppercase">${lang}</span>
            <button class="text-[9px] text-mc-text2 hover:text-mc-text transition copy-code-btn" data-code="${encodeURIComponent(code)}">Copy</button>
          </div>
          <div id="${blockId}" class="bg-mc-bg2" style="min-height:60px;max-height:400px;"></div>
        </div>`;
      }

      return `<div class="my-2 rounded-lg border border-mc-border overflow-hidden">
        <div class="flex items-center justify-between px-3 py-1.5 bg-mc-bg3 border-b border-mc-border">
          <span class="text-[9px] mono text-mc-text2 uppercase">${lang}</span>
          <button class="text-[9px] text-mc-text2 hover:text-mc-text transition copy-code-btn" data-code="${encodeURIComponent(code)}">Copy</button>
        </div>
        <pre class="p-3 overflow-auto text-[11px] mono text-mc-text leading-relaxed bg-mc-bg2" style="max-height:400px;margin:0;"><code style="background:transparent;">${escapeHtml(code)}</code></pre>
      </div>`;
    };

    renderer.codespan = (token) => {
      return `<code class="bg-mc-bg2 px-1 py-0.5 rounded text-[10px] mono text-mc-text border border-mc-border">${token.text}</code>`;
    };

    renderer.heading = (token) => {
      const sizes = { 1: 'text-sm', 2: 'text-xs', 3: 'text-[11px]', 4: 'text-[11px]', 5: 'text-[10px]', 6: 'text-[10px]' };
      const size = sizes[token.depth] || 'text-[11px]';
      return `<h${token.depth} class="text-mc-text font-semibold mt-3 mb-1 ${size}">${token.text}</h${token.depth}>`;
    };

    renderer.list = (token) => {
      const tag = token.ordered ? 'ol' : 'ul';
      const start = token.start ? ` start="${token.start}"` : '';
      return `<${tag}${start} class="pl-4 my-2 space-y-1">${token.items.map(item => `<li class="text-mc-text2">${item.text}</li>`).join('')}</${tag}>`;
    };

    renderer.blockquote = (token) => {
      return `<blockquote class="border-l-2 border-mc-border pl-3 my-2 text-mc-text2 italic">${token.text}</blockquote>`;
    };

    renderer.link = (token) => {
      return `<a href="${token.href}" target="_blank" rel="noopener noreferrer" class="text-mc-text hover:underline">${token.text}</a>`;
    };

    renderer.strong = (token) => {
      return `<strong class="text-mc-text font-semibold">${token.text}</strong>`;
    };

    renderer.em = (token) => {
      return `<em class="italic text-mc-text2">${token.text}</em>`;
    };

    renderer.del = (token) => {
      return `<del class="text-mc-text2 opacity-60">${token.text}</del>`;
    };

    renderer.hr = () => {
      return `<hr class="border-mc-border my-3">`;
    };

    renderer.table = (token) => {
      const header = token.header.map(h => `<th class="px-2 py-1 border border-mc-border text-mc-text bg-mc-bg2 font-semibold text-[11px]">${h.text}</th>`).join('');
      const rows = token.rows.map(row => `<tr>${row.map(cell => `<td class="px-2 py-1 border border-mc-border text-mc-text2 text-[11px]">${cell.text}</td>`).join('')}</tr>`).join('');
      return `<table class="w-full text-[11px] border border-mc-border rounded-lg overflow-hidden my-2"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
    };

    // Better list item rendering
    renderer.listitem = (token) => {
      return `<li class="text-mc-text2">${token.text}</li>`;
    };

    marked.use({ renderer });

    const html = marked.parse(text, { breaks: true, gfm: true });
    element.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;

    // Attach copy handlers
    element.querySelectorAll('.copy-code-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = decodeURIComponent(btn.dataset.code);
        navigator.clipboard.writeText(code).then(() => showToast('Copied'));
      });
    });

  } catch (err) {
    element.textContent = text;
  }
}

function initMonacoBlock(id, code, lang) {
  const container = document.getElementById(id);
  if (!container || !monaco) return;

  const mappedLang = lang === 'js' ? 'javascript' : lang === 'ts' ? 'typescript' : lang;
  const model = monaco.editor.createModel(code, mappedLang);
  const editor = monaco.editor.create(container, {
    model,
    theme: 'crx-dark',
    readOnly: true,
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    lineNumbers: 'off',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    folding: false,
    renderLineHighlight: 'none',
    contextmenu: false,
    padding: { top: 4, bottom: 4 },
    scrollbar: { vertical: 'hidden', horizontal: 'auto' },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
  });

  // Auto-height up to max
  const lineCount = model.getLineCount();
  const lineHeight = 17;
  const padding = 8;
  const desiredHeight = Math.min(lineCount * lineHeight + padding, 400);
  container.style.height = desiredHeight + 'px';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── File Attachment ───────────────────────────────────────────────────────────

async function attachCurrentFile() {
  if (!state.activeTabPath) { showToast('No file open'); return; }
  if (attachedFile) { showToast('Detach current file first'); return; }

  const tab = state.tabs?.find(t => t.path === state.activeTabPath);
  let content = tab?.content;

  if (!content) {
    const file = state.fileMap?.[state.activeTabPath];
    if (!file) { showToast('Cannot read file'); return; }
    try { content = await file.async('string'); }
    catch { showToast('Cannot read file'); return; }
  }

  const maxChars = 8000;
  let displayContent = content;
  if (content.length > maxChars) {
    const half = Math.floor(maxChars / 2);
    displayContent = content.substring(0, half) +
      '\n\n/* … truncated … */\n\n' +
      content.substring(content.length - half);
  }

  attachedFile = {
    path: state.activeTabPath,
    content: displayContent,
    fullLength: content.length,
  };

  updateAttachUI();
  showToast(`Attached: ${state.activeTabPath.split('/').pop()}`);
}

function detachFile() {
  attachedFile = null;
  updateAttachUI();
}

function updateAttachUI() {
  if (attachedFile) {
    const name = attachedFile.path.split('/').pop();
    const size = attachedFile.fullLength > 1000
      ? `${(attachedFile.fullLength / 1000).toFixed(1)}k chars`
      : `${attachedFile.fullLength} chars`;
    setText('aiContextFile', `${name} · ${size}`);
    el.aiContextBar.classList.remove('hidden');
    el.aiContextBar.classList.add('flex');
  } else {
    el.aiContextBar.classList.add('hidden');
    el.aiContextBar.classList.remove('flex');
  }
}

// ── UI ──────────────────────────────────────────────────────────────────────────

function setInputEnabled(enabled) {
  el.aiInput.disabled = !enabled;
  el.aiSendBtn.disabled = !enabled;
  el.aiInput.placeholder = enabled ? 'Ask modAI about this extension…' : 'modAI is thinking…';
}

function clearChat() {
  chatHistory = [];
  messageIdCounter = 0;
  attachedFile = null;
  updateAttachUI();
  clearEl(el.aiMessages);
  addSystemMessage('Chat cleared. Ready for new questions.');
}

function addSystemMessage(text) {
  const div = createEl('div', {
    className: 'text-[10px] text-mc-text2 text-center py-2',
    textContent: text
  });
  el.aiMessages.appendChild(div);
  scrollToBottom();
}

function appendMessage(role, text, msgId) {
  const isUser = role === 'user';
  const wrapper = createEl('div', {
    className: `flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`,
    attrs: { 'data-msg-id': msgId }
  });

  const inner = createEl('div', {
    className: `max-w-[92%] ${isUser ? 'ai-msg-user' : 'ai-msg-ai'} rounded-std px-4 py-3 text-[12px] leading-relaxed`,
  });

  if (isUser) {
    inner.innerHTML = `<p class="text-mc-text whitespace-pre-wrap">${escapeHtml(text)}</p>`;
  }

  wrapper.appendChild(inner);
  el.aiMessages.appendChild(wrapper);
  scrollToBottom();
  return inner;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    el.aiMessages.scrollTop = el.aiMessages.scrollHeight;
  });
}
