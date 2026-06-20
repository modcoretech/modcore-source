/**
 * ai/ai.js
 * modAI — Privacy-first local AI assistant for Chrome extension inspection.
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
let pendingAttachmentRequest = null;  // For "analyze [file]" pattern

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

// ── Context Building (Full Manifest + File Inventory + Permissions) ───────────

export function buildExtensionContext() {
  if (!state.zip || !state.manifestData) {
    return 'No extension loaded.';
  }

  const m = state.manifestData;
  const files = Object.keys(state.fileMap).sort();

  // Build file tree structure for context
  const fileTree = buildFileTreeContext(files);

  // Full manifest JSON with compression for very large ones
  let manifestStr = JSON.stringify(m, null, 2);
  let manifestNote = '';
  if (manifestStr.length > 8000) {
    manifestStr = compressManifest(m);
    manifestNote = '\n[Note: Manifest was compressed to fit context window. Key fields preserved, verbose arrays truncated.]';
  }

  // Permission analysis
  const permAnalysis = analyzePermissions(m);

  // Content scripts summary
  const csSummary = buildContentScriptsSummary(m);

  // Background summary
  const bgSummary = buildBackgroundSummary(m);

  return `You are modAI, operating inside modcore Source (a Chrome extension inspector tool). Your job is to analyze, inspect, and explain extensions. You are NOT a code generator. You do NOT write new code. You do NOT suggest modifications. You only describe, analyze, and flag issues.

YOUR UI (modAI Panel):
You live in a slide-out panel on the right side of modcore Source. The panel has three states:
  1. Consent screen: model selector dropdown, privacy notice, "Load Model" button, "Reset Cache" button (trash icon).
  2. Loading screen: progress bar, status text, percentage counter.
  3. Chat screen: message history (user bubbles on the right, your bubbles on the left), input textarea at the bottom with send button, "Attach current file" button, "Clear chat" button.
When a file is attached, a context bar appears directly above the input showing the filename and character count. The user can detach it via an X button on that bar. The user opens modAI via the "modAI" button in the top toolbar (keyboard: Alt+A).

INTERACTION RULES:
- The user can attach ONE file at a time via the "Attach current file" button.
- The user can also ask you to analyze a specific file by name (e.g., "analyze popup.js"). When this happens, you detect the file in the tree and ask permission to attach it via an inline prompt in the chat.
- If the user asks about a file that exists but is not attached, tell them it exists and offer to read it. Do not guess the contents.
- If the user asks about a file that does not exist in the tree, say so clearly.

EXTENSION DATA:

MANIFEST (manifest.json):${manifestNote}
${manifestStr}

PERMISSION ANALYSIS:
${permAnalysis}

CONTENT SCRIPTS:
${csSummary}

BACKGROUND:
${bgSummary}

FILE TREE (${files.length} files):
${fileTree}

ANALYSIS RULES:
1. NEVER write new code for the extension. Never suggest patches, rewrites, or improvements.
2. If asked about a file that EXISTS in the tree but is NOT attached, say: "I can see that file in the extension, but it is not attached. Would you like me to read it?" — then STOP. Do not guess the contents.
3. If asked about a file that does NOT exist, say: "That file does not appear in this extension."
4. If the user says "analyze [filename]" or "look at [filename]" or similar, recognize the file from the tree and ask permission to attach it.
5. Be concise. Use markdown. Use code blocks ONLY for quoting existing code, never for generating new code.
6. Focus on: security risks, suspicious patterns, permission overreach, data exfiltration vectors, CSP weaknesses, and code quality issues.
7. When quoting code, keep snippets short and relevant (under 20 lines).`;
}

function buildFileTreeContext(files) {
  const tree = {};
  files.forEach(path => {
    const parts = path.split('/');
    let node = tree;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      if (!node[part]) {
        node[part] = isFile ? null : {};
      }
      if (!isFile) node = node[part];
    });
  });

  function render(node, depth = 0) {
    const keys = Object.keys(node).sort((a, b) => {
      const aIsFile = node[a] === null;
      const bIsFile = node[b] === null;
      if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
      return a.localeCompare(b);
    });
    return keys.map(k => {
      const indent = '  '.repeat(depth);
      if (node[k] === null) return `${indent}${k}`;
      return `${indent}${k}/\n${render(node[k], depth + 1)}`;
    }).join('\n');
  }

  const rendered = render(tree);
  // If too large, truncate with note
  if (rendered.length > 3000) {
    const lines = rendered.split('\n');
    const truncated = lines.slice(0, 150).join('\n');
    return truncated + '\n  ... (' + (lines.length - 150) + ' more files)';
  }
  return rendered;
}

function compressManifest(m) {
  // Keep essential fields, truncate verbose arrays
  const compressed = {};
  const keep = ['manifest_version', 'name', 'version', 'description', 'permissions', 
                'host_permissions', 'optional_permissions', 'content_scripts', 
                'background', 'web_accessible_resources', 'action', 'browser_action',
                'icons', 'content_security_policy', 'externally_connectable'];

  keep.forEach(key => {
    if (m[key] !== undefined) {
      if (Array.isArray(m[key]) && m[key].length > 10) {
        compressed[key] = m[key].slice(0, 10);
        compressed[key + '_truncated'] = `... ${m[key].length - 10} more items`;
      } else {
        compressed[key] = m[key];
      }
    }
  });
  return JSON.stringify(compressed, null, 2);
}

function analyzePermissions(m) {
  const all = [
    ...(m.permissions || []),
    ...(m.host_permissions || []),
    ...(m.optional_permissions || []),
  ];
  if (!all.length) return 'No permissions declared.';

  const high = ['<all_urls>', '*://*/*', 'nativeMessaging', 'debugger', 'proxy', 'privacy'];
  const medium = ['history', 'webRequest', 'webRequestBlocking', 'declarativeNetRequest', 'tabs', 'cookies', 'storage'];

  const riskMap = {};
  all.forEach(p => {
    const s = String(p);
    if (high.some(h => s.includes(h))) riskMap[s] = 'HIGH';
    else if (medium.some(m => s.includes(m))) riskMap[s] = 'MEDIUM';
    else if (s.includes('*') && s.includes('://')) riskMap[s] = 'MEDIUM';
    else riskMap[s] = 'LOW';
  });

  return Object.entries(riskMap)
    .map(([perm, risk]) => `  [${risk}] ${perm}`)
    .join('\n');
}

