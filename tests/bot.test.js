import { languages } from '../tgcloud/lib/content.js';
import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'sdk' || specifier === 'sdk/db') return { url: `mock:${specifier}`, shortCircuit: true };
  return next(specifier, context);
}, load(url, context, next) {
  if (url === 'mock:sdk') return { format: 'module', source: 'export const {api,db} = globalThis.mockSdk; export class EndpointError extends Error { constructor(message, parameters) { super(message); this.parameters = parameters; } }', shortCircuit: true };
  if (url === 'mock:sdk/db') return { format: 'module', source: `const c = name => ({name, primaryKey(){return this},notNull(){return this},default(){return this}}); export const integer=c,json=c; export const table=(name,cols)=>{for(const key of Object.keys(cols)) cols[key].name=key;return {...cols,tableName:name}}; export const eq=(c,v)=>r=>r[c.name]===v; export const and=(...ps)=>r=>ps.every(p=>p(r)); export const gt=(c,v)=>r=>r[c.name]>v; export const asc=c=>(a,b)=>a[c.name]-b[c.name];`, shortCircuit: true };
  return next(url, context);
}});
let rows, sent, answers, failOperator;
const otherTables = new Map();
const tableRows = table => table.tableName === 'users' ? rows : (otherTables.has(table.tableName) ? otherTables.get(table.tableName) : (otherTables.set(table.tableName, new Map()), otherTables.get(table.tableName)));
globalThis.mockSdk = {
 api: { async sendPhoto(p) {sent.push(p);return {message_id:sent.length};}, async sendMessage(p) { if (failOperator && p.chat_id !== 7) throw {code:403}; sent.push(p); return {message_id:sent.length}; }, async answerCallbackQuery(p) {answers.push(p);} },
 db: {
  insert(table) { const rows=tableRows(table); let value; return {values(v){value=v;return this},onConflictDoNothing(){return this},returning(){return this},async run(){if(rows.has(value.id)) return []; rows.set(value.id, structuredClone(value)); return [structuredClone(value)];}} },
  select() {let pred,rows,sort,limit=Infinity;return {from(table){rows=tableRows(table);return this},where(p){pred=p;return this},orderBy(s){sort=s;return this},limit(n){limit=n;return this},async all(){return structuredClone([...rows.values()].filter(pred).sort(sort).slice(0,limit))},async get(){return structuredClone([...rows.values()].find(pred))}}},
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
 assert.equal(welcome.caption,languages.ru.welcome);
 assert.match(welcome.photo,/bot-logo\.png$/);
 assert.equal(welcome.text,undefined);
 await handle(clickData(dataFor(welcome,'start')));
 assert.equal(rows.get(7).data.new,false);
 assert.equal(sent.at(-1).photo,undefined);
 assert.ok(sent.at(-1).text);
 await handle(message('/reset'));
 await handle(clickData(dataFor(sent.at(-1),'reset')));
 assert.equal(sent.at(-1).caption,languages.ru.welcome);
 assert.equal(sent.at(-1).photo,welcome.photo);
});
test('failed welcome photo falls back to usable text onboarding', async () => {
 rows=new Map();otherTables.clear();sent=[];answers=[];failOperator=false;
 const original=globalThis.mockSdk.api.sendPhoto;
 globalThis.mockSdk.api.sendPhoto=async()=>{throw {code:400};};
 try {
   await handle(message('/start'));
   assert.equal(sent.at(-1).text,languages.ru.welcome);
   assert.ok(dataFor(sent.at(-1),'start'));
   assert.equal(rows.get(7).data.new,true);
 } finally {globalThis.mockSdk.api.sendPhoto=original;}
});

