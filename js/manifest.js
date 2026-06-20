import { state } from './state.js';
import { el, createEl, clearEl, hideAllViewers } from './dom.js';
import { analyzeHostPermission } from './utils.js';
import { openFile } from './tabs.js';

export function showManifestPanel() {
  if (!state.manifestData) return;
  hideAllViewers();
  el.editorToolbar.classList.add('hidden');
  el.manifestPanel.classList.remove('hidden');
  el.noFileSelected.classList.add('hidden');

  clearEl(el.manifestPanel);

  const container = createEl('div', { className: 'p-6 max-w-4xl mx-auto' });

  const header = createEl('div', { className: 'flex items-start justify-between mb-6' });
  const titleWrap = createEl('div');
  titleWrap.appendChild(createEl('h2', {
    className: 'text-lg font-semibold text-mc-text',
    textContent: state.manifestData.name || 'Unnamed Extension'
  }));
  titleWrap.appendChild(createEl('p', {
    className: 'text-xs text-mc-text2 mono mt-1',
    textContent: `v${state.manifestData.version || '?'} • Manifest v${state.manifestData.manifest_version || '?'}`
  }));
  header.appendChild(titleWrap);

  if (state.manifestData.icons) {
    const iconSizes = Object.keys(state.manifestData.icons).sort((a,b) => parseInt(b)-parseInt(a));
    if (iconSizes.length) {
      const iconPath = state.manifestData.icons[iconSizes[0]];
      if (state.fileMap[iconPath]) {
        state.fileMap[iconPath].async('blob').then(blob => {
          const url = URL.createObjectURL(blob);
          state.activeBlobUrls.push(url);
          const img = createEl('img', { src: url, className: 'w-12 h-12 rounded-lg border border-mc-border', alt: 'Extension icon' });
          header.appendChild(img);
        }).catch(() => {});
      }
    }
  }
  container.appendChild(header);

  if (state.manifestData.description) {
    container.appendChild(createEl('p', {
      className: 'text-sm text-mc-text2 mb-6 leading-relaxed',
      textContent: state.manifestData.description
    }));
  }

  if (state.manifestData.permissions || state.manifestData.host_permissions || state.manifestData.optional_permissions) {
    container.appendChild(createEl('h3', {
      className: 'text-sm font-semibold text-mc-text mb-3 flex items-center gap-2',
      children: [
        createEl('i', { className: 'fa-solid fa-shield-halved text-mc-text' }),
        createEl('span', { textContent: 'Permissions' })
      ]
    }));

    const permsWrap = createEl('div', { className: 'space-y-2 mb-6' });

    const allPerms = [
      ...(state.manifestData.permissions || []),
      ...(state.manifestData.host_permissions || []),
      ...(state.manifestData.optional_permissions || [])
    ];

    allPerms.forEach(perm => {
      const permStr = String(perm);
      const isHost = permStr.includes('://') || permStr.includes('*') || permStr.startsWith('<');
      const info = isHost ? null : (state.permissionsData?.permissions?.[permStr] || null);

      const card = createEl('div', {
        className: 'bg-mc-bg2 border border-mc-border rounded-lg p-3',
        style: { borderLeftWidth: '4px', borderLeftColor: 'var(--text-primary)' }
      });

      const cardHeader = createEl('div', { className: 'flex items-center justify-between mb-1' });
      cardHeader.appendChild(createEl('span', {
        className: 'text-xs mono font-medium text-mc-text',
        textContent: permStr
      }));

      if (info) {
        const riskBadge = createEl('span', {
          className: 'text-[10px] px-1.5 py-0.5 rounded font-medium bg-mc-bg3 text-mc-text',
          textContent: info.riskLevel?.toUpperCase() || 'LOW'
        });
        cardHeader.appendChild(riskBadge);
      } else if (isHost) {
        const risk = analyzeHostPermission(permStr);
        const riskBadge = createEl('span', {
          className: 'text-[10px] px-1.5 py-0.5 rounded font-medium bg-mc-bg3 text-mc-text',
          textContent: risk.level.toUpperCase()
        });
        cardHeader.appendChild(riskBadge);
      }
      card.appendChild(cardHeader);

      if (info) {
        card.appendChild(createEl('p', {
          className: 'text-[11px] text-mc-text2 leading-relaxed',
          textContent: info.shortDescription || info.detailedDescription
        }));
        if (info.chromeLink) {
          const link = createEl('a', {
            className: 'text-[10px] text-mc-text hover:underline mt-1 inline-block',
            textContent: 'View Documentation →',
            attrs: { href: info.chromeLink, target: '_blank', rel: 'noopener noreferrer' }
          });
          card.appendChild(link);
        }
      } else if (isHost) {
        const risk = analyzeHostPermission(permStr);
        card.appendChild(createEl('p', {
          className: 'text-[11px] text-mc-text2 leading-relaxed',
          textContent: risk.description
        }));
      }

      permsWrap.appendChild(card);
    });
    container.appendChild(permsWrap);
  }

  if (state.manifestData.content_scripts && state.manifestData.content_scripts.length) {
    container.appendChild(createEl('h3', {
      className: 'text-sm font-semibold text-mc-text mb-3 flex items-center gap-2',
      children: [
        createEl('i', { className: 'fa-solid fa-file-code text-mc-text' }),
        createEl('span', { textContent: `Content Scripts (${state.manifestData.content_scripts.length})` })
      ]
    }));

    state.manifestData.content_scripts.forEach((cs, i) => {
      const csCard = createEl('div', { className: 'bg-mc-bg2 border border-mc-border rounded-lg p-3 mb-2' });
      csCard.appendChild(createEl('div', {
        className: 'text-[10px] text-mc-text2 mono mb-1',
        textContent: `Entry ${i + 1}`
      }));
      if (cs.matches) {
        const matchesWrap = createEl('div', { className: 'flex flex-wrap gap-1 mb-1' });
        cs.matches.forEach(m => {
          matchesWrap.appendChild(createEl('span', {
            className: 'text-[10px] text-mc-text bg-mc-bg3 px-1.5 py-0.5 rounded mono',
            textContent: m
          }));
        });
        csCard.appendChild(matchesWrap);
      }
      if (cs.js) {
        csCard.appendChild(createEl('div', {
          className: 'text-[10px] text-mc-text2 mt-1',
          textContent: `JS: ${cs.js.join(', ')}`
        }));
      }
      if (cs.css) {
        csCard.appendChild(createEl('div', {
          className: 'text-[10px] text-mc-text2 mt-0.5',
          textContent: `CSS: ${cs.css.join(', ')}`
        }));
      }
      container.appendChild(csCard);
    });
  }

  if (state.manifestData.background) {
    container.appendChild(createEl('h3', {
      className: 'text-sm font-semibold text-mc-text mb-3 flex items-center gap-2 mt-6',
      children: [
        createEl('i', { className: 'fa-solid fa-gears text-mc-text' }),
        createEl('span', { textContent: 'Background' })
      ]
    }));
    const bgCard = createEl('div', { className: 'bg-mc-bg2 border border-mc-border rounded-lg p-3' });
    Object.keys(state.manifestData.background).forEach(k => {
      const val = state.manifestData.background[k];
      bgCard.appendChild(createEl('div', {
        className: 'text-[11px] mono mb-0.5',
        children: [
          createEl('span', { className: 'text-mc-text2', textContent: `${k}: ` }),
          createEl('span', { className: 'text-mc-text', textContent: typeof val === 'string' ? val : JSON.stringify(val) })
        ]
      }));
    });
    container.appendChild(bgCard);
  }

  if (state.manifestData.web_accessible_resources) {
    container.appendChild(createEl('h3', {
      className: 'text-sm font-semibold text-mc-text mb-3 flex items-center gap-2 mt-6',
      children: [
        createEl('i', { className: 'fa-solid fa-globe text-mc-text' }),
        createEl('span', { textContent: 'Web Accessible Resources' })
      ]
    }));
    const warCard = createEl('div', { className: 'bg-mc-bg2 border border-mc-border rounded-lg p-3' });
    state.manifestData.web_accessible_resources.forEach((res) => {
      const text = typeof res === 'string' ? res : JSON.stringify(res);
      warCard.appendChild(createEl('div', {
        className: 'text-[11px] mono text-mc-text2 mb-0.5',
        textContent: text
      }));
    });
    container.appendChild(warCard);
  }

  if (state.manifestData.action || state.manifestData.browser_action) {
    const action = state.manifestData.action || state.manifestData.browser_action;
    container.appendChild(createEl('h3', {
      className: 'text-sm font-semibold text-mc-text mb-3 flex items-center gap-2 mt-6',
      children: [
        createEl('i', { className: 'fa-solid fa-hand-pointer text-mc-text' }),
        createEl('span', { textContent: 'Action / Popup' })
      ]
    }));
    const actionCard = createEl('div', { className: 'bg-mc-bg2 border border-mc-border rounded-lg p-3' });
    if (action.default_popup) {
      actionCard.appendChild(createEl('div', {
        className: 'text-[11px] mono mb-0.5',
        children: [
          createEl('span', { className: 'text-mc-text2', textContent: 'Popup: ' }),
          createEl('span', { className: 'text-mc-text cursor-pointer hover:underline', textContent: action.default_popup,
            onClick: () => { if (state.fileMap[action.default_popup]) openFile(action.default_popup); }
          })
        ]
      }));
    }
    if (action.default_title) {
      actionCard.appendChild(createEl('div', {
        className: 'text-[11px] mono mb-0.5',
        children: [
          createEl('span', { className: 'text-mc-text2', textContent: 'Title: ' }),
          createEl('span', { className: 'text-mc-text', textContent: action.default_title })
        ]
      }));
    }
    container.appendChild(actionCard);
  }

  container.appendChild(createEl('h3', {
    className: 'text-sm font-semibold text-mc-text mb-3 flex items-center gap-2 mt-6',
    children: [
      createEl('i', { className: 'fa-solid fa-code text-mc-text' }),
      createEl('span', { textContent: 'Raw manifest.json' })
    ]
  }));
  const rawPre = createEl('pre', {
    className: 'bg-mc-bg2 border border-mc-border rounded-lg p-4 text-[11px] mono text-mc-text2 overflow-auto max-h-96',
    textContent: JSON.stringify(state.manifestData, null, 2)
  });
  container.appendChild(rawPre);

  el.manifestPanel.appendChild(container);
}