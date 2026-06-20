import { state } from './state.js';
import { el, createEl, clearEl } from './dom.js';
import { getFileIconInfo, formatBytes } from './utils.js';
import { openFile } from './tabs.js';

export function buildTree() {
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

  clearEl(el.fileTree);
  renderTreeNodes(root.children, el.fileTree, 0);
}

export function renderTreeNodes(children, parentEl, depth) {
  const ul = createEl('ul', {
    className: depth === 0 ? 'space-y-px' : 'pl-3 border-l border-mc-border ml-2 space-y-px',
    attrs: { role: depth === 0 ? 'tree' : 'group' }
  });

  const sorted = Object.keys(children).sort((a, b) => {
    const ad = children[a].isDir, bd = children[b].isDir;
    if (ad !== bd) return ad ? -1 : 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });

  sorted.forEach(key => {
    const item = children[key];
    const li = createEl('li', { attrs: { 'data-tree-path': item.path, role: 'treeitem', 'aria-expanded': item.isDir ? 'false' : undefined } });

    const row = createEl('div', {
      className: 'flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs text-mc-text2 hover:text-mc-text hover:bg-mc-bg2 transition-colors group',
      attrs: { 'data-path': item.path, tabindex: '0' }
    });

    const iconInfo = getFileIconInfo(item.name, item.isDir);
    const icon = createEl('i', { className: `${iconInfo.cls} text-[11px] flex-shrink-0 w-3.5 text-center` });
    row.appendChild(icon);
    row.appendChild(createEl('span', { className: 'truncate', textContent: item.name }));

    if (!item.isDir && state.fileMap[item.path]) {
      const sizeData = state.fileMap[item.path]._data;
      if (sizeData) {
        row.appendChild(createEl('span', {
          className: 'ml-auto text-[9px] mono text-mc-text2 group-hover:text-mc-text flex-shrink-0',
          textContent: formatBytes(sizeData.uncompressedSize || 0)
        }));
      }
    }

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (item.isDir) return;
      state.ctxPath = item.path;
      el.contextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - 160)}px`;
      el.contextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
      el.contextMenu.classList.remove('hidden');
    });

    if (item.isDir) {
      const childContainer = createEl('div', { className: 'hidden', attrs: { role: 'group' } });
      renderTreeNodes(item.children, childContainer, depth + 1);
      li.appendChild(row);
      li.appendChild(childContainer);

      const toggle = () => {
        const collapsed = childContainer.classList.contains('hidden');
        childContainer.classList.toggle('hidden');
        icon.className = `${collapsed ? 'fa-solid fa-folder-open text-mc-text' : 'fa-solid fa-folder text-mc-text'} text-[11px] flex-shrink-0 w-3.5 text-center`;
        li.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      };

      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); childContainer.classList.remove('hidden'); li.setAttribute('aria-expanded', 'true'); icon.className = 'fa-solid fa-folder-open text-mc-text text-[11px] flex-shrink-0 w-3.5 text-center'; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); childContainer.classList.add('hidden'); li.setAttribute('aria-expanded', 'false'); icon.className = 'fa-solid fa-folder text-mc-text text-[11px] flex-shrink-0 w-3.5 text-center'; }
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

export function collapseAll() {
  el.fileTree.querySelectorAll('li > div[role="group"]').forEach(c => c.classList.add('hidden'));
  el.fileTree.querySelectorAll('li[role="treeitem"]').forEach(li => {
    if (li.getAttribute('aria-expanded') !== null) li.setAttribute('aria-expanded', 'false');
  });
  el.fileTree.querySelectorAll('[data-path] > i').forEach(icon => {
    if (icon.classList.contains('fa-folder-open')) {
      icon.className = 'fa-solid fa-folder text-mc-text text-[11px] flex-shrink-0 w-3.5 text-center';
    }
  });
}

export function filterTree(query) {
  query = query.toLowerCase().trim();
  const allLIs = Array.from(el.fileTree.querySelectorAll('li[data-tree-path]'));

  if (!query) {
    allLIs.forEach(li => {
      li.style.display = '';
      const row = li.querySelector('[data-path]');
      if (row) row.classList.remove('bg-mc-bg3');
    });
    return;
  }

  function processLI(li) {
    const path = li.dataset.treePath || '';
    const name = path.split('/').pop().toLowerCase();
    const row = li.querySelector('[data-path]');
    const childContainer = li.querySelector(':scope > div[role="group"]');

    let selfMatch = name.includes(query);
    let childMatch = false;

    if (childContainer) {
      const childLIs = Array.from(childContainer.querySelectorAll(':scope > ul > li'));
      childLIs.forEach(c => { if (processLI(c)) childMatch = true; });
      childContainer.classList.toggle('hidden', !childMatch);
      if (childMatch && li.getAttribute('aria-expanded') === 'false') {
        childContainer.classList.remove('hidden');
        li.setAttribute('aria-expanded', 'true');
        const icon = row.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-folder-open text-mc-text text-[11px] flex-shrink-0 w-3.5 text-center';
      }
    }

    const visible = selfMatch || childMatch;
    li.style.display = visible ? '' : 'none';
    if (row) {
      row.classList.toggle('bg-mc-bg3', selfMatch && !childContainer);
    }
    return visible;
  }

  const topUL = el.fileTree.querySelector(':scope > ul');
  if (topUL) {
    Array.from(topUL.querySelectorAll(':scope > li')).forEach(processLI);
  }
}