const { default: miniapp } = await import('../tgcloud/endpoints/affirmations.js');
const appContext = { initData: { user: { id: 7 } } };
const appList = () => miniapp({ action: 'list' }, appContext);
const appChange = (snapshot, action, index, extra = {}) => miniapp({ action, id: snapshot.items[index].id, revision: snapshot.revision, ...extra }, appContext);
test('/view launches the app, preserves input, and welcome explains both modes', async () => {
 seedExisting(); await handle(message('/start'));
 await handle(clickData(dataFor(sent.at(-1), 'edit')));
 const before = structuredClone(rows.get(7).data);
 await handle(message('/view@talking_brain_bot'), {update:{update_id:23}});
 assert.equal(rows.get(7).data.mode, 'edit');
 assert.equal(rows.get(7).data.current, before.current);
 assert.deepEqual(rows.get(7).data.texts, before.texts);
 assert.match(sent.at(-1).reply_markup.inline_keyboard[0][0].web_app.url, /^https:\/\/app\d+\.tgcloud.ai\/$/);
 const count = sent.length;
 await handle(message('/view'), {update:{update_id:23}}); assert.equal(sent.length, count);
 await handle(message('Still editing'), {update:{update_id:24}});
 assert.equal(rows.get(7).data.texts[0], 'Still editing');
 assert.match(languages.ru.welcome, /чате/); assert.match(languages.ru.welcome, /\/view/);
});
test('miniapp verifies caller, projects private data, migrates IDs, validates input and isolates users', async () => {
 seedExisting();
 const before = structuredClone(rows.get(7));
 for (const ctx of [{}, {initData:{user:{id:7,is_bot:true}}}]) {
   await assert.rejects(miniapp({action:'list'}, ctx), e => e.parameters.code === 'AUTH');
 }
 assert.deepEqual(rows.get(7), before);
 const list = await appList();
 assert.deepEqual(Object.keys(list).sort(), ['items','needsStart','revision']);
 assert.equal(list.items.length, 3); assert.equal(list.items[0].text, 'Alpha');
 assert.deepEqual(await appList(), list);
 rows.set(8, {id:8, revision:1, data:{...structuredClone(rows.get(7).data), texts:['Private'], textIds:['other']}});
 const other = structuredClone(rows.get(8));
 await assert.rejects(miniapp({action:'delete',id:'other',revision:list.revision,userId:8},appContext), e=>e.parameters.code==='NOT_FOUND');
 for (const text of ['', ' ', 'x'.repeat(4001), 123]) await assert.rejects(appChange(list,'edit',0,{text}), e=>e.parameters.code==='INVALID');
 await assert.rejects(appChange(list,'favorite',0,{favorite:'yes'}), e=>e.parameters.code==='INVALID');
 const updated = await appChange(list,'favorite',0,{favorite:true});
 assert.equal(updated.items[0].favorite,true); assert.deepEqual(rows.get(8),other);
 const edited = await appChange(updated,'edit',0,{text:' Edited '});
 assert.equal(edited.items[0].text,'Edited'); assert.equal(edited.items[0].favorite,true);
 assert.equal(edited.items[0].id,list.items[0].id);
 await assert.rejects(appChange(list,'delete',0), e=>e.parameters.code==='CONFLICT');
});
test('miniapp deletion shifts a pending chat edit safely and old chat buttons retain identity', async () => {
 seedExisting(); await handle(message('/start'));
 const alphaMessage=sent.at(-1);
 let list=await appList(); const betaId=list.items[1].id;
 await handle(clickData(`a:edit:${betaId}:a`));
 list=await appList(); await appChange(list,'delete',0);
 assert.equal(rows.get(7).data.current,0); assert.equal(rows.get(7).data.mode,'edit');
 await handle(message('Edited Beta'));
 assert.deepEqual(rows.get(7).data.texts,['Edited Beta','Gamma']);
 await handle(clickData(dataFor(alphaMessage,'favorite')));
 assert.match(answers.at(-1).text,/недоступен/);
 await handle(clickData(`a:favorite:${betaId}:a`));
 assert.deepEqual(rows.get(7).data.favorites,[0]);
 await handle(clickData(`a:edit:${betaId}:a`));
 list=await appList(); await appChange(list,'delete',0);
 assert.equal(rows.get(7).data.mode,'main');
 await handle(message('Must not edit Gamma'));
 assert.deepEqual(rows.get(7).data.texts,['Gamma']);
});
test('miniapp edit cancels pending same-text chat edit, but preserves help and lastUpdate', async () => {
 seedExisting(); await handle(message('/start'),{update:{update_id:9}});
 await handle(clickData(dataFor(sent.at(-1),'edit')));
 let list=await appList(); await appChange(list,'edit',0,{text:'From app'});
 await handle(message('Obsolete draft'));
 assert.equal(rows.get(7).data.texts[0],'From app');
 await handle(message('/help'));
 list=await appList(); await appChange(list,'delete',0);
 assert.equal(rows.get(7).data.mode,'help'); assert.equal(rows.get(7).data.lastUpdate,9);
});
test('miniapp handles last deletion, onboarding, reset and competing writes', async () => {
 seedExisting(['Only']); let list=await appList();
 const results=await Promise.allSettled([appChange(list,'edit',0,{text:'Winner'}),appChange(list,'delete',0)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.parameters.code,'CONFLICT');
 list=await appList();
 if(list.items.length) list=await appChange(list,'delete',0);
 assert.deepEqual(list.items,[]);
 await handle(message('/start')); assert.deepEqual(rows.get(7).data.texts,[]);
 await handle(message('/reset'));
 await handle(clickData(dataFor(sent.at(-1),'reset')));
 assert.equal((await appList()).needsStart,true);
 await assert.rejects(miniapp({action:'edit',revision:rows.get(7).revision,id:'old',text:'Bad'},appContext),e=>e.parameters.code==='START_REQUIRED');
 await handle(clickData(dataFor(sent.at(-1),'start')));
 const fresh=await appList(); assert.ok(fresh.items.length);
 assert.equal(fresh.items.some(x=>x.id===list.items[0]?.id),false);
});

test('/users is silently ignored for non-operators without reads, writes or replies', async () => {
 seedExisting();
 const before=structuredClone([...rows]);
 const originalSelect=globalThis.mockSdk.db.select, originalInsert=globalThis.mockSdk.db.insert;
 globalThis.mockSdk.db.select=()=>{throw Error('unauthorized database read')};
 globalThis.mockSdk.db.insert=()=>{throw Error('unauthorized database write')};
 try {
   for(const mode of ['main','edit','create','help']) {
     rows.get(7).data.mode=mode;
     for(const text of ['/users',' /users@talking_brain_bot ']) await handle({...message(text),reply_to_message:{message_id:123}});
     assert.equal(rows.get(7).data.mode,mode);
   }
   await handle({from:{id:999},chat:{id:999,type:'private'},text:'/users'});
   await handle({from:{id:operatorId},chat:{id:-100,type:'supergroup'},text:'/users'});
   assert.equal(sent.length,0);assert.equal(answers.length,0);
   rows.get(7).data.mode='main';assert.deepEqual([...rows],before);
 }finally{globalThis.mockSdk.db.select=originalSelect;globalThis.mockSdk.db.insert=originalInsert;}
});
test('/users lists paginated profiles only to operator, preserves state and splits messages', async () => {
 seedExisting(); rows.clear();
 for(let id=45;id>0;id--) rows.set(id,{id,revision:7,data:{mode:'edit',new:false,texts:['PRIVATE AFFIRMATION'],favorites:[0],current:0,lastUpdate:99,telegramUser:{first_name:`Saved ${id}`,last_name:'Last',username:'oldname',email:id===1?'saved@example.com':undefined},profileLastSeenAt:'2026-10-20T12:00:00Z'}});
 const before=structuredClone([...rows]);const lookedUp=[];
 const original=globalThis.mockSdk.api.getChat;
 globalThis.mockSdk.api.getChat=async({chat_id})=>{lookedUp.push(chat_id);if(chat_id===2)throw {code:403};return {id:chat_id,first_name:`Fresh ${chat_id}`,last_name:'<b>Literal</b>\nName',...(chat_id===1?{username:'fresh'}:{})};};
 try{
   // Even when sent as a Telegram reply, this must not become a support answer.
   await handle({from:{id:operatorId},chat:{id:operatorId,type:'private'},text:'/users@talking_brain_bot',reply_to_message:{message_id:111}});
   assert.deepEqual(lookedUp,Array.from({length:45},(_,i)=>i+1));
   assert.deepEqual([...rows],before);
   assert.ok(sent.length>=1);assert.ok(sent.every(p=>p.chat_id===operatorId && p.text.length<=4096 && !p.parse_mode));
   assert.ok(sent.every(p=>p.link_preview_options.is_disabled));
   const text=sent.map(p=>p.text).join('\n');
   assert.match(text,/Fresh 1/);assert.match(text,/@fresh/);assert.match(text,/saved@example.com/);
   assert.match(text,/Saved 2/);assert.match(text,/сохранённый профиль/);
   assert.match(text,/<b>Literal<\/b> Name/);
   assert.doesNotMatch(text,/ID:|Email:|Активность:/);assert.match(text,/Всего пользователей: 45/);
   assert.doesNotMatch(text,/PRIVATE AFFIRMATION|💬/);
   assert.equal(text.split('\n').filter(line=>/^\d+ · /.test(line)).every(line=>line.includes(' · ✍️ 1 · ❤️ 1')),true);
 }finally{globalThis.mockSdk.api.getChat=original;}
});
test('/users handles empty database and oversized profile fields safely', async () => {
 seedExisting();rows.clear();
 const own={from:{id:operatorId},chat:{id:operatorId,type:'private'},text:'/users'};
 await handle(own);assert.equal(sent.length,1);assert.match(sent[0].text,/Всего пользователей: 0/);
 const {userEntry}=await import('../tgcloud/lib/users-command.js');
 const entry=userEntry({id:9,data:{telegramUser:{first_name:'😀'.repeat(2000),last_name:'L'.repeat(2000),username:'U'.repeat(2000),email:'E'.repeat(2000)}}},null,Date.now());
 assert.ok(entry.length<3500);assert.match(entry,/ · ✂️ · ❤️ 0 \(сохранённый профиль\)$/);assert.doesNotMatch(entry,/\ud83d(?!\ude00)/u);
});

test('/users activity markers use green under 60m and yellow under 24h without labels', async () => {
 const {userEntry}=await import('../tgcloud/lib/users-command.js');
 const now=Date.parse('2026-10-21T12:00:00Z');
 for(const [minutes,marker] of [[59,'🟢'],[60,'🟡'],[1439,'🟡'],[1440,''],[2880,'']]) {
   const row={id:166564781,data:{profileLastSeenAt:new Date(now-minutes*60000).toISOString()}};
   const entry=userEntry(row,{first_name:'I’m',last_name:'OK',username:'AnnaOK'},now);
   assert.ok(entry.startsWith('166564781 · I’m OK · @AnnaOK · '));
   assert.equal(entry.includes('🟢'),marker==='🟢');assert.equal(entry.includes('🟡'),marker==='🟡');
   if(marker) assert.ok(entry.includes(` ${minutes<60?minutes+'m':Math.floor(minutes/60)+'h'} ${marker} · `));
   assert.doesNotMatch(entry,/\n|ID:|Email:|Активность:|🔴/);
 }
});
test('/users sorts across database pages by activity and uses plain messages after splitting', async () => {
 seedExisting();rows.clear();const now=Date.now();
 for(let id=1;id<=45;id++)rows.set(id,{id,revision:0,data:{profileLastSeenAt:id===1?'invalid':new Date(now-(46-id)*3600000).toISOString()}});
 const original=globalThis.mockSdk.api.getChat;
 globalThis.mockSdk.api.getChat=async({chat_id})=>({first_name:'😀'.repeat(30),last_name:'User '+chat_id});
 try{
   await handle({from:{id:operatorId},chat:{id:operatorId,type:'private'},text:'/users'});
   const ids=sent.flatMap(p=>[...p.text.matchAll(/^(\d+) · /gm)].map(m=>Number(m[1])));
   assert.deepEqual(ids,Array.from({length:45},(_,i)=>45-i));assert.ok(sent.length>1);
   assert.ok(sent.every(p=>!p.entities && !p.parse_mode));
 }finally{globalThis.mockSdk.api.getChat=original;}
});
