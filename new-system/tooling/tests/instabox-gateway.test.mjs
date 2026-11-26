import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import worker from '../../deployment/instabox/gateway-worker.mjs';
import monitor from '../../deployment/instabox/worker.mjs';
import * as schedule from '../../deployment/instabox/service-hours.mjs';

const host = 'try.maqibu.online';

test('schedule gives exact Beijing cooldown bounds and rounds partial retry seconds up', () => {
    for (const [time, period, start, end, retry, local] of [
        ['25T00:59:59.999', 'night', '24T17:00', '25T01:00', 1, '08:59:59'],
        ['25T04:30:00', 'lunch', '25T04:30', '25T06:00', 5400, '12:30:00'],
        ['25T04:30:00.900', 'lunch', '25T04:30', '25T06:00', 5400, '12:30:00'],
        ['25T09:30:00', 'dinner', '25T09:30', '25T10:30', 3600, '17:30:00'],
        ['25T17:00:00', 'night', '25T17:00', '26T01:00', 28800, '01:00:00'],
    ]) {
        const timestamp = part => Date.parse('2026-11-' + part + 'Z');
        const status = schedule.getServiceScheduleStatus(timestamp(time));
        assert.deepEqual([status.isOpen, status.period, status.nowMs, status.cooldownStartMs,
            status.cooldownEndMs, status.nextOpenMs, status.retryAfterSeconds, status.beijingTimeText],
        [false, period, timestamp(time), timestamp(start), timestamp(end), timestamp(end), retry, local]);
    }
    for (const time of ['01:00', '06:00', '10:30', '16:00', '16:59']) {
        const status = schedule.getServiceScheduleStatus(Date.parse('2026-11-25T' + time + 'Z'));
        assert.equal(status.isOpen, true);
        assert.equal(status.period, 'open');
    }
});
const env = {
    PUBLIC_HOST: host,
    INSTABOX_ORIGIN: 'https://origin.example.test',
    INSTABOX_PORT_TOKEN: 'test-port-token',
    CS_INGRESS_TOKEN: 'test-ingress-token',
};

test('browser navigations receive the self-contained cooldown page at the edge', async t => {
    const proxy = t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected origin request'));
    for (const [time, scene] of [['05:00', '机房午休中'], ['10:00', '服务器正在吃晚饭'], ['23:00', 'JVM 和 MySQL 都睡着了']]) {
        const now = Date.parse('2026-11-25T' + time + 'Z');
        t.mock.method(Date, 'now', () => now);
        const status = schedule.getServiceScheduleStatus(now);
        for (const path of ['/', '/login', '/learn']) {
            const response = await worker.fetch(new Request('https://' + host + path, {headers: {Accept: 'text/html'}}), env);
            assert.equal(response.status, 503);
            assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
            assert.equal(response.headers.get('Retry-After'), String(status.retryAfterSeconds));
            assert.equal(response.headers.get('Cache-Control'), 'no-store');
            assert.equal(response.headers.get('X-CodeSomething-Origin'), 'gateway-schedule');
            assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
            const html = await response.text();
            assert.match(html, /^<!doctype html>/i);
            assert.ok(html.includes('<h1 id="greeting">' + scene));
            for (const fragment of ['09:00–12:30', '14:00–17:30', '18:30–次日 01:00',
                'data-next-open-at="' + status.nextOpenMs + '"', 'data-cooldown-start="' + status.cooldownStartMs + '"',
                'data-cooldown-end="' + status.cooldownEndMs + '"', '<noscript>', 'data:image/svg+xml']) {
                assert.ok(html.includes(fragment), fragment);
            }
            assert.ok(Buffer.byteLength(html) < 30 * 1024);
        }
    }
    assert.equal(proxy.mock.callCount(), 0);
});

test('HTML HEAD is bodyless and API, POST and non-HTML clients keep the text response', async t => {
    t.mock.method(Date, 'now', () => Date.parse('2026-11-25T05:00Z'));
    const proxy = t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected origin request'));
    for (const [method, path, accept] of [['HEAD', '/learn', 'text/html'], ['GET', '/api/v1/health', 'text/html'],
        ['POST', '/api/v1/auth/login', 'text/html'], ['POST', '/learn', 'text/html'], ['GET', '/asset.js', '*/*']]) {
        const response = await worker.fetch(new Request('https://' + host + path, {method, headers: {Accept: accept}}), env);
        assert.equal(response.status, 503);
        assert.match(response.headers.get('Content-Type'), method === 'HEAD' ? /^text\/html/ : /^text\/plain/);
        assert.equal(await response.text(), method === 'HEAD' ? '' : schedule.serviceHoursMessage);
    }
    assert.equal(proxy.mock.callCount(), 0);
});

