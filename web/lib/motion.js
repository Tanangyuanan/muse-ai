// Small, interruptible motion primitives. Content stays visible without animation.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const ease = 'cubic-bezier(.22, 1, .36, 1)';
const running = new Set();
const channels = new WeakMap();
const selections = new WeakMap();
let themeTransition;

export function play(element, frames, options = {}, channel = 'reveal') {
  if (!element) return null;
  const tracks = channels.get(element) || new Map();
  tracks.get(channel)?.cancel();
  if (reduced.matches || !element.animate) return null;
  const animation = element.animate(frames, { duration: 320, easing: ease, ...options });
  tracks.set(channel, animation);
  channels.set(element, tracks);
  running.add(animation);
  const cleanup = () => { running.delete(animation); if (tracks.get(channel) === animation) tracks.delete(channel); };
  animation.finished.then(cleanup, cleanup);
  return animation;
}

export function reveal(element, { x = 0, y = 12, delay = 0, duration = 360, scale = 1 } = {}) {
  return play(element, [{ opacity: 0, transform: `translate(${x}px, ${y}px) scale(${scale})` }, { opacity: 1, transform: 'translate(0, 0) scale(1)' }], { duration, delay, fill: 'backwards' });
}

function stagger(elements, gap = 45) {
  [...elements].slice(0, 8).forEach((element, index) => reveal(element, { delay: index * gap }));
}

export function selectionRect(selector) {
  return document.querySelector(selector)?.getBoundingClientRect();
}

