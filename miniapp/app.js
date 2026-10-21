const tg = window.Telegram?.WebApp;
const $ = id => document.getElementById(id);
let collection, favoritesOnly = false, busy = false, target, currentId;
const call = input => new Promise((resolve, reject) => {
  let finished = false;
  const timer = setTimeout(() => { finished = true; reject(new Error('Ответ не получен. Обновите список перед повторной попыткой.')); }, 20000);
  tg.Serverless.call('affirmations', input, (error, result) => {
    if (finished) return;
    clearTimeout(timer);
    error ? reject(error) : resolve(result);
  });
});
function lock(value) {
  busy = value;
  document.querySelectorAll('button').forEach(button => { button.disabled = value; });
  $('list').setAttribute('aria-busy', String(value));
}
function message(text) { $('status').textContent = text; }
function button(text, label, handler, className = '') {
  const b = document.createElement('button');
  b.textContent = text; b.className = className; b.setAttribute('aria-label', label);
  b.addEventListener('click', handler); return b;
}
function render(next = false) {
  $('list').replaceChildren();
  $('all').setAttribute('aria-pressed', String(!favoritesOnly));
  $('favorites').setAttribute('aria-pressed', String(favoritesOnly));
  const items = collection.items.filter(item => !favoritesOnly || item.favorite);
  message(`${favoritesOnly ? 'В избранном' : 'Всего текстов'}: ${items.length}`);
  $('next').hidden = !items.length;
  if (!items.length) {
    currentId = undefined;
    const empty = document.createElement('p'); empty.className = 'empty';
    empty.textContent = collection.needsStart ? 'Отправьте боту /start и нажмите «Начать», затем обновите список.' : favoritesOnly ? 'Здесь будут любимые слова. Добавьте текст сердечком во вкладке «Все тексты».' : 'Пока нет текстов. Добавьте свою аффирмацию кнопкой «➕» в чате с ботом.';
    $('list').append(empty);
  }
  if (items.length) {
    let item = items.find(item => item.id === currentId);
    if (next || !item) {
      const others = items.filter(item => item.id !== currentId);
      const choices = others.length ? others : items;
      item = choices[Math.floor(Math.random() * choices.length)];
    }
    currentId = item.id;
    const card = document.createElement('article'); card.className = 'card';
    const p = document.createElement('p'); p.className = 'affirmation'; p.textContent = item.text;
    const actions = document.createElement('div'); actions.className = 'card-actions';
    const heart = button(item.favorite ? '♥' : '♡', item.favorite ? 'Убрать из избранного' : 'В избранное', () => mutate({ action: 'favorite', id: item.id, favorite: !item.favorite, revision: collection.revision }), 'heart');
    heart.setAttribute('aria-pressed', String(item.favorite));
    actions.append(heart, button('Изменить', 'Изменить аффирмацию', () => {
      target = { id: item.id, revision: collection.revision }; $('text').value = item.text;
      $('edit-error').textContent = ''; $('editor').showModal();
    }), button('Удалить', 'Удалить аффирмацию', () => {
      target = { id: item.id, revision: collection.revision }; $('delete-text').textContent = item.text;
      $('delete-error').textContent = ''; $('deletion').showModal();
    }, 'delete'));
    card.append(p, actions); $('list').append(card);
  }
}
async function refresh() {
  if (busy) return;
  lock(true); message('Обновляем подборку…');
  try { collection = await call({ action: 'list' }); render(); }
  catch (error) { message(error.message || 'Не удалось загрузить список. Попробуйте обновить.'); }
  finally { lock(false); }
}
async function mutate(input, dialog, errorId) {
  if (busy) return;
  lock(true);
  try {
    collection = await call(input); dialog?.close(); render();
    message(input.action === 'delete' ? 'Аффирмация удалена.' : 'Сохранено.');
  } catch (error) {
    const text = error.message || 'Не удалось сохранить. Обновите список и повторите действие.';
    if (errorId) $(errorId).textContent = text;
    message(text);
    // Keep a draft open on conflict; never silently retry it against a newer revision.
    if (['CONFLICT', 'NOT_FOUND'].includes(error.parameters?.code)) {
      try { collection = await call({ action: 'list' }); render(); message(text); } catch { /* Explicit refresh remains available. */ }
    }
  } finally { lock(false); }
}
$('all').onclick = () => { favoritesOnly = false; if (collection) render(); };
$('favorites').onclick = () => { favoritesOnly = true; if (collection) render(); };
$('refresh').onclick = refresh;
$('next').onclick = () => { if (!busy && collection) render(true); };
$('edit-cancel').onclick = () => $('editor').close();
$('delete-cancel').onclick = () => $('deletion').close();
for (const id of ['editor', 'deletion']) $(id).addEventListener('cancel', event => { if (busy) event.preventDefault(); });
$('edit-form').onsubmit = event => {
  event.preventDefault();
  const text = $('text').value.trim();
  if (!text) { $('edit-error').textContent = 'Введите непустой текст.'; return; }
  mutate({ action: 'edit', ...target, text }, $('editor'), 'edit-error');
};
$('delete-confirm').onclick = () => mutate({ action: 'delete', ...target }, $('deletion'), 'delete-error');
$('install').onclick = () => tg.addToHomeScreen();
if (!tg?.initData || !tg?.Serverless?.call) {
  message('Откройте мини-приложение кнопкой из команды /view в Telegram. При необходимости обновите Telegram.');
  lock(true);
} else {
  tg.ready(); tg.expand();
  const theme = () => { document.documentElement.style.colorScheme = tg.colorScheme || 'light'; };
  theme(); tg.onEvent('themeChanged', theme);
  if (tg.isVersionAtLeast('8.0') && ['ios', 'android'].includes(tg.platform)) {
    tg.checkHomeScreenStatus(status => { $('install').hidden = !['missed', 'unknown'].includes(status); });
    tg.onEvent('homeScreenAdded', () => { $('install').hidden = true; message('Значок добавлен на главный экран.'); });
  }
  // Fetch fresh data when returning from chat, without discarding an open edit draft.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$('editor').open && !$('deletion').open) refresh();
  });
  refresh();
}
