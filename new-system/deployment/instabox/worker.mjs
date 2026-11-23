export default {
    async scheduled(event, env) {
        const result = await fetch(env.HEALTH_URL, {
            headers: {
                "Cache-Control": "no-cache",
                "User-Agent": "CodeSomething-Instabox-Health",
            },
            redirect: "manual",
            signal: AbortSignal.timeout(60000),
        });
        if (!result.ok) {
            await result.body?.cancel();
            throw new Error(`Instabox health check returned HTTP ${result.status}`);
        }
        const health = await result.json();
        if (health.status !== "UP" || health.database?.status !== "UP") {
            throw new Error("CodeSomething or SQLite is unavailable");
        }
        console.log("CodeSomething health check passed", new Date(event.scheduledTime).toISOString());
    },
};
