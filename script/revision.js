/* =============================================
   Revision — Final Revision Planner (v2)
   All subject/chapter/schedule DATA lives in /config/revision/*.json.
   This file only contains the generic engine + UI that reads that data.
   Cloud-first: plans are stored in Supabase (table `revision_progress`),
   one row per (user, subjectKey), via DB.pullRevisionPlan / pushRevisionPlan.

   v2 rethink:
   - New "Overview" screen per subject: progress ring, pace indicator
     (ahead/on track/behind), streak, today + up-next inline.
   - Timeline replaces the flat table: grouped by week, filter chips
     (type), a search box, and a "jump to today" control.
   - Homescreen card gets a streak badge and a lightweight multi-subject
     summary line.
   - Same generic engine (generateEntries / replanAll) — it works and
     nothing about the schedule *math* needed to change, only how it's
     presented and navigated.
   ============================================= */

const Revision = (() => {

    let registry      = null;   // full registry.json
    let syllabusKey    = '';    // e.g. "syllabus-bangladesh-hsc.json"
    let subjectsForSyllabus = {}; // { "Higher Mathematics": {status, plan, icon}, ... }
    let plansCache     = {};    // subjectKey -> { start_date, entries } (loaded lazily)
    let configCache    = {};    // plan filename -> parsed config json

    let activeSubjectName = '';   // display name, e.g. "Higher Mathematics"
    let activeSubjectDef  = null; // registry entry for the active subject
    let activeConfig      = null; // loaded plan config for the active subject
    let activeStartDate   = '';
    let activeEntries     = [];   // current plan entries (live, mutable)
    let screen            = 'subjects'; // 'subjects' | 'setup' | 'overview' | 'timeline'
    let managerMode       = false; // true when opened via manager mode

    // Timeline filter/search state (reset whenever a subject is opened)
    let tlFilter = 'all';   // 'all' | 'concept' | 'problems' | 'revision' | 'final'
    let tlQuery  = '';

    // Global revision settings — one shared logic across every subject.
    let revSettings = { weekendDay: 'friday', tasksPerDay: 2 };

    let initPromise = null;

    /* ---- Init: called once at boot with the user's syllabus filename ---- */
    function init(syllabusFilename) {
        initPromise = (async () => {
            syllabusKey = syllabusFilename || '';
            try {
                registry = await DB.loadRevisionRegistry();
            } catch (e) {
                registry = {};
            }
            subjectsForSyllabus = (registry && registry[syllabusKey] && registry[syllabusKey].subjects) || {};

            try {
                const rows = await DB.pullAllRevisionPlans();
                plansCache = {};
                rows.forEach(r => { plansCache[r.subject_key] = { start_date: r.start_date, entries: r.entries || [] }; });
            } catch (e) {
                plansCache = {};
            }

            try {
                const data = await DB.pull();
                const rs = data?.settings?.revision;
                revSettings = {
                    weekendDay: (rs && rs.weekendDay) || 'friday',
                    tasksPerDay: (rs && rs.tasksPerDay) || 2,
                };
            } catch (e) {
                // keep defaults
            }
        })();
        return initPromise;
    }

    function getSettings() {
        return { ...revSettings };
    }

    function availableSubjectKeys() {
        return Object.entries(subjectsForSyllabus)
            .filter(([, def]) => def.status === 'available' && def.plan)
            .map(([, def]) => def.plan.replace(/\.json$/, ''));
    }

    /* ---- Config loading (cached) ---- */
    async function getConfig(planFilename) {
        if (configCache[planFilename]) return configCache[planFilename];
        const cfg = await DB.loadRevisionConfig(planFilename);
        configCache[planFilename] = cfg;
        return cfg;
    }

    /* ──────────────────────────────────────────────────────────────────
       Generic plan engine — reads a config (chapters + rules +
       revisionCheckpoints) and a start date, returns generated entries.
       ────────────────────────────────────────────────────────────────── */

    const WEEKDAY_NUM = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

    function isWeekend(date) {
        const target = WEEKDAY_NUM[revSettings.weekendDay];
        const num = target === undefined ? 5 : target;
        return date.getDay() === num;
    }

    function nextStudyDay(date, skipWeekends) {
        const d = new Date(date);
        d.setDate(d.getDate() + 1);
        if (skipWeekends !== false) while (isWeekend(d)) d.setDate(d.getDate() + 1);
        return d;
    }

    function toISODate(date) { return DateUtils.toISODate(date); }

    function generateEntries(config, startDateStr) {
        const skipWeekends = config.rules?.skipWeekends !== false;
        const finalDays    = config.rules?.finalRevisionDays || 0;
        const chapters     = config.chapters || [];
        const checkpoints  = config.revisionCheckpoints || [];

        let cur = new Date(startDateStr + 'T00:00:00');
        if (skipWeekends) while (isWeekend(cur)) cur = nextStudyDay(cur, skipWeekends);

        const entries = [];
        let chapterIdx = 0;
        let cpIdx = 0;

        function push(e) { entries.push({ ...e, date: toISODate(cur), done: false }); }
        function advance() { cur = nextStudyDay(cur, skipWeekends); }

        while (chapterIdx < chapters.length) {
            const ch = chapters[chapterIdx];

            push({
                id: `${config.subjectKey}-${chapterIdx}-concept`,
                chapterIndex: chapterIdx, type: 'concept',
                chapterTitle: ch.title, subtitle: ch.subtitle || '',
                paper: ch.paper || '', difficulty: ch.difficulty || '',
                partLabel: 'Concept',
            });
            advance();

            const pd = ch.problemDays || 0;
            for (let p = 1; p <= pd; p++) {
                push({
                    id: `${config.subjectKey}-${chapterIdx}-problems-${p}`,
                    chapterIndex: chapterIdx, type: 'problems',
                    chapterTitle: ch.title, subtitle: ch.subtitle || '',
                    paper: ch.paper || '', difficulty: ch.difficulty || '',
                    partLabel: pd > 1 ? `Problems ${p}/${pd}` : 'Problems',
                });
                advance();
            }

            chapterIdx++;

            while (cpIdx < checkpoints.length && checkpoints[cpIdx].after === chapterIdx) {
                push({
                    id: `${config.subjectKey}-checkpoint-${cpIdx}`,
                    chapterIndex: null, type: 'revision',
                    chapterTitle: 'Revision Day', subtitle: checkpoints[cpIdx].covers,
                    paper: '', difficulty: '', partLabel: '',
                });
                advance();
                cpIdx++;
            }
        }

        for (let f = 1; f <= finalDays; f++) {
            push({
                id: `${config.subjectKey}-final-${f}`,
                chapterIndex: null, type: 'final',
                chapterTitle: 'Final Revision', subtitle: `Full syllabus — all ${chapters.length} chapters (Day ${f}/${finalDays})`,
                paper: '', difficulty: '', partLabel: '',
            });
            if (f < finalDays) advance();
        }

        return entries;
    }

    /* ──────────────────────────────────────────────────────────────────
       Replan — one shared logic for every subject.
       ────────────────────────────────────────────────────────────────── */
    async function replanAll(weekendDay, tasksPerDay) {
        revSettings = {
            weekendDay: WEEKDAY_NUM[weekendDay] !== undefined ? weekendDay : revSettings.weekendDay,
            tasksPerDay: Math.max(1, parseInt(tasksPerDay, 10) || revSettings.tasksPerDay || 2),
        };

        const keys = availableSubjectKeys().filter(k => plansCache[k] && (plansCache[k].entries || []).length > 0);
        if (keys.length === 0) return revSettings;

        const perSubject = {};
        keys.forEach(key => {
            const plan = plansCache[key];
            const sorted = [...plan.entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
            perSubject[key] = {
                startDate: plan.start_date,
                fixed: sorted.filter(e => e.done),
                pending: sorted.filter(e => !e.done),
            };
        });

        const queues = keys.map(k => [...perSubject[k].pending]);
        const combined = [];
        let more = true;
        while (more) {
            more = false;
            for (let i = 0; i < keys.length; i++) {
                if (queues[i].length) {
                    combined.push({ key: keys[i], entry: queues[i].shift() });
                    more = true;
                }
            }
        }

        let cur = new Date();
        cur.setHours(0, 0, 0, 0);

        let earliestPendingStr = null;
        keys.forEach(k => {
            const first = perSubject[k].pending[0];
            if (first && (earliestPendingStr === null || first.date < earliestPendingStr)) {
                earliestPendingStr = first.date;
            }
        });
        if (earliestPendingStr) {
            const earliestPendingDate = new Date(earliestPendingStr + 'T00:00:00');
            if (earliestPendingDate > cur) cur = earliestPendingDate;
        }

        if (isWeekend(cur)) cur = nextStudyDay(cur, true);

        const rebuilt = {};
        keys.forEach(k => { rebuilt[k] = [...perSubject[k].fixed]; });

        let countToday = 0;
        combined.forEach(({ key, entry }) => {
            if (countToday >= revSettings.tasksPerDay) {
                cur = nextStudyDay(cur, true);
                countToday = 0;
            }
            rebuilt[key].push({ ...entry, date: toISODate(cur) });
            countToday++;
        });

        for (const key of keys) {
            const entries = rebuilt[key].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
            plansCache[key] = { start_date: perSubject[key].startDate, entries };
            try {
                await DB.pushRevisionPlan(key, perSubject[key].startDate, entries);
            } catch (e) { /* best-effort — will retry on next sync */ }
        }

        if (activeConfig && rebuilt[activeConfig.subjectKey]) {
            activeEntries = plansCache[activeConfig.subjectKey].entries;
            if (screen === 'timeline') renderTimelineScreen();
            if (screen === 'overview') renderOverviewScreen();
        }
        renderTodaysRevisionCard();

        return revSettings;
    }

    /* ---- Push the whole remaining routine for ONE subject back by N days ---- */
    async function postponePending(days) {
        if (!activeConfig) return;
        const n = Math.max(1, parseInt(days, 10) || 1);
        activeEntries.forEach(e => {
            if (e.done) return;
            let d = DateUtils.parseISODate(e.date) || new Date();
            for (let i = 0; i < n; i++) d = nextStudyDay(d, true);
            e.date = toISODate(d);
        });
        activeEntries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        plansCache[activeConfig.subjectKey] = { start_date: activeStartDate, entries: activeEntries };
        try {
            await DB.pushRevisionPlan(activeConfig.subjectKey, activeStartDate, activeEntries);
            showToast('Remaining tasks postponed', 'success');
        } catch (e) {
            showToast('Saved locally — will sync when online', 'error');
        }
        renderOverviewScreen();
        renderTodaysRevisionCard();
    }

    /* ---- Merge entries into display rows (one row per chapter) ---- */
    function buildRows(entries) {
        const rows = [];
        const byChapter = new Map();
        entries.forEach(e => {
            if (e.chapterIndex === null) {
                rows.push({ kind: 'standalone', entries: [e] });
                return;
            }
            if (!byChapter.has(e.chapterIndex)) {
                const row = { kind: 'chapter', chapterIndex: e.chapterIndex, entries: [] };
                byChapter.set(e.chapterIndex, row);
                rows.push(row);
            }
            byChapter.get(e.chapterIndex).entries.push(e);
        });
        return rows;
    }

    function rowDone(row) { return row.entries.every(e => e.done); }
    function rowFirstDate(row) { return row.entries.map(e => e.date).sort()[0]; }
    function rowLastDate(row) { return row.entries.map(e => e.date).sort().slice(-1)[0]; }
    function rowMatchesFilter(row, filter) {
        if (filter === 'all') return true;
        if (filter === 'concept' || filter === 'problems') {
            return row.kind === 'chapter' ? true : row.entries[0].type === filter;
        }
        return row.entries[0].type === filter;
    }
    function rowMatchesQuery(row, q) {
        if (!q) return true;
        const hay = (row.entries[0].chapterTitle + ' ' + (row.entries[0].subtitle || '')).toLowerCase();
        return hay.includes(q.toLowerCase());
    }

    function rowDateRange(row) {
        const s = rowFirstDate(row), e = rowLastDate(row);
        return s === e ? fmtShort(s) : fmtShort(s) + ' – ' + fmtShort(e);
    }

    function fmtShort(iso) {
        const d = DateUtils.parseISODate(iso);
        if (!d) return '';
        return d.toLocaleDateString(navigator.language, { day: '2-digit', month: 'short' });
    }
    function fmtWeekday(iso) {
        const d = DateUtils.parseISODate(iso);
        if (!d) return '';
        return d.toLocaleDateString(navigator.language, { weekday: 'short' });
    }

    function typeIcon(type) {
        if (type === 'concept')  return '<i class="ri-book-open-line type-icon concept-icon"></i>';
        if (type === 'problems') return '<i class="ri-pencil-line type-icon problem-icon"></i>';
        if (type === 'revision') return '<i class="ri-refresh-line type-icon revision-icon"></i>';
        if (type === 'final')    return '<i class="ri-trophy-line type-icon final-icon"></i>';
        return '';
    }
    function typeLabel(type) {
        return { concept: 'Concept', problems: 'Problems', revision: 'Revision', final: 'Final Revision' }[type] || '';
    }
    function difficultyBadge(d) {
        if (!d) return '';
        const map = { Easy: 'badge-easy', Medium: 'badge-medium', Hard: 'badge-hard' };
        return `<span class="diff-badge ${map[d] || ''}">${d}</span>`;
    }

    /* ──────────────────────────────────────────────────────────────────
       Stats — progress, pace, streak. Pure functions over entries so
       they can be reused by the overview screen, the subject list and
       the homescreen card alike.
       ────────────────────────────────────────────────────────────────── */

    function computeProgress(entries) {
        const rows = buildRows(entries);
        const total = rows.length;
        const done = rows.filter(rowDone).length;
        return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
    }

    // Pace: compare how many rows were *due* by today vs how many are
    // actually done. Ahead = fewer overdue than a day's worth of slack.
    function computePace(entries) {
        const todayStr = DateUtils.todayISODate();
        const rows = buildRows(entries);
        const dueByNow = rows.filter(r => rowFirstDate(r) <= todayStr);
        const overdue = dueByNow.filter(r => !rowDone(r)).length;
        const doneEarly = rows.filter(r => rowDone(r) && rowFirstDate(r) > todayStr).length;
        if (overdue === 0 && doneEarly > 0) return { label: 'Ahead of schedule', tone: 'ahead', overdue };
        if (overdue === 0) return { label: 'On track', tone: 'ontrack', overdue };
        if (overdue <= 2) return { label: `Slightly behind — ${overdue} pending`, tone: 'behind', overdue };
        return { label: `Behind by ${overdue} tasks`, tone: 'behind', overdue };
    }

    // Consecutive study-days (most recent first, walking back from today)
    // where every task scheduled that day is complete.
    function computeStreak(entries) {
        const byDate = {};
        entries.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
        const dates = Object.keys(byDate).sort();
        const todayStr = DateUtils.todayISODate();
        let i = dates.length - 1;
        while (i >= 0 && dates[i] > todayStr) i--;
        let streak = 0;
        while (i >= 0) {
            const d = dates[i];
            const allDone = byDate[d].every(e => e.done);
            if (d === todayStr && !allDone) { i--; continue; } // today in progress doesn't break it
            if (!allDone) break;
            streak++;
            i--;
        }
        return streak;
    }

    function computeGlobalStreak() {
        let best = 0;
        Object.values(plansCache).forEach(p => {
            if (!p || !p.entries || !p.entries.length) return;
            best = Math.max(best, computeStreak(p.entries));
        });
        return best;
    }

    /* ──────────────────────────────────────────────────────────────────
       Modal lifecycle
       ────────────────────────────────────────────────────────────────── */

    function modalEl()  { return document.getElementById('revisionModal'); }
    function bodyEl()   { return document.getElementById('revisionModalBody'); }
    function titleEl()  { return document.getElementById('revisionModalTitle'); }
    function headerActionsEl() { return document.getElementById('revisionHeaderActions'); }

    function openSubjectList(asManager = false) {
        managerMode = asManager;
        screen = 'subjects';
        if (registry === null && initPromise) {
            bodyEl().innerHTML = `<div class="rev-empty-state"><i class="ri-loader-4-line"></i><p>Loading…</p></div>`;
            modalEl().classList.remove('hidden');
            initPromise.then(renderSubjectListScreen);
            return;
        }
        renderSubjectListScreen();
        modalEl().classList.remove('hidden');
    }

    function closeModal() {
        modalEl().classList.add('hidden');
        closeEditMenu();
    }

    function handleOverlayClick(e) {
        if (e.target === modalEl()) closeModal();
    }

    function backToSubjects() {
        screen = 'subjects';
        renderSubjectListScreen();
    }

    /* ---- Screen: subject list ---- */
    function renderSubjectListScreen() {
        titleEl().textContent = managerMode ? 'Edit Revision Data' : 'Final Revision Planner';
        headerActionsEl().innerHTML = '';

        const entries = Object.entries(subjectsForSyllabus);
        let html;
        if (entries.length === 0) {
            html = `<div class="rev-empty-state">
                <i class="ri-information-line"></i>
                <p>No revision plans are set up for your current curriculum yet.</p>
            </div>`;
        } else {
            html = `<div class="rev-subject-list">` + entries.map(([name, def]) => {
                const available = def.status === 'available' && def.plan;
                const planKey = available ? def.plan.replace(/\.json$/, '') : null;
                const plan = available ? plansCache[planKey] : null;
                const started = !!plan;
                let progressHtml = '';
                let metaText = available ? (started ? 'Tap to continue' : 'Tap to set up your plan') : 'Coming soon';
                if (started) {
                    const prog = computeProgress(plan.entries);
                    metaText = `${prog.done}/${prog.total} chapters · ${prog.pct}%`;
                    progressHtml = `<div class="rev-subject-row-bar"><div class="rev-subject-row-bar-fill" style="width:${prog.pct}%"></div></div>`;
                }
                return `
                <button class="rev-subject-row ${available ? '' : 'rev-subject-row--disabled'}"
                    ${available ? `onclick="Revision.openSubject('${name.replace(/'/g, "\\'")}')"` : 'disabled'}>
                    <div class="rev-subject-row-icon"><i class="${def.icon || 'ri-book-line'}"></i></div>
                    <div class="rev-subject-row-text">
                        <div class="rev-subject-row-name">${name}</div>
                        <div class="rev-subject-row-meta">${metaText}</div>
                        ${progressHtml}
                    </div>
                    ${available
                        ? '<i class="ri-arrow-right-s-line rev-subject-row-arrow"></i>'
                        : '<span class="coming-soon-badge">Coming soon</span>'}
                </button>`;
            }).join('') + `</div>`;
        }

        bodyEl().innerHTML = html;
    }

    /* ---- Open a specific subject: load plan, decide setup vs overview ---- */
    async function openSubject(subjectName) {
        activeSubjectName = subjectName;
        activeSubjectDef  = subjectsForSyllabus[subjectName];
        if (!activeSubjectDef || activeSubjectDef.status !== 'available') return;

        try {
            activeConfig = await getConfig(activeSubjectDef.plan);
        } catch (e) {
            showToast('Could not load revision plan data', 'error');
            return;
        }

        let plan = plansCache[activeConfig.subjectKey];
        if (!plan) {
            try {
                const row = await DB.pullRevisionPlan(activeConfig.subjectKey);
                if (row) {
                    plan = { start_date: row.start_date, entries: row.entries || [] };
                    plansCache[activeConfig.subjectKey] = plan;
                }
            } catch (e) { /* offline — fall through, treat as not started */ }
        }

        if (plan) {
            activeStartDate = plan.start_date;
            activeEntries   = plan.entries;
            tlFilter = 'all'; tlQuery = '';
            screen = 'overview';
            renderOverviewScreen();
        } else {
            screen = 'setup';
            renderSetupScreen();
        }
    }

    /* ---- Screen: first-time start-date setup ---- */
    function renderSetupScreen() {
        titleEl().textContent = activeSubjectName;
        headerActionsEl().innerHTML = `
            <button class="icon-btn" onclick="Revision.backToSubjects()" title="Back to subjects">
                <i class="ri-arrow-left-line"></i>
            </button>`;

        const today = DateUtils.todayISODate();
        const totalDays = (activeConfig.chapters || []).length;

        bodyEl().innerHTML = `
            <div class="rev-subject-header">
                <div class="rev-subject-icon"><i class="${activeSubjectDef.icon || 'ri-book-line'}"></i></div>
                <div>
                    <div class="rev-subject-name">${activeSubjectName}</div>
                    <div class="rev-subject-meta">${activeConfig.meta || ''} · ${totalDays} chapters</div>
                </div>
            </div>

            <div class="rev-date-form">
                <label class="rev-date-label">When do you want to start?</label>
                <p class="rev-date-hint">Pick your first study day. ${revSettings.weekendDay.charAt(0).toUpperCase() + revSettings.weekendDay.slice(1)}s are automatically skipped, and the pace follows your revision settings.</p>
                <div class="rev-date-row">
                    <input type="date" id="revStartDateInput" class="form-input rev-date-input" min="${today}" value="${today}" />
                    <button class="btn btn-primary" onclick="Revision.generatePlan()">
                        <i class="ri-sparkling-line"></i> Generate Plan
                    </button>
                </div>
            </div>
        `;
    }

    async function generatePlan() {
        const input = document.getElementById('revStartDateInput');
        if (!input || !input.value) { showToast('Please pick a start date', 'error'); return; }

        const entries = generateEntries(activeConfig, input.value);
        activeStartDate = input.value;
        activeEntries = entries;

        try {
            await DB.pushRevisionPlan(activeConfig.subjectKey, activeStartDate, activeEntries);
            plansCache[activeConfig.subjectKey] = { start_date: activeStartDate, entries: activeEntries };
            showToast('Revision plan created', 'success');
        } catch (e) {
            showToast('Saved locally — will sync when online', 'error');
        }

        try { await replanAll(revSettings.weekendDay, revSettings.tasksPerDay); } catch (e) { /* best-effort */ }
        activeEntries = (plansCache[activeConfig.subjectKey] || { entries: activeEntries }).entries;

        tlFilter = 'all'; tlQuery = '';
        screen = 'overview';
        renderOverviewScreen();
        renderTodaysRevisionCard();
    }

    /* ──────────────────────────────────────────────────────────────────
       Screen: Overview — the new subject home. Progress ring, pace,
       streak, today's tasks and a peek at what's coming next, plus a
       shortcut into the full timeline.
       ────────────────────────────────────────────────────────────────── */
    function renderOverviewScreen() {
        titleEl().textContent = activeSubjectName;
        headerActionsEl().innerHTML = editMenuHtml() + `
            <button class="icon-btn" onclick="Revision.backToSubjects()" title="Back to subjects">
                <i class="ri-arrow-left-line"></i>
            </button>`;

        const rows = buildRows(activeEntries);
        const prog = computeProgress(activeEntries);
        const pace = computePace(activeEntries);
        const streak = computeStreak(activeEntries);
        const todayStr = DateUtils.todayISODate();

        const todayRows = rows.filter(r => r.entries.some(e => e.date === todayStr));
        const upNext = rows
            .filter(r => !rowDone(r) && rowFirstDate(r) > todayStr)
            .sort((a, b) => rowFirstDate(a) < rowFirstDate(b) ? -1 : 1)
            .slice(0, 3);

        const ringDeg = Math.round(prog.pct * 3.6);

        bodyEl().innerHTML = `
        <div class="rev-overview">
            <div class="rev-overview-top">
                <div class="rev-ring" style="--ring-deg:${ringDeg}deg">
                    <div class="rev-ring-inner">
                        <div class="rev-ring-pct">${prog.pct}%</div>
                        <div class="rev-ring-label">${prog.done}/${prog.total}</div>
                    </div>
                </div>
                <div class="rev-overview-stats">
                    <div class="rev-stat-pill rev-stat-pill--${pace.tone}">
                        <i class="ri-${pace.tone === 'behind' ? 'error-warning-line' : pace.tone === 'ahead' ? 'rocket-2-line' : 'checkbox-circle-line'}"></i>
                        ${pace.label}
                    </div>
                    ${streak > 0 ? `
                    <div class="rev-stat-pill rev-stat-pill--streak">
                        <i class="ri-fire-line"></i> ${streak}-day streak
                    </div>` : ''}
                    <div class="rev-stat-pill">
                        <i class="ri-calendar-line"></i> Started ${fmtShort(activeStartDate)}
                    </div>
                </div>
            </div>

            <button class="rev-view-timeline-btn" onclick="Revision.openTimeline()">
                <span><i class="ri-list-check-2"></i> View full timeline</span>
                <i class="ri-arrow-right-s-line"></i>
            </button>

            <div class="rev-overview-section">
                <div class="rev-overview-section-title">Today · ${fmtShort(todayStr)}</div>
                ${todayRows.length === 0
                    ? `<div class="rev-overview-empty">Nothing scheduled for today. Enjoy the breather.</div>`
                    : `<div class="rev-mini-rows">${todayRows.map(r => miniRowHtml(r)).join('')}</div>`}
            </div>

            ${upNext.length > 0 ? `
            <div class="rev-overview-section">
                <div class="rev-overview-section-title">Up next</div>
                <div class="rev-mini-rows rev-mini-rows--muted">${upNext.map(r => miniRowHtml(r, true)).join('')}</div>
            </div>` : ''}
        </div>`;
    }

    function miniRowHtml(row, showDate = false) {
        const done = rowDone(row);
        const first = row.entries[0];
        const type = row.kind === 'chapter' ? 'concept' : first.type;
        return `
        <div class="rev-mini-row ${done ? 'rev-mini-row--done' : ''}">
            <div class="rev-mini-row-icon">${typeIcon(type)}</div>
            <div class="rev-mini-row-text">
                <div class="rev-mini-row-title ${done ? 'rev-mini-row-title--done' : ''}">${first.chapterTitle}</div>
                <div class="rev-mini-row-sub">${showDate ? fmtShort(rowFirstDate(row)) + ' · ' : ''}${row.kind === 'chapter' ? row.entries.map(e => e.partLabel).join(', ') : (first.subtitle || typeLabel(first.type))}</div>
            </div>
            <div class="rev-row-check ${done ? 'done' : ''}">${done ? '<i class="ri-check-line"></i>' : ''}</div>
        </div>`;
    }

    function editMenuHtml() {
        return `
            <div class="rev-edit-menu-wrap">
                <button class="icon-btn" onclick="Revision.toggleEditMenu(event)" title="Edit plan">
                    <i class="ri-more-2-fill"></i>
                </button>
                <div class="rev-edit-menu hidden" id="revEditMenu">
                    <button onclick="Revision.startEditStartDate()">
                        <i class="ri-calendar-event-line"></i> Edit start date
                    </button>
                    <button onclick="Revision.startPostpone()">
                        <i class="ri-time-line"></i> Postpone remaining tasks
                    </button>
                    <button class="rev-edit-menu-danger" onclick="Revision.confirmResetProgress()">
                        <i class="ri-restart-line"></i> Reset progress
                    </button>
                </div>
            </div>`;
    }

    function startPostpone() {
        closeEditMenu();
        titleEl().textContent = activeSubjectName;
        headerActionsEl().innerHTML = `
            <button class="icon-btn" onclick="Revision.renderOverviewScreen()" title="Cancel">
                <i class="ri-close-line"></i>
            </button>`;
        bodyEl().innerHTML = `
            <div class="rev-edit-date-notice">
                <i class="ri-information-line"></i>
                <p>Push every remaining (not-yet-done) task forward by a number of study days. Anything already ticked stays exactly where it is.</p>
            </div>
            <div class="rev-date-form">
                <label class="rev-date-label">Postpone by</label>
                <div class="rev-date-row">
                    <input type="number" id="revPostponeInput" class="form-input rev-date-input" min="1" max="30" value="1" style="max-width:100px" />
                    <span style="align-self:center;color:var(--text-3);font-size:0.85rem">study day(s)</span>
                </div>
                <div class="rev-date-row" style="margin-top:0.75rem">
                    <button class="btn btn-primary" onclick="Revision.applyPostpone()">
                        <i class="ri-check-line"></i> Apply
                    </button>
                    <button class="btn btn-ghost" onclick="Revision.renderOverviewScreen()">Cancel</button>
                </div>
            </div>`;
    }

    async function applyPostpone() {
        const input = document.getElementById('revPostponeInput');
        const days = input ? parseInt(input.value, 10) : 1;
        await postponePending(days);
        screen = 'overview';
    }

    /* ──────────────────────────────────────────────────────────────────
       Screen: Timeline — grouped by week, filterable, searchable.
       ────────────────────────────────────────────────────────────────── */
    function openTimeline() {
        screen = 'timeline';
        renderTimelineScreen();
    }

    function weekKeyFor(dateStr) {
        const d = DateUtils.parseISODate(dateStr);
        const day = (d.getDay() + 6) % 7; // Monday = 0
        const monday = new Date(d);
        monday.setDate(d.getDate() - day);
        return toISODate(monday);
    }

    function renderTimelineScreen() {
        titleEl().textContent = activeSubjectName;
        headerActionsEl().innerHTML = editMenuHtml() + `
            <button class="icon-btn" onclick="Revision.renderOverviewScreen()" title="Back to overview">
                <i class="ri-arrow-left-line"></i>
            </button>`;

        let rows = buildRows(activeEntries).filter(r => rowMatchesFilter(r, tlFilter) && rowMatchesQuery(r, tlQuery));
        const prog = computeProgress(activeEntries);
        const todayStr = DateUtils.todayISODate();

        const groups = new Map();
        rows.forEach(r => {
            const wk = weekKeyFor(rowFirstDate(r));
            if (!groups.has(wk)) groups.set(wk, []);
            groups.get(wk).push(r);
        });

        const chips = [
            ['all', 'All'], ['concept', 'Concept'], ['problems', 'Problems'],
            ['revision', 'Revision'], ['final', 'Final'],
        ].map(([key, label]) => `
            <button class="rev-chip ${tlFilter === key ? 'rev-chip--active' : ''}" onclick="Revision.setTimelineFilter('${key}')">${label}</button>
        `).join('');

        let groupsHtml = '';
        if (groups.size === 0) {
            groupsHtml = `<div class="rev-empty-state"><i class="ri-search-line"></i><p>No matching tasks.</p></div>`;
        } else {
            groupsHtml = [...groups.entries()].map(([wk, wrows], gi) => {
                const wdone = wrows.filter(rowDone).length;
                const wkEnd = new Date(DateUtils.parseISODate(wk)); wkEnd.setDate(wkEnd.getDate() + 6);
                return `
                <div class="rev-week-group">
                    <div class="rev-week-header">
                        <span>Week ${gi + 1} · ${fmtShort(wk)} – ${fmtShort(toISODate(wkEnd))}</span>
                        <span class="rev-week-header-count">${wdone}/${wrows.length}</span>
                    </div>
                    <div class="rev-week-cards">
                        ${wrows.map(r => cardHtml(r, todayStr)).join('')}
                    </div>
                </div>`;
            }).join('');
        }

        bodyEl().innerHTML = `
            <div class="rev-table-summary">
                <span><i class="ri-calendar-line"></i> Started ${fmtShort(activeStartDate)}</span>
                <span><i class="ri-checkbox-circle-line"></i> ${prog.done} / ${prog.total} done (${prog.pct}%)</span>
                <button class="rev-jump-today" onclick="Revision.jumpToToday()"><i class="ri-focus-3-line"></i> Jump to today</button>
            </div>
            <div class="rev-timeline-controls">
                <div class="rev-chip-row">${chips}</div>
                <div class="rev-search-wrap">
                    <i class="ri-search-line"></i>
                    <input type="text" class="rev-search-input" placeholder="Search chapters…" value="${tlQuery.replace(/"/g, '&quot;')}" oninput="Revision.setTimelineQuery(this.value)" />
                </div>
            </div>
            <div class="rev-timeline-list" id="revTimelineList">${groupsHtml}</div>
        `;
    }

    function cardHtml(row, todayStr) {
        const done = rowDone(row);
        const first = row.entries[0];
        const isToday = row.entries.some(e => e.date === todayStr);
        if (row.kind === 'chapter') {
            const parts = row.entries.map(e => `
                <label class="rev-subtask">
                    <input type="checkbox" ${e.done ? 'checked' : ''}
                        onchange="Revision.toggleEntry('${e.id}', this.checked)" />
                    <span>${e.partLabel}</span>
                </label>`).join('');
            return `
            <div class="tl-card ${done ? 'tl-card--done' : ''} ${isToday ? 'tl-card--today' : ''}" data-date="${rowFirstDate(row)}">
                <div class="tl-card-date">
                    <span class="tl-date-d">${fmtWeekday(rowFirstDate(row))}</span>
                    <span class="tl-date-r">${rowDateRange(row)}</span>
                </div>
                <div class="tl-card-body">
                    <div class="tl-card-head">
                        ${typeIcon('concept')}
                        <span class="rev-topic-title ${done ? 'rev-topic-title--done' : ''}">${first.chapterTitle}</span>
                        ${first.paper ? `<span class="paper-pill">${first.paper}</span>` : ''}
                        ${first.difficulty ? difficultyBadge(first.difficulty) : ''}
                    </div>
                    ${first.subtitle ? `<div class="rev-topic-sub">${first.subtitle}</div>` : ''}
                    <div class="rev-subtask-row">${parts}</div>
                </div>
            </div>`;
        }
        const e = first;
        return `
        <div class="tl-card tl-card--${e.type} ${done ? 'tl-card--done' : ''} ${isToday ? 'tl-card--today' : ''}" data-date="${e.date}">
            <div class="tl-card-date">
                <span class="tl-date-d">${fmtWeekday(e.date)}</span>
                <span class="tl-date-r">${fmtShort(e.date)}</span>
            </div>
            <div class="tl-card-body">
                <div class="tl-card-head">
                    ${typeIcon(e.type)}
                    <span class="rev-topic-title ${done ? 'rev-topic-title--done' : ''}">${e.chapterTitle}</span>
                    <span class="type-pill type-pill--${e.type}">${typeLabel(e.type)}</span>
                </div>
                ${e.subtitle ? `<div class="rev-topic-sub">${e.subtitle}</div>` : ''}
            </div>
            <div class="rev-row-check ${done ? 'done' : ''}" onclick="Revision.toggleEntry('${e.id}', ${!e.done})">
                ${done ? '<i class="ri-check-line"></i>' : ''}
            </div>
        </div>`;
    }

    function setTimelineFilter(key) { tlFilter = key; renderTimelineScreen(); }
    function setTimelineQuery(q) { tlQuery = q; renderTimelineScreen(); }

    function jumpToToday() {
        const list = document.getElementById('revTimelineList');
        if (!list) return;
        const todayStr = DateUtils.todayISODate();
        let el = list.querySelector(`[data-date="${todayStr}"]`);
        if (!el) {
            const cards = [...list.querySelectorAll('[data-date]')];
            el = cards.find(c => c.dataset.date >= todayStr) || cards[cards.length - 1];
        }
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /* ---- Toggle a single entry; persist; refresh whatever is visible ---- */
    async function toggleEntry(entryId, done) {
        const e = activeEntries.find(x => x.id === entryId);
        if (!e) return;
        e.done = done;

        if (screen === 'timeline') renderTimelineScreen();
        if (screen === 'overview') renderOverviewScreen();
        renderTodaysRevisionCard();

        try {
            await DB.pushRevisionPlan(activeConfig.subjectKey, activeStartDate, activeEntries);
            plansCache[activeConfig.subjectKey] = { start_date: activeStartDate, entries: activeEntries };
        } catch (err) {
            showToast('Could not sync — will retry', 'error');
        }
    }

    /* ---- Edit menu ---- */
    function toggleEditMenu(e) {
        e.stopPropagation();
        document.getElementById('revEditMenu')?.classList.toggle('hidden');
    }
    function closeEditMenu() {
        document.getElementById('revEditMenu')?.classList.add('hidden');
    }
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('revEditMenu');
        if (menu && !menu.contains(e.target) && !e.target.closest('.rev-edit-menu-wrap')) {
            menu.classList.add('hidden');
        }
    });

    function startEditStartDate() {
        closeEditMenu();
        titleEl().textContent = activeSubjectName;
        headerActionsEl().innerHTML = `
            <button class="icon-btn" onclick="Revision.renderOverviewScreen()" title="Cancel">
                <i class="ri-close-line"></i>
            </button>`;

        bodyEl().innerHTML = `
            <div class="rev-edit-date-notice">
                <i class="ri-information-line"></i>
                <p>Changing your start date regenerates the whole schedule from that day onward. Ticks you've already made for the same chapters are kept where possible.</p>
            </div>
            <div class="rev-date-form">
                <label class="rev-date-label">New start date</label>
                <div class="rev-date-row">
                    <input type="date" id="revEditDateInput" class="form-input rev-date-input" value="${activeStartDate}" />
                    <button class="btn btn-primary" onclick="Revision.applyEditedStartDate()">
                        <i class="ri-check-line"></i> Save
                    </button>
                    <button class="btn btn-ghost" onclick="Revision.renderOverviewScreen()">Cancel</button>
                </div>
            </div>`;
    }

    async function applyEditedStartDate() {
        const input = document.getElementById('revEditDateInput');
        if (!input || !input.value) { showToast('Please pick a date', 'error'); return; }

        const doneMap = {};
        activeEntries.forEach(e => { if (e.done) doneMap[e.id] = true; });

        const fresh = generateEntries(activeConfig, input.value);
        fresh.forEach(e => { if (doneMap[e.id]) e.done = true; });

        activeStartDate = input.value;
        activeEntries = fresh;

        try {
            await DB.pushRevisionPlan(activeConfig.subjectKey, activeStartDate, activeEntries);
            plansCache[activeConfig.subjectKey] = { start_date: activeStartDate, entries: activeEntries };
            showToast('Start date updated', 'success');
        } catch (e) {
            showToast('Saved locally — will sync when online', 'error');
        }

        try { await replanAll(revSettings.weekendDay, revSettings.tasksPerDay); } catch (e) { /* best-effort */ }
        activeEntries = (plansCache[activeConfig.subjectKey] || { entries: activeEntries }).entries;

        screen = 'overview';
        renderOverviewScreen();
        renderTodaysRevisionCard();
    }

    function confirmResetProgress() {
        closeEditMenu();
        if (!window.confirm(`Reset all progress for ${activeSubjectName}? This clears every tick mark but keeps your schedule and start date.`)) return;
        activeEntries.forEach(e => { e.done = false; });
        renderOverviewScreen();
        renderTodaysRevisionCard();
        DB.pushRevisionPlan(activeConfig.subjectKey, activeStartDate, activeEntries)
            .then(() => { plansCache[activeConfig.subjectKey] = { start_date: activeStartDate, entries: activeEntries }; })
            .catch(() => showToast('Could not sync reset — will retry', 'error'));
    }

    /* ──────────────────────────────────────────────────────────────────
       Homescreen — Today's Revision card
       ────────────────────────────────────────────────────────────────── */

    function renderTodaysRevisionCard() {
        const slot = document.getElementById('todaysRevisionSlot');
        if (!slot) return;

        const todayStr = DateUtils.todayISODate();
        const cards = [];

        Object.entries(subjectsForSyllabus).forEach(([name, def]) => {
            if (def.status !== 'available' || !def.plan) return;
            const key = def.plan.replace(/\.json$/, '');
            const plan = plansCache[key];
            if (!plan) return;

            const todays = plan.entries.filter(e => e.date === todayStr);
            if (todays.length === 0) return;

            const rows = buildRows(todays);
            cards.push({ name, key, def, rows });
        });

        if (cards.length === 0) { slot.innerHTML = ''; return; }

        const streak = computeGlobalStreak();
        const totalTasks = cards.reduce((n, c) => n + c.rows.length, 0);

        slot.innerHTML = `
        ${streak > 0 ? `<div class="trc-streak-banner"><i class="ri-fire-line"></i> ${streak}-day study streak — keep it going</div>` : ''}
        ${cards.map(card => {
            const rowsHtml = card.rows.map(row => {
                if (row.kind === 'chapter') {
                    const done = rowDone(row);
                    const parts = row.entries.map(e => `
                        <label class="trc-subtask">
                            <input type="checkbox" ${e.done ? 'checked' : ''}
                                onchange="Revision.toggleTodayEntry('${card.key}','${e.id}', this.checked)" />
                            <span>${e.partLabel}</span>
                        </label>`).join('');
                    return `
                    <div class="trc-row ${done ? 'trc-row--done' : ''}">
                        <div class="trc-row-icon">${typeIcon('concept')}</div>
                        <div class="trc-row-text">
                            <div class="trc-row-title ${done ? 'trc-row-title--done' : ''}">${row.entries[0].chapterTitle}</div>
                            <div class="trc-row-subtasks">${parts}</div>
                        </div>
                        <div class="trc-row-check ${done ? 'done' : ''}">${done ? '<i class="ri-check-line"></i>' : ''}</div>
                    </div>`;
                }
                const e = row.entries[0];
                return `
                <div class="trc-row ${e.done ? 'trc-row--done' : ''}">
                    <div class="trc-row-icon">${typeIcon(e.type)}</div>
                    <div class="trc-row-text">
                        <div class="trc-row-title ${e.done ? 'trc-row-title--done' : ''}">${e.chapterTitle}</div>
                        <div class="trc-row-sub">${e.subtitle || ''}</div>
                    </div>
                    <div class="trc-row-check ${e.done ? 'done' : ''}" onclick="Revision.toggleTodayEntry('${card.key}','${e.id}', ${!e.done})">
                        ${e.done ? '<i class="ri-check-line"></i>' : ''}
                    </div>
                </div>`;
            }).join('');

            return `
            <div class="todays-revision-card">
                <div class="trc-header">
                    <div class="trc-header-icon"><i class="${card.def.icon || 'ri-book-line'}"></i></div>
                    <div class="trc-header-text">
                        <div class="trc-title">Today's Revision</div>
                        <div class="trc-sub">${card.name} · ${fmtDate(todayStr)}</div>
                    </div>
                </div>
                <div class="trc-rows">${rowsHtml}</div>
            </div>`;
        }).join('')}`;
    }

    async function toggleTodayEntry(subjectKey, entryId, done) {
        const plan = plansCache[subjectKey];
        if (!plan) return;
        const e = plan.entries.find(x => x.id === entryId);
        if (!e) return;
        e.done = done;

        renderTodaysRevisionCard();
        if (activeConfig && activeConfig.subjectKey === subjectKey) {
            activeEntries = plan.entries;
            if (screen === 'timeline') renderTimelineScreen();
            if (screen === 'overview') renderOverviewScreen();
        }

        try {
            await DB.pushRevisionPlan(subjectKey, plan.start_date, plan.entries);
        } catch (err) {
            showToast('Could not sync — will retry', 'error');
        }
    }

    return {
        init, openSubjectList, openSubject, closeModal, handleOverlayClick, backToSubjects,
        generatePlan, toggleEntry, toggleEditMenu, startEditStartDate, applyEditedStartDate,
        confirmResetProgress, renderTodaysRevisionCard, toggleTodayEntry,
        getSettings, replanAll,
        renderOverviewScreen, openTimeline, renderTimelineScreen,
        setTimelineFilter, setTimelineQuery, jumpToToday,
        startPostpone, applyPostpone,
    };
})();
