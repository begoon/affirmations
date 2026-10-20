import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'sdk' || specifier === 'sdk/db') return { url: `mock:${specifier}`, shortCircuit: true };
  return next(specifier, context);
}, load(url, context, next) {
  if (url === 'mock:sdk') return { format: 'module', source: 'export const {api,db} = globalThis.mockSdk;', shortCircuit: true };
  if (url === 'mock:sdk/db') return { format: 'module', source: `const c = name => ({name, primaryKey(){return this},notNull(){return this},default(){return this}}); export const integer=c,json=c; export const table=(name,cols)=>cols; export const eq=(c,v)=>r=>r[c.name]===v; export const and=(...ps)=>r=>ps.every(p=>p(r));`, shortCircuit: true };
  return next(url, context);
}});
let rows, sent, answers, failOperator;
globalThis.mockSdk = {
 api: { async sendMessage(p) { if (failOperator && p.chat_id !== 7) throw {code:403}; sent.push(p); return {message_id:sent.length}; }, async answerCallbackQuery(p) {answers.push(p);} },
 db: {
  insert() { let value; return {values(v){value=v;return this},onConflictDoNothing(){return this},async run(){if(!rows.has(value.id)) rows.set(value.id, structuredClone(value));}} },
  select() {let pred;return {from(){return this},where(p){pred=p;return this},async get(){return structuredClone([...rows.values()].find(pred))}}},
  update() {let value,pred;return {set(v){value=v;return this},where(p){pred=p;return this},returning(){return this},async run(){const found=[...rows.values()].filter(pred); for(const r of found) Object.assign(r,structuredClone(value)); return found;}}},
 }
};
const {handle} = await import('../tgcloud/lib/bot.js');
const message = text => ({from:{id:7},chat:{id:7,type:'private'},text});
const button = (revision,action) => ({id:'callback',from:{id:7},message:{chat:{id:7,type:'private'}},data:`${revision}:${action}`});
test('handler rejects stale/duplicate buttons and keeps help retryable on failure', async () => {
 rows=new Map();sent=[];answers=[];failOperator=false;
 await handle(message('/start'),{update:{update_id:1}});
 await handle(button(1,'start'),{update:{update_id:2}});
 assert.equal(rows.get(7).data.new,false);
 await handle(button(1,'edit'),{update:{update_id:3}});
 assert.match(answers.at(-1).text,/устарела/);
 assert.equal(rows.get(7).data.mode,'main');
 await handle(message('/help'),{update:{update_id:4}});
 failOperator=true;
 await handle(message('Question'),{update:{update_id:5}});
 assert.equal(rows.get(7).data.mode,'help'); assert.match(sent.at(-1).text,/Не удалось/);
 failOperator=false;
 await handle(message('Question'),{update:{update_id:6}});
 assert.equal(rows.get(7).data.mode,'helpSent');
 const count=sent.length;
 await handle(message('Question'),{update:{update_id:6}});
 assert.equal(sent.length,count);
});
