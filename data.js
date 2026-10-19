/* Copyright (c) 2026 若若 | SPDX-License-Identifier: MIT | See LICENSE. */
/* Synthetic data and strict allowlist projection. No I/O or persistence. */
(() => {
  'use strict';
  const fail = () => { throw new TypeError('Invalid snapshot or configuration'); };
  const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : fail();
  const text = (v, max = 160) => typeof v === 'string' && v.length <= max ? v : fail();
  const num = (v, max = 1e9, min = 0) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail();
  const integer = (v, max = 10000) => Number.isInteger(v) ? num(v, max) : fail();
  const list = (v, max) => Array.isArray(v) && v.length <= max ? v : fail();
  const optionalNumber = (o, k, max = 1e9) => o[k] === undefined ? 0 : num(o[k], max);
  const optionalText = (o, k) => o[k] === undefined ? '' : text(o[k]);
  const bool = v => typeof v === 'boolean' ? v : fail();
  const color = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fail();
  const keys = Array.from({ length: 7 }, (_, i) => 'member' + (i + 1));
  const choice = (v, choices) => choices.includes(v) ? v : fail();
  const time = v => num(v, 1e11);
  const stamp = v => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return time(v);
    if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v) || !Number.isFinite(Date.parse(v))) return fail();
    return new Date(v).toISOString();
  };
  const isoStamp = v => { const s = stamp(v); return typeof s === 'number' ? new Date(s * 1000).toISOString() : s; };
  const secondsStamp = v => { const s = stamp(v); return typeof s === 'string' ? Date.parse(s) / 1000 : s; };
  function validateConfig(raw) {
    const c = obj(raw), members = list(c.members, 7);
    if (members.length !== 7) fail();
    const result = {
      title: text(c.title, 40), brand: text(c.brand, 24),
      tickMs: num(c.tickMs, 10000, 500), seed: integer(c.seed, 1000000),
      central: { name: text(obj(c.central).name, 24), color: color(c.central.color) },
      members: members.map((item, i) => {
        const m = obj(item); if (m.key !== keys[i]) fail();
        return { key: keys[i], name: text(m.name, 24), model: text(m.model || '', 32), color: color(m.color), external: m.external === undefined ? false : bool(m.external) };
      })
    };
    return result;
  }
  function validateSnapshot(raw) {
    const d = obj(raw), host = obj(d.host), groups = list(d.groups, 7);
    if (d.ok !== true || groups.length !== 7) fail();
    const ts = time(d.ts), wall = Date.now() / 1000;
    if (ts < wall - 60 || ts > wall + 5) fail();
    const h = {};
    for (const k of ['mem_used', 'mem_total', 'swap_used', 'swap_total', 'disk_used', 'disk_total', 'uptime', 'procs']) h[k] = optionalNumber(host, k);
    h.cpu = num(host.cpu, 100); h.cores = integer(host.cores, 1024);
    h.load = list(host.load || [0, 0, 0], 3).map(v => num(v, 10000));
    const memberRows = keys.map(key => {
      const matches = groups.filter(g => obj(g).key === key); if (matches.length !== 1) fail();
      const g = matches[0];
      return { key, cpu: num(g.cpu, 100), mb: num(g.mb), procs: integer(g.procs), busy: bool(g.busy), organs: list(g.organs, 9).map(item => {
        const o = obj(item); return { name: text(o.name), n: integer(o.n), mb: num(o.mb), cpu: num(o.cpu, 100) };
      }) };
    });
    const activity = obj(d.activity || {});
    const series = v => list(v || [], 24).map(n => num(n, 1e6));
    const sent = obj(d.sent || {}), house = obj(sent.house || {}), beacon = obj(sent.beacon || {});
    const log = v => list(v || [], 24).map(item => { const r = obj(item); return { t: text(r.t, 40), msg: text(r.msg, 240), key: optionalText(r, 'key') }; });
    const checks = list(house.checks || [], 40).map(item => { const c = obj(item); return { key: optionalText(c, 'key'), name: text(c.name), detail: optionalText(c, 'detail'), sev: choice(c.sev, ['ok', 'warn', 'down']) }; });
    const timer = obj(house.timer || {});
    const health = { checks, healthy: checks.filter(c => c.sev === 'ok').length, total: checks.length, rounds: house.rounds === undefined ? 0 : integer(house.rounds, 1e9), updated: stamp(house.updated), notes: log(house.notes), timer: { last: stamp(timer.last), next: stamp(timer.next) }, incident: null };
    if (house.incident !== null && house.incident !== undefined) {
      const i = obj(house.incident); health.incident = { name: optionalText(i, 'name'), opened: stamp(i.opened), member4: stamp(i.member4), closed: stamp(i.closed) };
    }
    const events = list(d.events || [], 24).map(item => { const e = obj(item); return { t: text(e.t, 40), unit: text(e.unit), msg: optionalText(e, 'msg'), kind: choice(e.kind, ['fail', 'rest']) }; });
    const timers = list(d.timers || [], 32).map(item => { const t = obj(item); return { unit: text(t.unit), last: stamp(t.last), next: stamp(t.next) }; });
    const hist = list(d.hist || [], 90).map(item => {
      const r = obj(item), g = obj(r.g || {}), mapped = {};
      for (const key of keys) mapped[key] = optionalNumber(g, key, 100);
      return { ts: time(r.ts), cpu: num(r.cpu, 100), mem: optionalNumber(r, 'mem'), rx: optionalNumber(r, 'rx'), tx: optionalNumber(r, 'tx'), dr: optionalNumber(r, 'dr'), dw: optionalNumber(r, 'dw'), g: mapped };
    });
    const workflow = list(d.workflow || [], 128).map(item => {
      const w = obj(item); if (typeof w.event_id !== 'string' || !/^[0-9a-f]{32}$/.test(w.event_id)) fail();
      return { event_id: w.event_id, member: choice(w.member, keys), source: choice(w.source, ['alarm', 'taskboard', 'shared_task']), stage: choice(w.stage, ['source_status', 'scheduled', 'invoked', 'call_finished', 'queued', 'processing', 'review', 'completed', 'verified', 'rework', 'failed', 'cancelled', 'blocked']), result: choice(w.result, ['available', 'unavailable', 'unknown', 'accepted', 'success', 'failure', 'cancelled']), time: stamp(w.time) };
    });
    return { ok: true, ts, tick: d.tick === undefined ? 2 : num(d.tick, 60, .5), host: h, groups: memberRows, activity: { observer: series(activity.observer), member1: series(activity.member1), last_input: isoStamp(activity.last_input) }, events, timers, hist, sent: { house: health, beacon: { weekly_used: optionalNumber(beacon, 'weekly_used', 100), resets_at: isoStamp(beacon.resets_at), last_signal: optionalText(beacon, 'last_signal'), x: { next: secondsStamp(obj(beacon.x || {}).next) }, log: log(beacon.log) } }, workflow };
  }
  function createDemo(config, wall = Date.now()) {
    const t = wall / 1000, phase = Math.floor(t / 2), seed = config.seed;
    const wave = (n, speed = .1) => .5 + .5 * Math.sin(t * speed + n + seed);
    const groups = config.members.map((m, i) => ({ key: m.key, cpu: +(2 + wave(i) * 18).toFixed(1), mb: Math.round(130 + wave(i, .06) * 450), procs: 3 + i, busy: wave(i) > .78, organs: ['模拟计算', '模拟队列', '模拟缓存'].map((name, j) => ({ name, n: j + 1, mb: Math.round(35 + wave(i + j, .07) * 120), cpu: +(wave(i + j) * 5).toFixed(2) })) }));
    const checks = Array.from({ length: 24 }, (_, i) => ({ key: 'check-' + i, name: '模拟检查 ' + (i + 1), detail: i === 3 ? '合成波动样例' : '合成健康样例', sev: i === 3 && phase % 24 > 15 ? 'warn' : 'ok' }));
    const hist = Array.from({ length: 90 }, (_, i) => { const at = t - (89 - i) * config.tickMs / 1000, w = n => .5 + Math.sin(at * .09 + n + seed) * .5; return { ts: at, cpu: 18 + w(1) * 30, mem: 1800 + w(2) * 400, rx: 12000 + w(3) * 50000, tx: 9000 + w(4) * 32000, dr: 2000 + w(5) * 15000, dw: 1000 + w(6) * 9000, g: Object.fromEntries(keys.map((k, j) => [k, w(j) * 12])) }; });
    const workflow = ['alarm', 'taskboard', 'shared_task'].map((source, i) => ({ source, stage: 'source_status', result: 'available', member: keys[i], event_id: (i + 1).toString(16).padStart(32, '0'), time: t }));
    const stages = ['queued', 'processing', 'review', 'completed', 'verified'];
    for (let i = 11; i >= 0; i--) { const step = phase - i; workflow.push({ source: 'taskboard', stage: stages[step % 5], result: step % 5 === 4 ? 'success' : 'accepted', member: keys[Math.floor(step / 5) % 7], event_id: Math.floor(step / 5).toString(16).padStart(32, '0'), time: step * 2 }); }
    const iso = seconds => new Date(seconds * 1000).toISOString();
    return validateSnapshot({ ok: true, ts: t, tick: config.tickMs / 1000,
      host: { cpu: +(18 + wave(1) * 30).toFixed(1), cores: 8, load: [.6, .5, .4], mem_used: 2100, mem_total: 8192, swap_used: 0, swap_total: 2048, disk_used: 18, disk_total: 128, uptime: 86400 + t % 3600, procs: 56 }, groups, hist,
      activity: { observer: Array.from({ length: 24 }, (_, i) => Math.round(4 + Math.sin(i * .8 + seed) * 4)), member1: Array.from({ length: 24 }, (_, i) => Math.round(5 + Math.cos(i * .6) * 5)), last_input: iso(Math.floor(t / 40) * 40) },
      events: [{ t: 'DEMO ' + phase, unit: keys[phase % 7] + '-heartbeat', msg: '合成事件', kind: 'rest' }],
      timers: keys.map((key, i) => ({ unit: key + '-heartbeat', last: Math.floor((t - i) / 12) * 12, next: Math.floor((t - i) / 12) * 12 + 12 })),
      sent: { house: { checks, rounds: phase, updated: t, timer: { last: t - 2, next: t + 2 }, notes: [{ t: String(phase), key: 'demo', msg: '模拟巡检完成' }] }, beacon: { weekly_used: Math.round(wave(3, .02) * 70), resets_at: iso(t + 3600), last_signal: 'DEMO-' + phase, x: { next: t + 20 }, log: [{ t: String(phase), msg: '模拟信标回执' }] } }, workflow });
  }
  window.OrbitData = Object.freeze({ validateConfig, validateSnapshot, createDemo });
})();
