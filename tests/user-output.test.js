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
