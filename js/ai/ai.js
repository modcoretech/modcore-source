/**
 * ai/ai.js
 * Privacy-first local AI assistant using WebLLM (WebGPU).
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
let extensionContext = '';

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
      clearModelCache().then(() => {
        setTimeout(handleLoadModel, 300);
      });
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

  const clearCacheBtn = document.getElementById('aiClearCacheBtn');
  if (clearCacheBtn) clearCacheBtn.addEventListener('click', clearModelCache);
  el.closeAiPanel.addEventListener('click', disposeModel);
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

// ── Extension Context (minimal, includes currently viewing file) ───────────────

export function buildExtensionContext() {
  if (!state.zip || !state.manifestData) {
    extensionContext = '';
    return;
  }
  const m = state.manifestData;
  const perms = [...(m.permissions || []), ...(m.host_permissions || [])].slice(0, 6);
  extensionContext = `Extension: ${m.name || 'Unknown'} v${m.version || '?'}, manifest v${m.manifest_version || '?'}. Perms: ${perms.join(', ') || 'none'}.`;
}

function getCurrentlyViewing() {
  if (state.activeTabPath) {
    return `Currently viewing: ${state.activeTabPath} (content not attached).`;
  }
  return 'No file currently open.';
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
  setStatus('AI disposed');
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
    showToast('Cache cleared');
  } catch (err) {
    showToast('Cache clear failed');
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

    engine = await CreateMLCEngine(modelCfg.id, {
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
    buildExtensionContext();
    addSystemMessage(`${modelKey} ready · ${modelCfg.maxTokens} tokens context`);
    showToast(`${modelKey} ready`);
  } catch (err) {
    console.error(err);
    const msg = err?.message || String(err);
    let friendly = msg;
    let action = 'Retry';

    if (msg.includes('Cache') || msg.includes('cache')) {
      friendly = 'Model download failed. The browser cache may be corrupted or storage is full.';
      action = 'Clear Cache & Retry';
      // Auto-clear on next click
      el.aiLoadBtn._clearOnRetry = true;
    } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch')) {
      friendly = 'Network error while downloading the model. Check your connection and try again.';
    } else if (msg.includes('WebGPU') || msg.includes('webgpu') || msg.includes('GPU')) {
      friendly = 'WebGPU is not available or enabled in this browser. Enable it in chrome://flags or try a different browser.';
      action = 'Dismiss';
    } else if (msg.includes('out of memory') || msg.includes('OOM') || msg.includes('Memory')) {
      friendly = `The model is too large for this device (${modelCfg.size}). Try a smaller model like Llama-3.2-1B.`;
      action = 'Dismiss';
    } else if (msg.includes('import') || msg.includes('module')) {
      friendly = 'Failed to load the WebLLM runtime. Check your internet connection or try again later.';
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
  // Adjusted to 2.5 because code contains dense structural symbols and punctuation
  return Math.ceil(text.length / 2.5);
}

function buildMessages() {
  const cfg = MODELS[currentModelKey] || { maxTokens: 8192 };
  const maxCtx = cfg.maxTokens;
  const reserve = 2048;
  let budget = maxCtx - reserve;

  const sys = `You are a security-focused assistant analyzing Chrome extensions via modcore Source. ${extensionContext} ${getCurrentlyViewing()} Be concise. Use markdown code blocks for code.`;
  budget -= estimateTokens(sys);

  const messages = [{ role: 'system', content: sys }];

  // Add file attachment if present (max 1)
  if (attachedFile) {
    let fileMsg = `Attached file \`${attachedFile.path}\`:\n\`\`\`\n${attachedFile.content}\n\`\`\``;
    let ft = estimateTokens(fileMsg);
    
    // If the file exceeds 50% of the budget, dynamically trim it instead of ignoring it entirely
    if (ft >= budget * 0.5) {
      const allowedTokens = Math.floor(budget * 0.5);
      const allowedChars = Math.floor(allowedTokens * 2.5); // Derived from our 2.5 token heuristic
      
      const truncatedContent = attachedFile.content.substring(0, allowedChars) + 
        '\n\n/* … truncated further to fit within local model context window … */';
      
      fileMsg = `Attached file \`${attachedFile.path}\` (Partially Truncated):\n\`\`\`\n${truncatedContent}\n\`\`\``;
      ft = estimateTokens(fileMsg);
      
      // Defers toast slightly so it doesn't interrupt the generation sequence UI
      setTimeout(() => showToast('Context automatically optimized to fit model limits.'), 50);
    }

    budget -= ft;
    messages.push({ role: 'user', content: fileMsg });
  }

  // Sliding window: add history newest-first, drop oldest if over budget
  const history = [];
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    const msg = chatHistory[i];
    const t = estimateTokens(msg.content);
    if (budget - t < 0) {
      // Drop oldest messages to make room (sliding window)
      break;
    }
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
      temperature: 0.7,
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
    renderMarkdown(currentAssistantElement, errText);
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

// Batched rendering using requestAnimationFrame
function scheduleRender() {
  if (pendingRender) return;
  pendingRender = true;
  requestAnimationFrame(() => {
    if (currentAssistantElement && currentAssistantText) {
      renderMarkdown(currentAssistantElement, currentAssistantText);
    }
    pendingRender = false;
  });
}

async function flushRender() {
  if (pendingRender) {
    await new Promise(r => requestAnimationFrame(r));
  }
  if (currentAssistantElement && currentAssistantText) {
    renderMarkdown(currentAssistantElement, currentAssistantText);
  }
}

// ── Markdown Rendering (marked.js with custom renderer, no spacing issues) ──────

