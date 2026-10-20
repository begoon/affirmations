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
 api: { async sendPhoto(p) {sent.push(p);return {message_id:sent.length};}, async sendMessage(p) { if (failOperator && p.chat_id !== 7) throw {code:403}; sent.push(p); return {message_id:sent.length}; }, async answerCallbackQuery(p) {answers.push(p);} },
 db: {
  insert(table) { const rows=tableRows(table); let value; return {values(v){value=v;return this},onConflictDoNothing(){return this},returning(){return this},async run(){if(rows.has(value.id)) return []; rows.set(value.id, structuredClone(value)); return [structuredClone(value)];}} },
  select() {let pred,rows;return {from(table){rows=tableRows(table);return this},where(p){pred=p;return this},async get(){return structuredClone([...rows.values()].find(pred))}}},
  update() {let value,pred;return {set(v){value=v;return this},where(p){pred=p;return this},returning(){return this},async run(){const found=[...rows.values()].filter(pred); for(const r of found) Object.assign(r,structuredClone(value)); return found;}}},
 }
};
const {handle} = await import('../tgcloud/lib/bot.js');
const message = text => ({from:{id:7},chat:{id:7,type:'private'},text});
test('handler rejects unresolvable/duplicate buttons and keeps help retryable on failure', async () => {
 rows=new Map();otherTables.clear();sent=[];answers=[];failOperator=false;
 await handle(message('/start'),{update:{update_id:1}});
 await handle(clickData(dataFor(sent.at(-1),'start')),{update:{update_id:2}});
 assert.equal(rows.get(7).data.new,false);
 await handle(clickData('a:edit:missing:a'),{update:{update_id:3}});
 assert.match(answers.at(-1).text,/недоступен/);
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

function seedExisting(texts = ['Alpha', 'Beta', 'Gamma']) {
 rows = new Map([[7, {id:7, revision:10, data:{language:'ru',new:false,mode:'main',texts,current:0,favorites:[],view:'all',lastUpdate:-1}}]]);
 otherTables.clear(); sent=[]; answers=[]; failOperator=false;
}
function clickData(data, text = '') {
 return {id:'click',from:{id:7},message:{chat:{id:7,type:'private'},text},data};
}
function dataFor(outgoing, action) {
 return outgoing.reply_markup.inline_keyboard.flat().find(b=>b.callback_data.startsWith(`a:${action}:`) || (action==='reset' && b.callback_data.startsWith('r:'))).callback_data;
}
test('old buttons keep targeting the same ID after navigation, edits and index shifts', async () => {
 seedExisting();
 await handle(message('/start'));
 const alpha = sent.at(-1);
 const alphaId = rows.get(7).data.textIds[0];
 const betaId = rows.get(7).data.textIds[1];
 await handle(clickData(dataFor(alpha,'more')));
 await handle(clickData(dataFor(alpha,'favorite')));
 assert.deepEqual(rows.get(7).data.favorites,[0]);
 // The original empty heart toggles the actual current favourite status.
 await handle(clickData(dataFor(alpha,'favorite')));
 assert.deepEqual(rows.get(7).data.favorites,[]);
 await handle(clickData(dataFor(alpha,'edit')));
 await handle(message('Edited Alpha'));
 assert.equal(rows.get(7).data.texts[0],'Edited Alpha');
 assert.equal(rows.get(7).data.textIds[0],alphaId);
 await handle(clickData(dataFor(alpha,'delete')));
 const confirmation = dataFor(sent.at(-1),'confirmDelete');
 await handle(message('/start'));
 await handle(clickData(`a:favorite:${betaId}:a`));
 await handle(clickData(confirmation));
 assert.deepEqual(rows.get(7).data.texts,['Beta','Gamma']);
 assert.deepEqual(rows.get(7).data.favorites,[0]);
 assert.equal(rows.get(7).data.textIds[0],betaId);
 await handle(clickData(dataFor(alpha,'edit')));
 assert.match(answers.at(-1).text,/недоступен/);
 await handle(clickData(`a:edit:${betaId}:a`));
 await handle(message('Edited Beta'));
 assert.equal(rows.get(7).data.texts[0],'Edited Beta');
 // Navigation and create controls remain usable even on a deleted text's message.
 await handle(clickData(dataFor(alpha,'create')));
 await handle(message('Delta'));
 assert.equal(rows.get(7).data.texts.at(-1),'Delta');
});
test('reset invalidates IDs and old reset confirmations cannot erase newer data', async () => {
 seedExisting(); await handle(message('/start'));
 const old = sent.at(-1);
 await handle(message('/reset'));
 const reset = dataFor(sent.at(-1),'reset');
 await handle(clickData(reset));
 await handle(clickData(dataFor(sent.at(-1),'start')));
 const before = structuredClone(rows.get(7).data);
 await handle(clickData(dataFor(old,'delete')));
 assert.match(answers.at(-1).text,/недоступен/);
 await handle(clickData(reset));
 assert.match(answers.at(-1).text,/сброса/);
 assert.deepEqual(rows.get(7).data,before);
});
test('legacy callbacks are rejected without changing state', async () => {
 seedExisting();
 await handle(message('/reset'));
 const before = structuredClone(rows.get(7));
 for (const action of ['start', 'create', 'edit', 'favorite', 'delete', 'confirmDelete', 'reset']) {
   await handle(clickData(`${before.revision}:${action}`, '────────────\n\nAlpha\n\n────────────'));
   assert.match(answers.at(-1).text,/недоступен/);
   assert.deepEqual(rows.get(7),before);
 }
});
test('duplicate updates do not toggle twice', async () => {
 seedExisting(['Same','Same']);
 await handle(message('/start'),{update:{update_id:1}});
 const click = clickData(dataFor(sent.at(-1),'favorite'));
 await handle(click,{update:{update_id:2}});
 await handle(click,{update:{update_id:2}});
 assert.deepEqual(rows.get(7).data.favorites,[0]);
 const outgoing=sent.at(-1);
 assert.ok(outgoing.reply_markup.inline_keyboard.flat().every(b=>Buffer.byteLength(b.callback_data)<=64));
});
test('captures complete Telegram user fields, refreshes them, and preserves profile through reset', async () => {
 seedExisting();
 const from = {id:7,is_bot:false,first_name:'Анна',last_name:'Тест',username:'example',language_code:'ru',is_premium:true,extra_future_field:'kept'};
 await handle({...message('/start'),from});
 assert.deepEqual(rows.get(7).data.telegramUser,from);
 const firstSeen=rows.get(7).data.profileFirstSeenAt;
 assert.ok(firstSeen); assert.ok(rows.get(7).data.profileLastSeenAt);
 const updated={id:7,is_bot:false,first_name:'Анна'};
 await handle({...message('/reset'),from:updated});
 assert.deepEqual(rows.get(7).data.telegramUser,updated);
 const reset=dataFor(sent.at(-1),'reset');
 await handle({...clickData(reset),from:updated});
 assert.deepEqual(rows.get(7).data.telegramUser,updated);
 assert.equal(rows.get(7).data.profileFirstSeenAt,firstSeen);
 assert.equal(rows.get(7).data.new,true);
});

test('welcome uses logo and Start button; normal texts stay plain messages; reset shows logo again', async () => {
 rows=new Map();otherTables.clear();sent=[];answers=[];failOperator=false;
 await handle(message('/start'));
 const welcome=sent.at(-1);
 assert.equal(welcome.caption,'Добро пожаловать!');
 assert.match(welcome.photo,/bot-logo\.png$/);
 assert.equal(welcome.text,undefined);
 await handle(clickData(dataFor(welcome,'start')));
 assert.equal(rows.get(7).data.new,false);
 assert.equal(sent.at(-1).photo,undefined);
 assert.ok(sent.at(-1).text);
 await handle(message('/reset'));
 await handle(clickData(dataFor(sent.at(-1),'reset')));
 assert.equal(sent.at(-1).caption,'Добро пожаловать!');
 assert.equal(sent.at(-1).photo,welcome.photo);
});
test('failed welcome photo falls back to usable text onboarding', async () => {
 rows=new Map();otherTables.clear();sent=[];answers=[];failOperator=false;
 const original=globalThis.mockSdk.api.sendPhoto;
 globalThis.mockSdk.api.sendPhoto=async()=>{throw {code:400};};
 try {
   await handle(message('/start'));
   assert.equal(sent.at(-1).text,'Добро пожаловать!');
   assert.ok(dataFor(sent.at(-1),'start'));
   assert.equal(rows.get(7).data.new,true);
 } finally {globalThis.mockSdk.api.sendPhoto=original;}
});
