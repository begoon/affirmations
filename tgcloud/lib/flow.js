import { languages, seeds } from './content.js';
import { ensureTextIds } from './buttons.js';
export function initial(id) {
  return { language: 'ru', new: true, mode: 'welcome', texts: [...seeds.common], current: -1, favorites: [], view: 'all', legacyButtons: false, lastUpdate: -1 };
}
export function transition(original, event, random = Math.random) {
  const s = JSON.parse(JSON.stringify(original));
  // Existing users acquire favourites without losing their saved texts.
  s.favorites ??= [];
  s.view ??= 'all';
  const revision = event.revision ?? 0;
  ensureTextIds(s, revision);
  if (event.targetIndex !== undefined) {
    s.current = event.targetIndex;
    s.mode = event.action === 'confirmDelete' ? 'delete' : 'main';
    s.view = event.view ?? 'all';
    // A formerly saved text is still usable from an old favourites message.
    if (!s.favorites.includes(s.current)) s.view = 'all';
  } else if (event.action && event.view !== undefined && event.action !== 'reset' && !s.new) {
    s.mode = 'main';
    s.view = event.view ?? s.view;
  }
  const t = languages[s.language] || languages.ru;
  let text, buttons = [], question, isAffirmation = false;
  const main = (pick = false) => {
    s.mode = 'main';
    const pool = s.view === 'favorites' ? s.favorites : s.texts.map((_, i) => i);
    if (!pool.length) {
      text = s.view === 'favorites' ? t.favoritesEmpty : t.textsEmpty;
      buttons = s.view === 'favorites' ? [['all']] : [['create']];
      return;
    }
    if (pick || !pool.includes(s.current)) {
      const choices = pool.filter(i => i !== s.current);
      s.current = choices.length ? choices[Math.floor(random() * choices.length)] : pool[0];
    }
    text = s.texts[s.current];
    isAffirmation = true;
    buttons = [['more'], [s.favorites.includes(s.current) ? 'unfavorite' : 'favorite', 'edit', 'create', 'delete']];
    if (s.view === 'favorites') buttons.push(['all']);
  };
  const welcome = () => { s.mode = 'welcome'; text = t.welcome; buttons = [['start']]; };
  const back = () => s.new ? welcome() : main();
  const prompt = mode => { s.mode = mode; text = t[mode + 'Prompt']; buttons = [[mode === 'reset' ? 'reset' : 'cancel']]; if(mode === 'reset') buttons[0].push('cancel'); };
  const cmd = event.text?.trim().split(/\s/)[0].split('@')[0];
  if (cmd === '/reset') prompt('reset');
  else if (cmd === '/help') prompt('help');
  else if (cmd === '/start') { s.view = 'all'; back(); }
  else if (cmd === '/favorites') { s.view = 'favorites'; if (s.new) welcome(); else main(); }
  else if (event.action) {
    const a = event.action;
    if (a === 'reset' && s.mode === 'reset') { Object.assign(s, initial(event.userId)); s.texts = []; s.textIds = []; s.legacyMessages = []; welcome(); }
    else if (a === 'confirmDelete' && s.mode === 'delete' && s.current >= 0 && s.current < s.texts.length) {
      const removed = s.current;
      s.legacyMessages = s.legacyMessages.filter(item => item.id !== s.textIds[removed]);
      s.texts.splice(removed, 1);
      s.textIds.splice(removed, 1);
      s.favorites = s.favorites.filter(i => i !== removed).map(i => i > removed ? i - 1 : i);
      s.current = -1;
      main(true);
    }
    else if (a === 'cancel' || (a === 'continue' && ['main', 'helpSent'].includes(s.mode))) back();
    else if (a === 'start' && s.new) { s.new = false; if (!s.texts.length) s.texts = [...seeds.common]; s.textIds = undefined; ensureTextIds(s, revision); main(true); }
    else if (!s.new && s.mode === 'main' && a === 'all') { s.view = 'all'; main(); }
    else if (!s.new && s.mode === 'main' && ['favorite', 'unfavorite'].includes(a) && s.current >= 0 && s.current < s.texts.length && (s.view !== 'favorites' || s.favorites.length)) {
      if (!s.favorites.includes(s.current)) s.favorites.push(s.current);
      else s.favorites = s.favorites.filter(i => i !== s.current);
      main();
    }
    else if (!s.new && s.mode === 'main' && a === 'more') main(true);
    else if (!s.new && s.mode === 'main' && a === 'delete' && s.current >= 0 && s.current < s.texts.length) {
      s.mode = 'delete';
      text = `${t.deletePrompt}\n\n${s.texts[s.current]}`;
      buttons = [['confirmDelete', 'cancel']];
    }
    else if (!s.new && s.mode === 'main' && (a === 'create' || (a === 'edit' && s.current >= 0 && s.current < s.texts.length))) prompt(a);
    else back();
  } else if (['edit', 'create', 'help'].includes(s.mode) && !cmd?.startsWith('/')) {
    const value = event.text?.trim();
    if (!value || value.length > 4000) { text = t.invalidText; buttons = [['cancel']]; }
    else if (s.mode === 'help') { question = value; s.mode = 'helpSent'; text = t.helpSent; buttons = [['continue']]; }
    else { if(s.mode === 'edit') s.texts[s.current] = value; else { s.texts.push(value); s.textIds.push(`${revision.toString(36)}.n`); s.current = s.texts.length - 1; s.view = 'all'; } main(); }
  } else if (s.new) welcome();
  else { text = t.unknown; buttons = [['continue']]; if(s.mode !== 'main') buttons = [['cancel']]; }
  ensureTextIds(s, revision);
  return { state: s, text, buttons, question, isAffirmation };
}
