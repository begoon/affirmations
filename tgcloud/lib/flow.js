import { languages, seeds } from './content.js';
export function initial(id) {
  return { language: 'ru', new: true, mode: 'welcome', texts: [...(seeds[String(id)] || seeds.common)], current: -1, favorites: [], view: 'all', lastUpdate: -1 };
}
export function transition(original, event, random = Math.random) {
  const s = JSON.parse(JSON.stringify(original));
  // Existing users acquire favourites without losing their saved texts.
  s.favorites ??= [];
  s.view ??= 'all';
  const t = languages[s.language] || languages.ru;
  let text, buttons = [], question, isAffirmation = false;
  const main = (pick = false) => {
    s.mode = 'main';
    const pool = s.view === 'favorites' ? s.favorites : s.texts.map((_, i) => i);
    if (!pool.length) {
      text = t.favoritesEmpty;
      buttons = [['all']];
      return;
    }
    if (pick || !pool.includes(s.current)) {
      const choices = pool.filter(i => i !== s.current);
      s.current = choices.length ? choices[Math.floor(random() * choices.length)] : pool[0];
    }
    text = s.texts[s.current];
    isAffirmation = true;
    buttons = [['more'], [s.favorites.includes(s.current) ? 'unfavorite' : 'favorite', 'edit', 'create']];
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
    if (a === 'reset' && s.mode === 'reset') { Object.assign(s, initial(event.userId)); s.texts = []; welcome(); }
    else if (a === 'cancel' || (a === 'continue' && ['main', 'helpSent'].includes(s.mode))) back();
    else if (a === 'start' && s.new) { s.new = false; if (!s.texts.length) s.texts = [...(seeds[String(event.userId)] || seeds.common)]; main(true); }
    else if (!s.new && s.mode === 'main' && a === 'all') { s.view = 'all'; main(); }
    else if (!s.new && s.mode === 'main' && ['favorite', 'unfavorite'].includes(a) && (s.view !== 'favorites' || s.favorites.length)) {
      if (a === 'favorite' && !s.favorites.includes(s.current)) s.favorites.push(s.current);
      if (a === 'unfavorite') s.favorites = s.favorites.filter(i => i !== s.current);
      main();
    }
    else if (!s.new && s.mode === 'main' && a === 'more') main(true);
    else if (!s.new && s.mode === 'main' && ['edit', 'create'].includes(a)) prompt(a);
    else back();
  } else if (['edit', 'create', 'help'].includes(s.mode) && !cmd?.startsWith('/')) {
    const value = event.text?.trim();
    if (!value || value.length > 4000) { text = t.invalidText; buttons = [['cancel']]; }
    else if (s.mode === 'help') { question = value; s.mode = 'helpSent'; text = t.helpSent; buttons = [['continue']]; }
    else { if(s.mode === 'edit') s.texts[s.current] = value; else { s.texts.push(value); s.current = s.texts.length - 1; s.view = 'all'; } main(); }
  } else if (s.new) welcome();
  else { text = t.unknown; buttons = [['continue']]; if(s.mode !== 'main') buttons = [['cancel']]; }
  return { state: s, text, buttons, question, isAffirmation };
}
