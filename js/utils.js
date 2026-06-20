export const PERMISSIONS_API_URL = 'https://raw.githubusercontent.com/modcoretech/modcore-extension-manager/main/src/js/features/permissions.json';
export const BINARY_LIMIT = 5 * 1024 * 1024;
export const SEARCH_CHUNK_SIZE = 50;

export const LANG_MAP = {
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

export const IMAGE_EXTS = new Set([
  'png','jpg','jpeg','gif','webp','ico','bmp','tiff','tif','avif','svg','cur',
  'apng','jfif','pjpeg','pjp','heic','heif','raw','cr2','nef','dng'
]);
export const AUDIO_EXTS = new Set([
  'mp3','ogg','wav','flac','aac','m4a','opus','weba','oga','spx','wma','aiff'
]);
export const VIDEO_EXTS = new Set([
  'mp4','webm','ogv','mov','avi','mkv','m4v','ogm','ts','mpeg','mpg','flv','f4v','wmv'
]);
export const FONT_EXTS = new Set(['woff','woff2','ttf','otf','eot']);
export const BINARY_EXTS = new Set(['wasm','bin','dat','db','pak','pyc','class','so','dll','exe','dylib']);
export const HEX_VIEWABLE = new Set(['wasm','bin','dat','db','so','dll','exe','dylib']);

export const AUDIO_MIME = {
  mp3:'audio/mpeg', ogg:'audio/ogg', wav:'audio/wav', flac:'audio/flac',
  aac:'audio/aac', m4a:'audio/mp4', opus:'audio/ogg; codecs=opus',
  weba:'audio/webm', oga:'audio/ogg', spx:'audio/ogg; codecs=speex',
  wma:'audio/x-ms-wma', aiff:'audio/aiff'
};
export const VIDEO_MIME = {
  mp4:'video/mp4', webm:'video/webm', ogv:'video/ogg', mov:'video/quicktime',
  avi:'video/x-msvideo', mkv:'video/x-matroska', m4v:'video/mp4',
  ogm:'video/ogg', ts:'video/mp2t', mpeg:'video/mpeg', mpg:'video/mpeg',
  flv:'video/x-flv', f4v:'video/mp4', wmv:'video/x-ms-wmv'
};
export const IMAGE_MIME = {
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
  webp:'image/webp', ico:'image/x-icon', bmp:'image/bmp', tiff:'image/tiff',
  tif:'image/tiff', avif:'image/avif', svg:'image/svg+xml',
  cur:'image/x-win-bitmap', apng:'image/apng', jfif:'image/jpeg',
  pjpeg:'image/jpeg', pjp:'image/jpeg', heic:'image/heic', heif:'image/heif',
  raw:'image/raw', cr2:'image/x-canon-cr2', nef:'image/x-nikon-nef', dng:'image/x-adobe-dng'
};

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B','KB','MB','GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function yieldToMain() {
  return new Promise(r => setTimeout(r, 0));
}

export function getFileIconInfo(name, isDir) {
  if (isDir) return { cls: 'fa-solid fa-folder text-mc-text' };
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    js:    { cls: 'fa-brands fa-js text-mc-text' },
    mjs:   { cls: 'fa-brands fa-js text-mc-text' },
    ts:    { cls: 'fa-solid fa-code text-mc-text' },
    jsx:   { cls: 'fa-brands fa-react text-mc-text' },
    tsx:   { cls: 'fa-brands fa-react text-mc-text' },
    css:   { cls: 'fa-brands fa-css3-alt text-mc-text' },
    scss:  { cls: 'fa-solid fa-paintbrush text-mc-text' },
    html:  { cls: 'fa-brands fa-html5 text-mc-text' },
    htm:   { cls: 'fa-brands fa-html5 text-mc-text' },
    json:  { cls: 'fa-solid fa-brackets-curly text-mc-text' },
    xml:   { cls: 'fa-solid fa-code text-mc-text' },
    svg:   { cls: 'fa-regular fa-image text-mc-text' },
    png:   { cls: 'fa-regular fa-image text-mc-text' },
    jpg:   { cls: 'fa-regular fa-image text-mc-text' },
    jpeg:  { cls: 'fa-regular fa-image text-mc-text' },
    gif:   { cls: 'fa-regular fa-image text-mc-text' },
    webp:  { cls: 'fa-regular fa-image text-mc-text' },
    ico:   { cls: 'fa-solid fa-star text-mc-text' },
    mp3:   { cls: 'fa-solid fa-music text-mc-text' },
    ogg:   { cls: 'fa-solid fa-music text-mc-text' },
    wav:   { cls: 'fa-solid fa-waveform text-mc-text' },
    mp4:   { cls: 'fa-solid fa-film text-mc-text' },
    webm:  { cls: 'fa-solid fa-film text-mc-text' },
    md:    { cls: 'fa-brands fa-markdown text-mc-text' },
    txt:   { cls: 'fa-regular fa-file-lines text-mc-text' },
    woff:  { cls: 'fa-solid fa-font text-mc-text' },
    woff2: { cls: 'fa-solid fa-font text-mc-text' },
    ttf:   { cls: 'fa-solid fa-font text-mc-text' },
    otf:   { cls: 'fa-solid fa-font text-mc-text' },
    py:    { cls: 'fa-brands fa-python text-mc-text' },
    wasm:  { cls: 'fa-solid fa-microchip text-mc-text' },
    map:   { cls: 'fa-solid fa-map text-mc-text' },
  };
  return map[ext] || { cls: 'fa-regular fa-file text-mc-text' };
}

export function analyzeHostPermission(perm) {
  if (perm === '<all_urls>') return { level: 'high', description: 'Grants access to ALL websites. This is the highest risk host permission.' };
  if (perm.includes('*://*/*') || perm.includes('*://*/')) return { level: 'high', description: 'Broad wildcard access to many websites.' };
  if (perm.includes('*')) return { level: 'medium', description: 'Wildcard pattern that matches multiple sites.' };
  return { level: 'low', description: 'Access to a specific website or narrow pattern.' };
}

export function buildSearchRegex(query, caseSensitive, useRegex, wholeWord) {
  try {
    let pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (wholeWord) pattern = `\\b${pattern}\\b`;
    const flags = caseSensitive ? '' : 'i';
    return new RegExp(pattern, flags);
  } catch (e) {
    return null;
  }
}

export function parseCrxBuffer(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  if (view.byteLength < 4) return buffer;
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'Cr24') return buffer;

  if (view.byteLength < 8) return buffer;
  const version = view.getUint32(4, true);

  if (version === 2) {
    if (view.byteLength < 16) return buffer;
    const pubKeyLen = view.getUint32(8, true);
    const sigLen = view.getUint32(12, true);
    const headerLen = 16 + pubKeyLen + sigLen;
    if (headerLen > view.byteLength) return buffer;
    return buffer.slice(headerLen);
  } else if (version === 3) {
    if (view.byteLength < 12) return buffer;
    const headerLen = view.getUint32(8, true);
    const totalHeader = 12 + headerLen;
    if (totalHeader > view.byteLength) return buffer;
    return buffer.slice(totalHeader);
  }

  for (let i = 0; i < Math.min(buffer.byteLength - 4, 65536); i++) {
    if (bytes[i] === 0x50 && bytes[i+1] === 0x4B && bytes[i+2] === 0x03 && bytes[i+3] === 0x04) {
      return buffer.slice(i);
    }
  }
  return buffer;
}