function renderMarkdown(element, text) {
  try {
    // Create a custom renderer that avoids excessive paragraph margins
    const renderer = new marked.Renderer();

    // Override paragraph rendering to use div with no margin
    renderer.paragraph = (token) => {
      return `<div class="text-mc-text2 leading-relaxed mb-1">${token.text}</div>`;
    };

    // Override text rendering to handle inline elements
    renderer.text = (token) => {
      return token.text;
    };

    // Override code block rendering
    renderer.code = (token) => {
      const lang = token.lang || 'text';
      const code = token.text;
      return `<div class="my-2 rounded-lg border border-mc-border overflow-hidden">
        <div class="flex items-center justify-between px-3 py-1.5 bg-mc-bg3 border-b border-mc-border">
          <span class="text-[9px] mono text-mc-text2 uppercase">${lang}</span>
          <button class="text-[9px] text-mc-text2 hover:text-mc-text transition copy-code-btn" data-code="${encodeURIComponent(code)}">Copy</button>
        </div>
        <pre class="p-3 overflow-auto text-[11px] mono text-mc-text leading-relaxed bg-mc-bg2" style="max-height:400px;margin:0;"><code style="background:transparent;">${escapeHtml(code)}</code></pre>
      </div>`;
    };

    // Override inline code
    renderer.codespan = (token) => {
      return `<code class="bg-mc-bg2 px-1 py-0.5 rounded text-[10px] mono text-mc-text">${token.text}</code>`;
    };

    // Override heading rendering
    renderer.heading = (token) => {
      const sizes = { 1: 'text-sm', 2: 'text-xs', 3: 'text-[11px]', 4: 'text-[11px]', 5: 'text-[10px]', 6: 'text-[10px]' };
      const size = sizes[token.depth] || 'text-[11px]';
      return `<h${token.depth} class="text-mc-text font-semibold mt-3 mb-1 ${size}">${token.text}</h${token.depth}>`;
    };

    // Override list rendering
    renderer.list = (token) => {
      const tag = token.ordered ? 'ol' : 'ul';
      return `<${tag} class="pl-4 my-2 space-y-1">${token.items.map(item => `<li class="text-mc-text2">${item.text}</li>`).join('')}</${tag}>`;
    };

    // Override blockquote
    renderer.blockquote = (token) => {
      return `<blockquote class="border-l-2 border-mc-border pl-3 my-2 text-mc-text2 italic">${token.text}</blockquote>`;
    };

    // Override link
    renderer.link = (token) => {
      return `<a href="${token.href}" target="_blank" rel="noopener noreferrer" class="text-mc-text hover:underline">${token.text}</a>`;
    };

    // Override strong
    renderer.strong = (token) => {
      return `<strong class="text-mc-text font-semibold">${token.text}</strong>`;
    };

    // Override em
    renderer.em = (token) => {
      return `<em class="italic text-mc-text2">${token.text}</em>`;
    };

    // Override hr
    renderer.hr = () => {
      return `<hr class="border-mc-border my-3">`;
    };

    // Override table
    renderer.table = (token) => {
      const header = token.header.map(h => `<th class="px-2 py-1 border border-mc-border text-mc-text bg-mc-bg2 font-semibold text-[11px]">${h.text}</th>`).join('');
      const rows = token.rows.map(row => `<tr>${row.map(cell => `<td class="px-2 py-1 border border-mc-border text-mc-text2 text-[11px]">${cell.text}</td>`).join('')}</tr>`).join('');
      return `<table class="w-full text-[11px] border border-mc-border rounded-lg overflow-hidden my-2"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
    };

    marked.use({ renderer });

    const html = marked.parse(text, { breaks: true, gfm: true });
    
    // Sanitize the HTML string to neutralize code-injection/XSS attacks from scanned source files
    element.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;

    // Attach copy handlers to code blocks
    element.querySelectorAll('.copy-code-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = decodeURIComponent(btn.dataset.code);
        navigator.clipboard.writeText(code).then(() => showToast('Copied'));
      });
    });

  } catch (err) {
    // Fallback to plain text
    element.textContent = text;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── File Attachment (max 1, optimized) ──────────────────────────────────────────

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

  // Smart truncation: keep first and last parts for large files
  const maxChars = 8000;
  let displayContent = content;
  if (content.length > maxChars) {
    const half = Math.floor(maxChars / 2);
    displayContent = content.substring(0, half) + '\n\n/* … truncated … */\n\n' + content.substring(content.length - half);
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
  el.aiInput.placeholder = enabled ? 'Ask about this extension…' : 'AI is responding…';
}

function clearChat() {
  chatHistory = [];
  messageIdCounter = 0;
  attachedFile = null;
  updateAttachUI();
  clearEl(el.aiMessages);
  addSystemMessage('Chat cleared.');
}

function addSystemMessage(text) {
  const div = createEl('div', {
    className: 'text-[10px] text-mc-text2 text-center py-1',
    textContent: text
  });
  el.aiMessages.appendChild(div);
  scrollToBottom();
}

function appendMessage(role, text, msgId) {
  const isUser = role === 'user';
  const wrapper = createEl('div', {
    className: `flex ${isUser ? 'justify-end' : 'justify-start'}`,
    attrs: { 'data-msg-id': msgId }
  });
  const bubble = createEl('div', {
    className: `max-w-[90%] rounded-lg px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words ${isUser ? 'ai-msg-user text-mc-text' : 'ai-msg-ai text-mc-text2'}`,
  });
  if (isUser) {
    bubble.textContent = text;
  }
  wrapper.appendChild(bubble);
  el.aiMessages.appendChild(wrapper);
  scrollToBottom();
  return bubble;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    el.aiMessages.scrollTop = el.aiMessages.scrollHeight;
  });
}

function setStatus(msg) {
  const s = document.getElementById('statusMsg');
  if (s) s.textContent = msg;
}