function buildContentScriptsSummary(m) {
  if (!m.content_scripts || !m.content_scripts.length) return 'None declared.';
  return m.content_scripts.map((cs, i) => {
    const matches = (cs.matches || []).join(', ');
    const js = (cs.js || []).length;
    const css = (cs.css || []).length;
    const allFrames = cs.all_frames ? ' (all frames)' : '';
    return `  Entry ${i + 1}: matches=[${matches}]${allFrames}, js=${js}, css=${css}`;
  }).join('\n');
}

function buildBackgroundSummary(m) {
  if (!m.background) return 'None declared.';
  const bg = m.background;
  const parts = [];
  if (bg.service_worker) parts.push(`service_worker: ${bg.service_worker}`);
  if (bg.scripts) parts.push(`scripts: [${bg.scripts.join(', ')}]`);
  if (bg.page) parts.push(`page: ${bg.page}`);
  if (bg.persistent !== undefined) parts.push(`persistent: ${bg.persistent}`);
  return parts.map(p => `  ${p}`).join('\n') || JSON.stringify(bg, null, 2);
}

function getAttachedFileContext() {
  if (!attachedFile) return '';
  return `\n\nATTACHED FILE: ${attachedFile.path}\n\`\`\`\n${attachedFile.content}\n\`\`\``;
}

// ── Smart File Detection ──────────────────────────────────────────────────────

