/* =============================================
   DateUtils — timezone-safe local date helpers
   ------------------------------------------------
   `date.toISOString().slice(0,10)` and `new Date(isoDateString)` both
   round-trip through UTC. For any user whose local timezone isn't
   exactly UTC+0 (i.e. almost everyone this app is built for —
   Bangladesh, India, etc. are all UTC+ ahead), that round-trip silently
   shifts the calendar date by one day. Every date read or written in
   this app must go through these helpers instead of doing that
   conversion inline.
   ============================================= */
const DateUtils = (() => {

    // Date object -> "YYYY-MM-DD" using the LOCAL calendar fields
    // (never .toISOString(), which reports the UTC calendar date).
    function toISODate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // "YYYY-MM-DD" -> Date object at LOCAL midnight
    // (never `new Date(str)`, which parses date-only strings as UTC
    // midnight and then silently shifts when read back with local
    // getters like .getDate()).
    function parseISODate(str) {
        if (!str || typeof str !== 'string') return null;
        const parts = str.split('-').map(Number);
        if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
        const [y, m, d] = parts;
        const date = new Date(y, m - 1, d);
        return isNaN(date) ? null : date;
    }

    // Today, as a local "YYYY-MM-DD" string.
    function todayISODate() {
        return toISODate(new Date());
    }

    return { toISODate, parseISODate, todayISODate };
})();
