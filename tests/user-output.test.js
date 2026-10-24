import test from 'node:test';
import assert from 'node:assert/strict';
import {userInfo, usersTable, lastActive} from '../scripts/user-output.mjs';
test('relative activity supports seconds, minutes, hours, days and unknown values', () => {
 const now=Date.parse('2026-10-20T12:00:00Z');
 for(const [age,expected] of [[0,'0s'],[59,'59s'],[60,'1m'],[3599,'59m'],[3600,'1h'],[86400,'1d'],[172800,'2d']]) {
   assert.equal(lastActive(new Date(now-age*1000).toISOString(),now),expected);
 }
 assert.equal(lastActive(null,now),'-'); assert.equal(lastActive('bad',now),'-');
});
test('user snapshot preserves optional Telegram fields and fresh chat details without inventing email', () => {
 const row={id:42,data:{telegramUser:{id:42,first_name:'Old',username:'removed',language_code:'ru',is_premium:true}}};
 const chat={id:42,first_name:'New',last_name:'Name',bio:'Bio',accent_color_id:4};
 const user=userInfo(row,chat);
 assert.equal(user.first_name,'New'); assert.equal(user.username,undefined);
 assert.equal(user.language_code,'ru'); assert.equal(user.is_premium,true);
 assert.equal(user.email,null); assert.deepEqual(user.chat,chat);
 assert.equal(row.data.telegramUser.username,'removed');
 const failed=userInfo(row,null,{code:403});
 assert.equal(failed.first_name,'Old'); assert.equal(failed.chat_lookup_error.code,403);
});
test('console listing is readable, sanitises controls and never prints personal texts', () => {
 const now=Date.parse('2026-10-20T12:00:00Z');
 const row={id:42,data:{texts:['private affirmation'],profileLastSeenAt:'2026-10-20T11:59:00Z'},user:{first_name:'Анна\n\x1b[31m',last_name:'Тест',username:'anna'}};
 const output=usersTable([row],now);
 assert.match(output,/FIRST NAME/);assert.match(output,/@anna/);assert.match(output,/1m/);
 assert.doesNotMatch(output,/private affirmation|\x1b/);
 assert.match(usersTable([],now),/0 user\(s\)/);
});

test('collection indicators compare current texts without revealing content or changing data', async () => {
 const {collectionStatus}=await import('../tgcloud/lib/user-info.js');
 const defaults=['First','Second','Second'];
 const cases=[
   [{new:true,texts:defaults},'🌱'],
   [{new:true,texts:[]},'🌱'],
   [{new:true,texts:['Imported']},'🌱'],
   [{new:false,texts:[...defaults]},'📦'],
   [{texts:['Second','First','Second'],favorites:[0]},'📦'],
   [{texts:['First','Second']},'✂️'],
   [{texts:[]},'✂️'],
   [{texts:[...defaults,'Personal']},'✍️ 1'],
   [{texts:['Edited','Second','Second']},'✍️ 1'],
   [{texts:['Private','Private']},'✍️ 2'],
   [{texts:[...defaults,'Second']},'✍️ 1'],
   [{texts:['First','First','Second']},'✍️ 1'],
 ];
 const before=structuredClone(cases);
 for(const [data,expected]of cases)assert.equal(collectionStatus(data,defaults),expected);
 assert.deepEqual(cases,before);assert.deepEqual(defaults,['First','Second','Second']);
});

test('console table retains columns, activity order and collection markers without mutating rows', () => {
 const now=Date.parse('2026-10-21T12:00:00Z');
 const defaults=['Starter'];
 const make=(id,minutes,texts,profile,newUser=false)=>{
   const row={id,data:{new:newUser,texts,profileLastSeenAt:minutes===null?'invalid':new Date(now-minutes*60000).toISOString()}};
   return {...row,user:userInfo(row,{id,...profile})};
 };
 const rows=[make(1,null,[],{} ,true),make(2,2880,[],{first_name:'Older'}),make(3,60,['Personal'],{first_name:'Anna',username:'anna',email:'a@example.com'}),make(4,59,['Starter'],{first_name:'Recent'})];
 rows[2].data.favorites=[0];
 rows[3].data.favorites=[];
 const before=structuredClone(rows);
 const lines=usersTable(rows,now,defaults).split('\n');
 assert.match(lines[0],/FIRST NAME.*LAST NAME.*LAST ACTIVE.*TEXTS.*FAVS/);
 const data=lines.slice(2,6);
 assert.deepEqual(data.map(line=>Number(line.trim().split(/\s+/)[0])),[4,3,2,1]);
 assert.match(data[0],/Recent.*🟢 59m.*📦 +0$/);
 assert.match(data[1],/Anna.*@anna.*a@example.com.*🟡 1h.*✍️ 1 +1$/);
 assert.match(data[2],/Older.*2d.*✂️ +0$/);
 assert.match(data[3],/^1 +🌱 +0$/);
 assert.equal(data[0].indexOf('🟢'),data[1].indexOf('🟡'));
 assert.ok(lines.some(line=>line.startsWith('4 user(s).')));
 assert.deepEqual(rows,before);
});