function detectFileReference(text) {
  // Patterns: "analyze X", "look at X", "check X", "what does X do", "read X"
  const patterns = [
    /(?:analyze|examine|inspect|check|review|look\s+at|read|what\s+is|what\s+does)\s+([\w\-.\/]+(?:\.js|\.json|\.html|\.css|\.ts|\.tsx|\.jsx|\.py|\.md)?)/i,
    /(?:show|open|display)\s+me\s+([\w\-.\/]+(?:\.js|\.json|\.html|\.css|\.ts|\.tsx|\.jsx)?)/i,
    /(?:the\s+file\s+)?([\w\-.\/]+(?:\.js|\.json|\.html|\.css|\.ts|\.tsx|\.jsx))\s+(?:file|code)/i,
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match) {
      const candidate = match[1];
      // Check if it exists in fileMap
      const exact = state.fileMap[candidate];
      if (exact) return candidate;
      // Try partial match
      const partial = Object.keys(state.fileMap).find(p => 
        p.endsWith(candidate) || p.split('/').pop() === candidate
      );
      if (partial) return partial;
    }
  }
  return null;
}

function showAttachmentPrompt(filePath) {
  pendingAttachmentRequest = filePath;
  const name = filePath.split('/').pop();

  const promptEl = createEl('div', {
    className: 'my-3 p-3 bg-mc-bg2 border border-mc-border rounded-lg',
  });

  promptEl.innerHTML = `
    <p class="text-[11px] text-mc-text mb-2">I found <code class="mono text-mc-text bg-mc-bg3 px-1 rounded">${escapeHtml(name)}</code> in this extension. Would you like me to read it?</p>
    <div class="flex gap-2">
      <button id="ai-attach-yes" class="px-3 py-1.5 bg-mc-text text-mc-bg text-[11px] font-medium rounded hover:bg-mc-text2 transition">Yes, read it</button>
      <button id="ai-attach-no" class="px-3 py-1.5 bg-mc-bg2 border border-mc-border text-mc-text2 text-[11px] rounded hover:bg-mc-bg3 hover:text-mc-text transition">No</button>
    </div>
  `;

  el.aiMessages.appendChild(promptEl);
  scrollToBottom();

  promptEl.querySelector('#ai-attach-yes').addEventListener('click', async () => {
    promptEl.remove();
    await attachFileByPath(pendingAttachmentRequest);
    pendingAttachmentRequest = null;
    // Auto-ask the question again with context
    const lastUserMsg = chatHistory.filter(m => m.role === 'user').pop();
    if (lastUserMsg) {
      el.aiInput.value = lastUserMsg.content;
      handleSend();
    }
  });

  promptEl.querySelector('#ai-attach-no').addEventListener('click', () => {
    promptEl.remove();
    pendingAttachmentRequest = null;
    appendMessage('assistant', `I will not read ${name}. Let me know if you change your mind.`, ++messageIdCounter);
  });
}

// ── Memory Management ─────────────────────────────────────────────────────────

