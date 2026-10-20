import test from 'node:test';
import assert from 'node:assert/strict';
import {seedUserId, parseSeed, seededData} from '../scripts/seed-input.mjs';
import {initial, transition} from '../tgcloud/lib/flow.js';
import {seeds} from '../tgcloud/lib/content.js';
import {ensureTextIds, resolveButton} from '../tgcloud/lib/buttons.js';
test('seed ID uses explicit CLI argument or OPERATOR_ID and rejects unsafe input', () => {
 assert.equal(seedUserId('123','456'),123);
 assert.equal(seedUserId('','456'),456);
 assert.equal(seedUserId(undefined,'456'),456);
 for(const value of ['0','-1','../file','1; echo bad','1.5','9007199254740992']) assert.throws(()=>seedUserId(value,'456'));
 assert.throws(()=>seedUserId('',undefined));
});
test('seed file preserves order and duplicates, handles CRLF and validates before mutation', () => {
 assert.deepEqual(parseSeed(' First\r\n\r\nSecond\nFirst\n'),['First','Second','First']);
 assert.throws(()=>parseSeed(' \n'));
 assert.throws(()=>parseSeed('x'.repeat(4001)));
});
test('manual seeding replaces collection, preserves profile and invalidates old IDs', () => {
 const old={...initial(123),telegramUser:{id:123,first_name:'Test'},profileFirstSeenAt:'2026-01-01T00:00:00Z',profileLastSeenAt:'2026-02-01T00:00:00Z',lastUpdate:100};
 ensureTextIds(old,10);
 const id=old.textIds[0];
 const seeded=seededData(old,['Personal A','Personal B']);
 assert.deepEqual(seeded.texts,['Personal A','Personal B']);
 assert.deepEqual(seeded.telegramUser,old.telegramUser);
 assert.equal(seeded.profileFirstSeenAt,old.profileFirstSeenAt);
 assert.equal(seeded.profileLastSeenAt,old.profileLastSeenAt);
 assert.equal(seeded.lastUpdate,100); assert.deepEqual(seeded.favorites,[]);
 ensureTextIds(seeded,12);
 assert.equal(resolveButton(`a:edit:${id}:a`,seeded,11).error,'unavailable');
 let s=transition(seeded,{action:'start',userId:123,revision:12}).state;
 assert.deepEqual(s.texts,['Personal A','Personal B']);
 s=transition(s,{text:'/reset',userId:123,revision:13}).state;
 s=transition(s,{action:'reset',userId:123,revision:14}).state;
 s=transition(s,{action:'start',userId:123,revision:15}).state;
 assert.deepEqual(s.texts,seeds.common);
 assert.deepEqual(Object.keys(seeds),['common']);
});
