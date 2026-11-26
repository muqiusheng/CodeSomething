import {inServiceHours} from './service-hours.mjs';

export default {
    async scheduled(event, env) {
        if (!inServiceHours(event.scheduledTime) || !inServiceHours(Date.now())) return;

        const scheduledAt = new Date(event.scheduledTime).toISOString();
        const machines = [
            ["codesomething", env.INSTABOX_MACHINE_ID, env.INSTABOX_READ_TOKEN],
            ["maqibu", env.INSTABOX_JAVA_MACHINE_ID, env.INSTABOX_JAVA_READ_TOKEN],
            ["maqibu2", env.INSTABOX_BUILD_MACHINE_ID, env.INSTABOX_BUILD_READ_TOKEN],
        ];
        const results = await Promise.allSettled(machines.map(async ([machine, id, token]) => {
            if (!id || !token) {
                console.warn("Instabox status monitoring awaits read-only credentials", {machine, scheduledAt});
                return;
            }
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            try {
                const response = await fetch(`https://api.instabox.sh/v1/machines/${encodeURIComponent(id.trim())}`, {
                    headers: {"X-API-Key": token.trim(), Accept: "application/json"},
                    redirect: "error",
                    signal: controller.signal,
                });
                if (!response.ok) {
                    await response.body?.cancel();
                    console.warn("Instabox management HTTP error", {machine, scheduledAt, httpStatus: response.status});
                    throw new Error(`${machine} returned HTTP ${response.status}`);
                }
                const {state, runStartedAt, maxRunMinutes, cooldownUntil} = await response.json();
                console.log("Instabox machine status", {machine, scheduledAt, state, runStartedAt, maxRunMinutes, cooldownUntil});
            } finally {
                clearTimeout(timeout);
            }
        }));
        const failed = results.flatMap((result, index) => {
            if (result.status === "fulfilled") return [];
            const [machine] = machines[index];
            console.warn("Instabox management check failed", {machine, scheduledAt, errorType: result.reason?.name});
            return [result.reason];
        });
        if (failed.length) {
            throw new AggregateError(failed, "Instabox management checks failed");
        }
    },
};