function disposeModel() {
  engine = null;
  webllmModule = null;
  aiReady = false;
  isGenerating = false;
  attachedFile = null;
  pendingAttachmentRequest = null;
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
    let suggestion = '';

    if (msg.includes('Cache') || msg.includes('cache') || msg.includes('Failed to execute')) {
      friendly = 'Storage error while downloading the model.';
      suggestion = 'Your browser storage may be full or restricted. Try clearing the model cache or using a smaller model.';
      action = 'Clear & Retry';
      el.aiLoadBtn._clearOnRetry = true;
    } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('Failed to fetch')) {
      friendly = 'Network error while downloading the model.';
      suggestion = 'Check your internet connection. Model files are downloaded from HuggingFace.';
    } else if (msg.includes('WebGPU') || msg.includes('webgpu') || msg.includes('GPU')) {
      friendly = 'WebGPU is not available in this browser.';
      suggestion = 'Enable WebGPU in chrome://flags or use Chrome/Edge 113+. Firefox and Safari do not support WebGPU yet.';
      action = 'Dismiss';
    } else if (msg.includes('out of memory') || msg.includes('OOM') || msg.includes('Memory')) {
      friendly = `This model is too large for your device (${modelCfg.size}).`;
      suggestion = 'Try Llama-3.2-1B (~1GB) which works on most systems with 8GB RAM.';
      action = 'Dismiss';
    } else if (msg.includes('import') || msg.includes('module') || msg.includes('esm')) {
      friendly = 'Failed to load the WebLLM runtime.';
      suggestion = 'This may be a temporary CDN issue. Check your connection and try again.';
    } else if (msg.includes('abort') || msg.includes('Abort') || msg.includes('cancel')) {
      friendly = 'Download was interrupted.';
      suggestion = 'The download may have been cancelled or timed out. Partial downloads are cached, so retrying should resume.';
    }

    const errorBlock = createEl('div', {
      className: 'mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-[11px]'
    });
    errorBlock.innerHTML = `<p class="text-red-400 font-medium">${escapeHtml(friendly)}</p>${suggestion ? `<p class="text-mc-text2 mt-1">${escapeHtml(suggestion)}</p>` : ''}`;

    // Insert error details into the consent screen
    const existing = el.aiConsentScreen.querySelector('.ai-error-block');
    if (existing) existing.remove();
    errorBlock.classList.add('ai-error-block');
    el.aiConsentScreen.insertBefore(errorBlock, el.aiLoadProgress);

    setText('aiLoadStatus', friendly);
    el.aiLoadBtn.disabled = false;
    el.aiLoadBtn.textContent = action;
    showToast('Load failed');
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
    let fileMsg = `ATTACHED FILE (${attachedFile.path}):\n\`\`\`\n${attachedFile.content}\n\`\`\``;
    let ft = estimateTokens(fileMsg);
    if (ft >= budget * 0.5) {
      const allowedChars = Math.floor(Math.floor(budget * 0.5) * 2.5);
      const truncated = attachedFile.content.substring(0, allowedChars) +
        '\n/* … truncated to fit context window … */';
      fileMsg = `ATTACHED FILE (${attachedFile.path}, truncated):\n\`\`\`\n${truncated}\n\`\`\``;
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

  // Check for file reference patterns before sending
  const fileRef = detectFileReference(text);
  if (fileRef && !attachedFile) {
    // Show inline attachment prompt instead of sending to AI
    const msgId = ++messageIdCounter;
    chatHistory.push({ id: msgId, role: 'user', content: text });
    appendMessage('user', text, msgId);
    showAttachmentPrompt(fileRef);
    setInputEnabled(true);
    return;
  }

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
      temperature: 0.4,
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
    const errText = `Error: ${err.message || 'Generation failed'}`;
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
  if (pendingRender) await new Promise(r => requestAnimationFrame(r));
  if (currentAssistantElement && currentAssistantText) {
    renderMarkdown(currentAssistantElement, currentAssistantText);
  }
}

// ── Markdown Rendering (Lightweight <pre> for code) ───────────────────────────

