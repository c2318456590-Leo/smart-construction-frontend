/**
 * helpers.js — UI DOM 辅助函数
 * 本次修改：将卡片、行、文本更新等可复用 DOM 操作从 UIManager.js 拆出。
 */

export function makeCard(title) {
    const root = document.createElement('div');
    root.className = 'ui-card';
    const titleEl = document.createElement('div');
    titleEl.className = 'card-title';
    titleEl.textContent = title;
    const body = document.createElement('div');
    root.appendChild(titleEl);
    root.appendChild(body);
    return { root, body };
}

export function makeRow(label, id, initVal, extraClass = '') {
    const row = document.createElement('div');
    row.className = 'card-row';
    const lab = document.createElement('span');
    lab.className = 'card-label';
    lab.textContent = label;
    const val = document.createElement('span');
    val.className = 'card-value ' + extraClass;
    val.id = id;
    val.textContent = initVal;
    row.appendChild(lab);
    row.appendChild(val);
    return row;
}

export function setText(el, text) {
    if (el) el.textContent = text;
}
