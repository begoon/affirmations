export function seedUserId(argument, operatorId) {
  const value = argument || operatorId;
  if (!/^[1-9]\d*$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) {
    throw Error('Provide a positive Telegram user ID, or set OPERATOR_ID in .env');
  }
  return Number(value);
}
export function parseSeed(contents) {
  const texts = contents.split(/\r?\n/).map(text => text.trim()).filter(Boolean);
  if (!texts.length || texts.some(text => text.length > 4000)) {
    throw Error('Seed must contain nonempty lines of at most 4000 characters');
  }
  return texts;
}
export function seededData(previous, texts) {
  const data = {language:previous?.language ?? 'ru',new:true,mode:'welcome',
    texts:[...texts],current:-1,favorites:[],view:'all',
    lastUpdate:previous?.lastUpdate ?? -1};
  for (const key of ['telegramUser','profileFirstSeenAt','profileLastSeenAt']) {
    if (previous?.[key] !== undefined) data[key] = previous[key];
  }
  return data;
}