export function moveSelection(previous, element) {
  if (!previous || !element || reduced.matches) return;
  const parent = element.parentElement;
  const prior = selections.get(parent);
  if (prior) { prior.animation?.cancel(); prior.marker.remove(); prior.element.classList.remove('motion-selected'); selections.delete(parent); }
  const next = element.getBoundingClientRect();
  const box = parent.getBoundingClientRect();
  if (!next.width || Math.abs(previous.x - next.x) < 1 && Math.abs(previous.width - next.width) < 1) return;
  const marker = document.createElement('span');
  marker.className = 'motion-selection';
  marker.setAttribute('aria-hidden', 'true');
  Object.assign(marker.style, { left: `${next.left - box.left}px`, top: `${next.top - box.top}px`, width: `${next.width}px`, height: `${next.height}px` });
  parent.prepend(marker);
  element.classList.add('motion-selected');
  const animation = play(marker, [
    { transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px) scaleX(${previous.width / next.width})` },
    { transform: 'translate(0, 0) scaleX(1)' },
  ], { duration: 300 }, 'selection');
  selections.set(parent, { marker, element, animation });
  const cleanup = () => {
    marker.remove();
    if (selections.get(parent)?.marker === marker) { element.classList.remove('motion-selected'); selections.delete(parent); }
  };
  if (animation) animation.finished.then(cleanup, cleanup); else cleanup();
}

export function animateView(before, after) {
  if (reduced.matches) return;
  const changed = !before || before.page !== after.page || before.id !== after.id;
  if (changed) {
    if (after.page === 'home') {
      stagger(document.querySelectorAll('.hero, .composer-heading, .content>.composer, .content>.composer-caption, .starters, .gallery-section'), 45);
    } else if (after.page === 'workspace') {
      reveal(document.querySelector('.chat-panel'), { x: -12, y: 0 });
      reveal(document.querySelector('.preview-panel'), { x: 20, y: 0, delay: 70, duration: 420 });
    } else {
      reveal(document.querySelector('.page-heading'));
      stagger(document.querySelectorAll('.gallery-full .sample-card, .collection-card, .memory-note, .memory-empty, .empty-state'), 40);
    }
    return;
  }
  if (before.type !== after.type) {
    moveSelection(before.mediaRect, document.querySelector('.media-tab.active'));
    reveal(document.querySelector('#prompt'), { y: 4, duration: 200 });
    reveal(document.querySelector('.starters'), { y: 5, duration: 240 });
  }
  if (before.filter !== after.filter) {
    moveSelection(before.filterRect, document.querySelector('.filter.active'));
    stagger(document.querySelectorAll('.sample-card, .collection-card, .empty-state'), 32);
  }
  if (after.messages > before.messages) {
    const messages = document.querySelectorAll('.chat-messages>.message');
    [...messages].slice(before.messages).forEach((element, index) => reveal(element, { y: 14, delay: index * 50 }));
  }
  if (after.busy && !before.busy) reveal(document.querySelector('.preview-empty'), { y: 8 });
  if (before.busy && !after.busy && after.versions > before.versions) animatePreview();
  if (before.mobileTab !== after.mobileTab) reveal(document.querySelector(`.${after.mobileTab === 'chat' ? 'chat' : 'preview'}-panel`), { x: after.mobileTab === 'chat' ? -14 : 14, y: 0, duration: 280 });
}

export function animatePreview(direction = 0) {
  const content = document.querySelector('.preview-content');
  const target = content?.querySelector('iframe, article, pre, .preview-empty');
  const enter = () => {
    if (!target?.isConnected) return;
    reveal(target, { x: direction * 24, y: direction ? 0 : 8, duration: 320 });
    reveal(document.querySelector('.speaker-note'), { y: 5, delay: 55, duration: 240 });
  };
  // Iframes animate when their real content is ready, never an empty white frame.
  if (target?.tagName === 'IFRAME') target.addEventListener('load', enter, { once: true }); else enter();
}

const railTargets = '.main-shell, .sidebar .brand, .sidebar .new-button, .sidebar .nav-item, .sidebar-toggle, .sidebar .profile .icon-button';
export function captureRail() {
  if (reduced.matches || innerWidth <= 760) return null;
  return { width: (document.querySelector('.rail-surface') || document.querySelector('.sidebar')).getBoundingClientRect().width, items: [...document.querySelectorAll(railTargets)].map(element => [element, element.getBoundingClientRect()]) };
}

export function animateRail(before, expanded) {
  if (!before || reduced.matches) return;
  const sidebar = document.querySelector('.sidebar');
  before.items.forEach(([element]) => channels.get(element)?.get('rail')?.cancel());
  const width = sidebar.getBoundingClientRect().width;
  sidebar.querySelector('.rail-surface')?.remove();
  const surface = document.createElement('span');
  surface.className = 'rail-surface';
  surface.setAttribute('aria-hidden', 'true');
  sidebar.prepend(surface);
  sidebar.classList.add('rail-moving');
  const sweep = play(surface, [{ transform: `scaleX(${before.width / width})` }, { transform: 'scaleX(1)' }], { duration: 380 });
  const cleanup = () => { surface.remove(); if (!sidebar.querySelector('.rail-surface')) sidebar.classList.remove('rail-moving'); };
  if (sweep) sweep.finished.then(cleanup, cleanup); else cleanup();
  for (const [element, previous] of before.items) {
    const next = element.getBoundingClientRect();
    const dx = previous.left - next.left, dy = previous.top - next.top;
    if (dx || dy) play(element, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 380 }, 'rail');
  }
  if (expanded) document.querySelectorAll('.sidebar .wordmark, .sidebar .brand-caption, .sidebar .nav-label, .sidebar .new-label, .sidebar .history-list, .sidebar .sidebar-label, .sidebar .profile-text').forEach(element => reveal(element, { x: -7, y: 0, delay: 70, duration: 250 }));
}

export function openSurface(dialog) {
  dialog.classList.remove('is-closing');
  return reveal(dialog, { y: 18, scale: .97, duration: 320 });
}

export function closeSurface(dialog, done) {
  dialog.classList.add('is-closing');
  const animation = play(dialog, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(8px) scale(.985)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
  const finish = () => { done(); animation?.cancel(); dialog.classList.remove('is-closing'); };
  if (animation) animation.finished.then(finish, () => {}); else finish();
}

export function transitionTheme(update) {
  themeTransition?.skipTransition();
  if (reduced.matches || !document.startViewTransition) { update(); return; }
  const transition = document.startViewTransition(update);
  themeTransition = transition;
  transition.ready.catch(() => {});
  transition.updateCallbackDone.catch(() => {});
  transition.finished.catch(() => {}).finally(() => { if (themeTransition === transition) themeTransition = null; });
}

export function buttonReady(button) {
  play(button, [{ transform: 'scale(.86)' }, { transform: 'scale(1.08)', offset: .6 }, { transform: 'scale(1)' }], { duration: 280 }, 'ready');
}

reduced.addEventListener('change', () => {
  if (!reduced.matches) return;
  // Finish rather than cancel so pending modal-close callbacks still run.
  running.forEach(animation => { try { animation.finish(); } catch { animation.cancel(); } });
  themeTransition?.skipTransition();
});
