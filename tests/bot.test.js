import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'sdk' || specifier === 'sdk/db') return { url: `mock:${specifier}`, shortCircuit: true };
  return next(specifier, context);
}, load(url, context, next) {
  if (url === 'mock:sdk') return { format: 'module', source: 'export const {api,db} = globalThis.mockSdk;', shortCircuit: true };
  if (url === 'mock:sdk/db') return { format: 'module', source: `const c = name => ({name, primaryKey(){return this},notNull(){return this},default(){return this}}); export const integer=c,json=c; export const table=(name,cols)=>{for(const key of Object.keys(cols)) cols[key].name=key;return {...cols,tableName:name}}; export const eq=(c,v)=>r=>r[c.name]===v; export const and=(...ps)=>r=>ps.every(p=>p(r));`, shortCircuit: true };
  return next(url, context);
}});
let rows, sent, answers, failOperator;
const otherTables = new Map();
const tableRows = table => table.tableName === 'users' ? rows : (otherTables.has(table.tableName) ? otherTables.get(table.tableName) : (otherTables.set(table.tableName, new Map()), otherTables.get(table.tableName)));
globalThis.mockSdk = {
 api: { async sendMessage(p) { if (failOperator && p.chat_id !== 7) throw {code:403}; sent.push(p); return {message_id:sent.length}; }, async answerCallbackQuery(p) {answers.push(p);} },
 db: {
  insert(table) { const rows=tableRows(table); let value; return {values(v){value=v;return this},onConflictDoNothing(){return this},returning(){return this},async run(){if(rows.has(value.id)) return []; rows.set(value.id, structuredClone(value)); return [structuredClone(value)];}} },
  select() {let pred,rows;return {from(table){rows=tableRows(table);return this},where(p){pred=p;return this},async get(){return structuredClone([...rows.values()].find(pred))}}},
  update() {let value,pred;return {set(v){value=v;return this},where(p){pred=p;return this},returning(){return this},async run(){const found=[...rows.values()].filter(pred); for(const r of found) Object.assign(r,structuredClone(value)); return found;}}},
 }
};
const {handle} = await import('../tgcloud/lib/bot.js');
const message = text => ({from:{id:7},chat:{id:7,type:'private'},text});
const button = (revision,action) => ({id:'callback',from:{id:7},message:{chat:{id:7,type:'private'}},data:`${revision}:${action}`});
test('handler rejects stale/duplicate buttons and keeps help retryable on failure', async () => {
 rows=new Map();otherTables.clear();sent=[];answers=[];failOperator=false;
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

const { operatorId } = await import('../tgcloud/lib/content.js');
const { supportMessages } = await import('../tgcloud/schema.js');
test('operator replies privately, deduplicates and preserves both conversation states', async () => {
 rows=new Map();otherTables.clear();sent=[];answers=[];failOperator=false;
 await handle(message('/help'));
 await handle(message('Private question'));
 const notice = sent.findIndex(p => p.text.startsWith('📩')) + 1;
 assert.ok(notice);
 assert.match(sent[notice-1].text, /Ответить/);
 const before = structuredClone([...rows]);
 const reply = {from:{id:operatorId},chat:{id:operatorId,type:'private'},message_id:100,reply_to_message:{message_id:notice},text:'My answer'};
 await handle(reply);
 assert.equal(sent.at(-2).chat_id,7);
 assert.equal(sent.at(-2).text,'💬 Ответ поддержки\n\nMy answer');
 assert.deepEqual([...rows],before);
 const count=sent.length;
 await handle(reply); assert.equal(sent.length,count);
 // Ordinary users cannot relay answers, even with a real notification ID.
 await handle({...message('Forged'),message_id:101,reply_to_message:{message_id:notice}});
 assert.equal(sent.some(p=>p.text==='💬 Ответ поддержки\n\nForged'),false);
 // Unknown messages and attachments never fall through into affirmation input.
 await handle({...reply,message_id:102,reply_to_message:{message_id:999}});
 assert.match(sent.at(-1).text,/Старые уведомления/);
 await handle({...reply,message_id:103,text:undefined});
 assert.match(sent.at(-1).text,/непустой текст/);
});
test('self-support and long questions work; blocked recipients give a failure confirmation', async () => {
 rows=new Map();otherTables.clear();sent=[];answers=[];failOperator=false;
 const own = text => ({from:{id:operatorId},chat:{id:operatorId,type:'private'},text});
 await handle(own('/help'));
 await handle(own('x'.repeat(4000)));
 const notices = sent.map((p,i)=>({p,id:i+1})).filter(({p})=>p.text.startsWith('📩'));
 assert.equal(notices.length,2);
 assert.ok(sent.every(p=>p.text.length<=4096));
 const reply = {...own('Self answer'),message_id:200,reply_to_message:{message_id:notices[0].id}};
 await handle(reply);
 assert.equal(sent.at(-2).chat_id,operatorId);
 assert.match(sent.at(-2).text,/Self answer/);
 // Mock a blocked recipient while allowing operator status messages.
 const original=globalThis.mockSdk.api.sendMessage;
 globalThis.mockSdk.api.sendMessage=async p=>{if(p.text.startsWith('💬')) throw {code:403}; return original(p);};
 try {
   await handle({...reply,message_id:201});
   assert.match(sent.at(-1).text,/Не удалось доставить/);
 } finally { globalThis.mockSdk.api.sendMessage=original; }
});