test('lunch and night requests are rejected at the edge', async t => {
    const proxy = t.mock.method(globalThis, 'fetch', () => {
        assert.fail('Requests outside service hours must not reach Instabox');
    });
    for (const utcTime of ['00:59:59', '04:30:00', '05:59:59', '09:30:00', '10:29:59', '17:00:00']) {
        t.mock.method(Date, 'now', () => Date.parse(`2026-11-25T${utcTime}Z`));
        const response = await worker.fetch(new Request(`https://${host}/api/v1/health`), env);
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        assert.match(await response.text(), /09:00–12:30、14:00–17:30、18:30–次日 01:00/);
    }
    assert.equal(proxy.mock.callCount(), 0);
});

test('the gateway opens at each Beijing boundary and stays open across local midnight', async t => {
    const proxy = t.mock.method(globalThis, 'fetch', () => new Response('open'));
    for (const utcTime of ['01:00:00', '04:29:59', '06:00:00', '09:29:59',
        '10:30:00', '15:59:59', '16:00:00', '16:59:59']) {
        t.mock.method(Date, 'now', () => Date.parse(`2026-11-25T${utcTime}Z`));
        const response = await worker.fetch(new Request(`https://${host}/`), env);
        assert.equal(response.status, 200, utcTime);
    }
    assert.equal(proxy.mock.callCount(), 8);
});

test('the monitor stays idle outside the window and queries only configured machine management endpoints', async t => {
    const now = Date.parse('2026-11-25T16:00:00Z');
    t.mock.method(Date, 'now', () => now);
    const visited = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        const id = url.split('/').at(-1);
        assert.equal(options.headers['X-API-Key'], `fake-read-key-${id}`);
        visited.push(url);
        if (url.endsWith('/judge')) return new Response(null, {status: 503});
        return Response.json({state: 'running', cooldownUntil: null});
    });
    const config = {
        INSTABOX_READ_TOKEN: 'fake-read-key-main',
        INSTABOX_MACHINE_ID: 'main',
        INSTABOX_JAVA_MACHINE_ID: 'judge',
        INSTABOX_JAVA_READ_TOKEN: 'fake-read-key-judge',
        INSTABOX_BUILD_MACHINE_ID: 'builder',
        INSTABOX_BUILD_READ_TOKEN: 'fake-read-key-builder',
    };
    await monitor.scheduled({scheduledTime: Date.parse('2026-11-25T10:20:00Z')}, config);
    assert.deepEqual(visited, []);
    await assert.rejects(monitor.scheduled({scheduledTime: now}, config), AggregateError);
    assert.deepEqual(visited, ['main', 'judge', 'builder'].map(id => `https://api.instabox.sh/v1/machines/${id}`));
});

test('production cron fires every ten minutes within the UTC windows', () => {
    const config = JSON.parse(readFileSync(
        new URL('../../deployment/instabox/wrangler.jsonc', import.meta.url), 'utf8'));
    const times = [];
    for (const cron of config.triggers.crons) {
        const [minutes, hours, ...dates] = cron.split(' ');
        assert.deepEqual(dates, ['*', '*', '*']);
        const minuteList = minutes === '*/10' ? [0, 10, 20, 30, 40, 50] : minutes.split(',').map(Number);
        for (const hourRange of hours.split(',')) {
            const [first, last = first] = hourRange.split('-').map(Number);
            for (let hour = first; hour <= last; hour++) {
                times.push(...minuteList.map(minute => 60 * hour + minute));
            }
        }
    }
    times.sort((a, b) => a - b);
    const expected = Array.from({length: 144}, (_, tick) => 10 * tick)
        .filter(minute => (minute >= 60 && minute < 270) || (minute >= 360 && minute < 570)
            || (minute >= 630 && minute < 1020));
    assert.deepEqual(times, expected);
});

test('an in-hours submission reaches the private origin once with its login and body intact', async t => {
    t.mock.method(Date, 'now', () => Date.parse('2026-11-25T07:00:00Z'));
    const proxy = t.mock.method(globalThis, 'fetch', async (forwarded, options) => {
        assert.equal(forwarded.url, 'https://origin.example.test/api/grade?exercise=4');
        assert.equal(forwarded.method, 'POST');
        assert.equal(forwarded.headers.get('Authorization'), 'Bearer application-session');
        assert.equal(forwarded.headers.get('Cookie'), '__Host-instabox_port_auth=test-port-token; mode=light');
        assert.equal(forwarded.headers.get('X-CodeSomething-Ingress'), 'test-ingress-token');
        assert.equal(await forwarded.text(), '{"sql":"select 1"}');
        assert.equal(options.redirect, 'manual');
        return new Response('accepted', {status: 200, headers: {'Set-Cookie': 'session=refresh'}});
    });
    const response = await worker.fetch(new Request(`https://${host}/api/grade?exercise=4`, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer application-session',
            Cookie: 'mode=light; __Host-instabox_port_auth=forged',
            'X-CodeSomething-Ingress': 'forged',
        },
        body: '{"sql":"select 1"}',
    }), env);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'accepted');
    assert.equal(response.headers.get('Set-Cookie'), 'session=refresh');
    assert.equal(proxy.mock.callCount(), 1);
});
