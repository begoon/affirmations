import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, transition } from '../tgcloud/lib/flow.js';
import { seeds } from '../tgcloud/lib/content.js';
const step = (s, event) => transition(s, { userId: 1, ...event }, () => 0);
const start = () => step(initial(1), { action: 'start' }).state;
test('welcome, explicit start, isolated seeds and special user', () => {
  const s = initial(1);
  assert.equal(step(s, { text: '/start' }).text, 'Добро пожаловать!');
  assert.equal(s.new, true); assert.equal(start().new, false);
  s.texts[0] = 'changed'; assert.notEqual(initial(2).texts[0], 'changed');
  assert.deepEqual(initial(429995878).texts, seeds['429995878']);
});
test('random excludes current; editing and creating retain personal texts', () => {
  let s = start(); const old = s.current;
  s = step(s, { action: 'more' }).state; assert.notEqual(s.current, old);
  s = step(s, { action: 'edit' }).state;
  s = step(s, { text: 'Мой текст' }).state;
  assert.equal(s.texts[s.current], 'Мой текст');
  const n = s.texts.length;
  s = step(s, { action: 'create' }).state;
  assert.equal(step(s, { text: ' ' }).state.texts.length, n);
  assert.equal(step(s, { text: 'x'.repeat(4001) }).state.mode, 'create');
  s = step(s, { text: 'Новый текст' }).state;
  assert.equal(s.texts.length, n + 1); assert.equal(s.texts[s.current], 'Новый текст');
});
test('help waits for question and continues; commands interrupt input', () => {
  let s = step(start(), { text: '/help' }).state;
  assert.equal(step(s, {}).state.mode, 'help');
  const result = step(s, { text: 'Вопрос?' }); assert.equal(result.question, 'Вопрос?');
  assert.equal(step(result.state, { action: 'continue' }).state.mode, 'main');
  assert.equal(step(s, { text: '/reset' }).state.mode, 'reset');
});
test('reset requires confirmation, removes texts, reseeds on Start', () => {
  let s = start(); s.texts.push('Personal');
  const asked = step(s, { text: '/reset' }).state;
  assert.deepEqual(step(asked, { action: 'cancel' }).state.texts, s.texts);
  s = step(asked, { action: 'reset' }).state;
  assert.equal(s.new, true); assert.deepEqual(s.texts, []);
  s = step(s, { action: 'start' }).state; assert.deepEqual(s.texts, seeds.common);
});
test('single text can repeat; cancel preserves current text', () => {
  let s = start(); s.texts = ['Only']; s.current = 0;
  assert.equal(step(s, { action: 'more' }).text, 'Only');
  s = step(s, { action: 'edit' }).state;
  assert.equal(step(s, { action: 'cancel' }).text, 'Only');
});
test('favourites migrate old users and toggle independently for each user', () => {
  const old = start(); delete old.favorites; delete old.view;
  let result = step(old, { text: '/start' });
  assert.deepEqual(result.state.favorites, []);
  assert.ok(result.buttons.flat().includes('favorite'));
  const index = result.state.current;
  result = step(result.state, { action: 'favorite' });
  assert.deepEqual(result.state.favorites, [index]);
  assert.ok(result.buttons.flat().includes('unfavorite'));
  assert.deepEqual(start().favorites, []);
  result = step(result.state, { action: 'unfavorite' });
  assert.deepEqual(result.state.favorites, []);
});
test('favourites browsing filters results and removing the last shows an empty view', () => {
  let s = start();
  s.favorites = [0, 2];
  s.current = 1;
  s = step(s, { text: '/favorites' }).state;
  assert.equal(s.current, 0);
  s = step(s, { action: 'more' }).state;
  assert.equal(s.current, 2);
  s = step(s, { action: 'unfavorite' }).state;
  assert.equal(s.current, 0);
  assert.equal(step(s, { action: 'more' }).state.current, 0);
  const empty = step(s, { action: 'unfavorite' });
  assert.match(empty.text, /пока нет/);
  assert.deepEqual(empty.buttons, [['all']]);
  assert.equal(step(empty.state, { action: 'all' }).state.view, 'all');
});
test('editing retains favourite identity; creating exits filter; reset clears favourites', () => {
  let s = start();
  s = step(s, { action: 'favorite' }).state;
  s = step(s, { text: '/favorites' }).state;
  const index = s.current;
  s = step(s, { action: 'edit' }).state;
  s = step(s, { text: 'Updated favourite' }).state;
  assert.equal(s.view, 'favorites'); assert.deepEqual(s.favorites, [index]);
  assert.equal(step(s, { action: 'more' }).text, 'Updated favourite');
  s = step(s, { action: 'create' }).state;
  s = step(s, { text: 'New text' }).state;
  assert.equal(s.view, 'all'); assert.equal(s.favorites.includes(s.current), false);
  s = step(s, { text: '/reset' }).state;
  assert.deepEqual(step(s, { action: 'reset' }).state.favorites, []);
});
test('start exits favourites; help and cancel preserve the filter; new users see welcome', () => {
  assert.equal(step(initial(1), { text: '/favorites' }).state.new, true);
  let s = start(); s.favorites = [s.current];
  s = step(s, { text: '/favorites' }).state;
  s = step(s, { text: '/help' }).state;
  assert.equal(step(s, { action: 'cancel' }).state.view, 'favorites');
  assert.equal(step(s, { text: '/start' }).state.view, 'all');
});
