export const serviceHoursMessage =
    '学习服务时段为北京时间每天 09:00–12:30、14:00–17:30、18:30–次日 01:00。请在服务时段访问。';

// All bounds are UTC minutes of the day. The closing minute is excluded.
const utcWindows = [[60, 270], [360, 570], [630, 1020]];
const minuteMs = 60_000;
const dayMs = 1440 * minuteMs;
const precedingBreak = ['night', 'lunch', 'dinner'];

function minuteLabel(minute) {
    return [Math.floor(minute / 60), minute % 60].map(n => String(n).padStart(2, '0')).join(':');
}

const openWindows = utcWindows.map(([start, end], index) => {
    const startMinute = (start + 480) % 1440;
    const endMinute = (end + 480) % 1440;
    const label = minuteLabel(startMinute) + '–' + (endMinute < startMinute ? '次日 ' : '') + minuteLabel(endMinute);
    return {startMinute, endMinute, label, precedingBreak: precedingBreak[index]};
});

export function inServiceHours(time) {
    const utc = new Date(time);
    const minute = utc.getUTCHours() * 60 + utc.getUTCMinutes();
    return utcWindows.some(([start, end]) => start <= minute && minute < end);
}

export function getServiceScheduleStatus(time) {
    const nowMs = new Date(time).getTime();
    const midnight = Math.floor(nowMs / dayMs) * dayMs;
    const upcoming = utcWindows.findIndex(([start]) => midnight + start * minuteMs > nowMs);
    const index = upcoming < 0 ? 0 : upcoming;
    const openDay = upcoming < 0 ? midnight + dayMs : midnight;
    const nextOpenMs = openDay + utcWindows[index][0] * minuteMs;
    const previousClose = utcWindows.at(index - 1)[1];
    const isOpen = inServiceHours(nowMs);
    return {
        isOpen, period: isOpen ? 'open' : precedingBreak[index], nowMs, openWindows,
        cooldownStartMs: isOpen ? null : openDay + previousClose * minuteMs - (index === 0 ? dayMs : 0),
        cooldownEndMs: isOpen ? null : nextOpenMs,
        // While open, this is the following scheduled opening. No retry is needed.
        nextOpenMs, retryAfterSeconds: isOpen ? 1 : Math.max(1, Math.ceil((nextOpenMs - nowMs) / 1000)),
        beijingTimeText: new Date(nowMs + 480 * minuteMs).toISOString().slice(11, 19),
    };
}
