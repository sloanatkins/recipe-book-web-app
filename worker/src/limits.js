// Daily caps stored in Workers KV.
//  - per user: how many imports someone can run a day (stops one account
//    from hammering the worker)
//  - global: how many model calls the whole app can make a day (the real
//    spending kill switch, even if someone makes a pile of accounts)
//
// KV isn't atomic, so two requests at the exact same moment could both
// squeak in. For a soft cap on a personal app that's fine. A Durable Object
// would make it exact if this ever needed to be strict.

const DAY_SECONDS = 86400;

function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD in UTC
}

async function readCount(kv, key) {
  const v = await kv.get(key);
  const n = parseInt(v || "0", 10);
  return Number.isFinite(n) ? n : 0;
}

async function bump(kv, key, current) {
  // keys clean themselves up after two days
  await kv.put(key, String(current + 1), { expirationTtl: DAY_SECONDS * 2 });
}

export async function checkUserLimit(kv, uid, limit, now = Date.now()) {
  const key = `u:${uid}:${dayKey(now)}`;
  const used = await readCount(kv, key);
  return { allowed: used < limit, used, key };
}

export async function recordUserImport(kv, uid, now = Date.now()) {
  const key = `u:${uid}:${dayKey(now)}`;
  await bump(kv, key, await readCount(kv, key));
}

export async function checkGlobalModelLimit(kv, limit, now = Date.now()) {
  const key = `g:model:${dayKey(now)}`;
  const used = await readCount(kv, key);
  return { allowed: used < limit, used, key };
}

export async function recordModelCall(kv, now = Date.now()) {
  const key = `g:model:${dayKey(now)}`;
  await bump(kv, key, await readCount(kv, key));
}
