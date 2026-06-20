export const state = {
  zip: null,
  fileMap: {},
  tabs: [],
  activeTabPath: null,
  monacoEditor: null,
  monacoLoaded: false,
  zoomLevel: 1,
  imageRotation: 0,
  ctxPath: null,
  activeBlobUrls: [],
  wrapEnabled: false,
  loadedFileName: '',
  manifestData: null,
  closedTabs: [],
  quickOpenIndex: [],
  sidebarVisible: true,
  markdownPreviewActive: false,
};

export function trackBlob(url) {
  state.activeBlobUrls.push(url);
}

export function revokeAllBlobs() {
  state.activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
  state.activeBlobUrls = [];
}

export function revokeBlob(url) {
  const idx = state.activeBlobUrls.indexOf(url);
  if (idx > -1) {
    URL.revokeObjectURL(url);
    state.activeBlobUrls.splice(idx, 1);
  }
}