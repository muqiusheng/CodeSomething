import {inMonitoringWindow} from './worker.mjs';

const offHours = '学习服务时段为北京时间每天 05:00–13:00、15:00–23:00（UTC 21:00–次日 05:00、07:00–15:00）。请在服务时段访问。';
const portCookie = '__Host-instabox_port_auth=';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.host !== env.PUBLIC_HOST) return new Response(null, {status: 421});
        if (!inMonitoringWindow(Date.now())) {
            return new Response(offHours, {
                status: 503,
                headers: {
                    'Cache-Control': 'no-store',
                    'X-CodeSomething-Origin': 'gateway-schedule',
                    'X-Robots-Tag': 'noindex, nofollow, noarchive',
                },
            });
        }
        if (!env.INSTABOX_PORT_TOKEN || !env.CS_INGRESS_TOKEN) {
            return new Response('学习服务暂不可用。', {status: 503, headers: {'Cache-Control': 'no-store'}});
        }

        const upstream = new URL(env.INSTABOX_ORIGIN);
        upstream.pathname = url.pathname;
        upstream.search = url.search;
        const forwarded = new Request(upstream, request);
        const cookies = (forwarded.headers.get('Cookie') ?? '').split(';').map(cookie => cookie.trim())
            .filter(cookie => cookie && !cookie.startsWith(portCookie));
        forwarded.headers.delete('Host');
        forwarded.headers.set('Cookie', [portCookie + env.INSTABOX_PORT_TOKEN, ...cookies].join('; '));
        forwarded.headers.set('X-CodeSomething-Ingress', env.CS_INGRESS_TOKEN);

        const response = await fetch(forwarded, {redirect: 'manual', cache: 'no-store'});
        if (response.status === 101) return response;
        const headers = new Headers(response.headers);
        const appCookies = headers.getSetCookie().filter(cookie => !cookie.startsWith(portCookie));
        headers.delete('Set-Cookie');
        for (const cookie of appCookies) headers.append('Set-Cookie', cookie);
        headers.set('X-CodeSomething-Origin', 'instabox');
        if (url.pathname === '/' && response.ok) headers.delete('X-Robots-Tag');
        else headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
        return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
    },
};
