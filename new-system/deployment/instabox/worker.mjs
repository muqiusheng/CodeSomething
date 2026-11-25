// Beijing 05:00–13:00 = UTC 21:00–05:00 (crosses UTC midnight).
// Beijing 15:00–23:00 = UTC 07:00–15:00.
export function inMonitoringWindow(scheduledTime) {
    const hour = new Date(scheduledTime).getUTCHours();
    return hour >= 21 || hour < 5 || (hour >= 7 && hour < 15);
}

export default {
    async scheduled(event, env) {
        if (!inMonitoringWindow(event.scheduledTime) || !inMonitoringWindow(Date.now())) return;

        const scheduledAt = new Date(event.scheduledTime).toISOString();
        if (!env.INSTABOX_MACHINE_ID || !env.INSTABOX_READ_TOKEN) {
            console.warn("Instabox status monitoring awaits read-only credentials", {scheduledAt});
            return;
        }

        const machineId = encodeURIComponent(env.INSTABOX_MACHINE_ID);
        const response = await fetch(`https://api.instabox.sh/v1/machines/${machineId}`, {
            headers: {"X-API-Key": env.INSTABOX_READ_TOKEN},
            redirect: "error",
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`Instabox machine status returned HTTP ${response.status}`);
        }
        const {status, phase, runStartedAt, maxRunMinutes, cooldownUntil} = await response.json();
        console.log("Instabox machine status", {scheduledAt, status, phase, runStartedAt, maxRunMinutes, cooldownUntil});
    },
};
