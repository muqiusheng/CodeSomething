import {getServiceScheduleStatus, inServiceHours, serviceHoursMessage} from './service-hours.mjs';
import {renderCooldownPage} from './cooldown-page.mjs';

const portCookie = '__Host-instabox_port_auth=';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.host !== env.PUBLIC_HOST) return new Response(null, {status: 421});
        const now = Date.now();
        if (!inServiceHours(now)) {
            const status = getServiceScheduleStatus(now);
            const isPage = (request.method === 'GET' || request.method === 'HEAD')
                && !url.pathname.startsWith('/api/') && (request.headers.get('Accept') || '').includes('text/html');
            let body = null;
            if (request.method !== 'HEAD') body = isPage ? renderCooldownPage(status) : serviceHoursMessage;
            return new Response(body, {
                status: 503,
                headers: {
                    'Content-Type': isPage ? 'text/html; charset=utf-8' : 'text/plain;charset=UTF-8',
                    'Retry-After': String(status.retryAfterSeconds),
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
