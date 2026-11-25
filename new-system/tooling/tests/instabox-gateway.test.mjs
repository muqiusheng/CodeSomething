import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../../deployment/instabox/gateway-worker.mjs';

const host = 'try.maqibu.online';
const env = {
    PUBLIC_HOST: host,
    INSTABOX_ORIGIN: 'https://origin.example.test',
    INSTABOX_PORT_TOKEN: 'test-port-token',
    CS_INGRESS_TOKEN: 'test-ingress-token',
};

test('lunch and night requests are rejected at the edge', async t => {
    const proxy = t.mock.method(globalThis, 'fetch', () => {
        assert.fail('Requests outside service hours must not reach Instabox');
    });
    for (const utcTime of ['05:00:00', '06:59:59', '15:00:00', '20:59:59']) {
        t.mock.method(Date, 'now', () => Date.parse(`2026-11-25T${utcTime}Z`));
        const response = await worker.fetch(new Request(`https://${host}/api/v1/health`), env);
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        assert.match(await response.text(), /05:00–13:00、15:00–23:00/);
    }
    assert.equal(proxy.mock.callCount(), 0);
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