function renderMarkdown(element, text) {
  try {
    const renderer = new marked.Renderer();

    renderer.paragraph = (token) => {
      return `<p class="text-mc-text2 leading-relaxed mb-2">${token.text}</p>`;
    };

    renderer.text = (token) => token.text;

    // Lightweight code blocks with <pre>, no Monaco
    renderer.code = (token) => {
      const lang = token.lang || 'text';
      const code = token.text;
      return `<div class="my-2 rounded-lg border border-mc-border overflow-hidden">
        <div class="flex items-center justify-between px-3 py-1.5 bg-mc-bg3 border-b border-mc-border">
          <span class="text-[9px] mono text-mc-text2 uppercase">${lang}</span>
          <button class="text-[9px] text-mc-text2 hover:text-mc-text transition copy-code-btn" data-code="${encodeURIComponent(code)}">Copy</button>
        </div>
        <pre class="p-3 overflow-auto text-[11px] mono text-mc-text leading-relaxed bg-mc-bg2" style="max-height:400px;margin:0;white-space:pre;word-wrap:normal;"><code style="background:transparent;">${escapeHtml(code)}</code></pre>
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

    renderer.listitem = (token) => {
      return `<li class="text-mc-text2">${token.text}</li>`;
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

    // Better handling of inline formatting combinations
    renderer.html = (token) => {
      return token.text;
    };

    marked.use({ renderer });

    const html = marked.parse(text, { breaks: true, gfm: true });
    element.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── File Attachment (Enhanced UX) ─────────────────────────────────────────────

async function attachCurrentFile() {
  if (!state.activeTabPath) { showToast('No file open'); return; }
  if (attachedFile) { showToast('Detach current file first'); return; }
  await attachFileByPath(state.activeTabPath);
}

async function attachFileByPath(path) {
  const file = state.fileMap?.[path];
  if (!file) { showToast('File not found'); return; }

  // Check if it's a binary file
  const ext = path.split('.').pop().toLowerCase();
  const binaryExts = new Set(['png','jpg','jpeg','gif','webp','ico','mp3','mp4','wav','ogg','wasm','bin']);
  if (binaryExts.has(ext)) {
    showToast('Cannot attach binary files');
    return;
  }

  let content = '';
  const tab = state.tabs?.find(t => t.path === path);
  if (tab?.content) {
    content = tab.content;
  } else {
    try { content = await file.async('string'); }
    catch { showToast('Cannot read file'); return; }
  }

  // Smart truncation with head+tail for large files
  const maxChars = 12000;
  let displayContent = content;
  let wasTruncated = false;
  if (content.length > maxChars) {
    const headSize = Math.floor(maxChars * 0.6);
    const tailSize = Math.floor(maxChars * 0.4);
    displayContent = content.substring(0, headSize) +
      '\n\n/* … ' + (content.length - headSize - tailSize) + ' characters omitted … */\n\n' +
      content.substring(content.length - tailSize);
    wasTruncated = true;
  }

  attachedFile = {
    path: path,
    content: displayContent,
    fullLength: content.length,
    wasTruncated,
  };

  updateAttachUI();

  const name = path.split('/').pop();
  if (wasTruncated) {
    showToast(`Attached ${name} (truncated)`);
    addSystemMessage(`Attached ${name} · ${content.length.toLocaleString()} chars · head + tail shown`);
  } else {
    showToast(`Attached ${name}`);
    addSystemMessage(`Attached ${name} · ${content.length.toLocaleString()} chars`);
  }
}

function detachFile() {
  if (!attachedFile) return;
  const name = attachedFile.path.split('/').pop();
  attachedFile = null;
  updateAttachUI();
  showToast(`Detached ${name}`);
}

function updateAttachUI() {
  if (attachedFile) {
    const name = attachedFile.path.split('/').pop();
    const size = attachedFile.fullLength > 1000
      ? `${(attachedFile.fullLength / 1000).toFixed(1)}k chars`
      : `${attachedFile.fullLength} chars`;
    const truncBadge = attachedFile.wasTruncated ? ' · truncated' : '';
    setText('aiContextFile', `${name} · ${size}${truncBadge}`);
    el.aiContextBar.classList.remove('hidden');
    el.aiContextBar.classList.add('flex');
    el.aiUseFileBtn.classList.add('hidden');
  } else {
    el.aiContextBar.classList.add('hidden');
    el.aiContextBar.classList.remove('flex');
    el.aiUseFileBtn.classList.remove('hidden');
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
  pendingAttachmentRequest = null;
  updateAttachUI();
  clearEl(el.aiMessages);
  addSystemMessage('Chat cleared. Ask me anything about this extension.');
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
