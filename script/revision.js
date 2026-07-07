/* =============================================
   Revision — Final Revision Planner
   All subject/chapter/schedule DATA lives in /config/revision/*.json.
   This file only contains the generic engine + UI that reads that data.
   Cloud-first: plans are stored in Supabase (table `revision_progress`),
   one row per (user, subjectKey), via DB.pullRevisionPlan / pushRevisionPlan.
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
    let screen            = 'subjects'; // 'subjects' | 'setup' | 'table'
    let managerMode       = false; // true when opened via manager mode

    // Global revision settings — one shared logic across every subject.
    // weekendDay: 'friday' | 'sunday' (the single no-study day of the week)
    // tasksPerDay: how many tasks, combined across ALL subjects, land on one day
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

            // Warm the plans cache so the homescreen "today" card can render immediately
            try {
                const rows = await DB.pullAllRevisionPlans();
                plansCache = {};
                rows.forEach(r => { plansCache[r.subject_key] = { start_date: r.start_date, entries: r.entries || [] }; });
            } catch (e) {
                plansCache = {};
            }

            // Load the user's global revision settings (weekend day + intensity)
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
       No subject-specific logic here; everything comes from the config.
       ────────────────────────────────────────────────────────────────── */

    const WEEKDAY_NUM = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

    // The single no-study day of the week, as chosen in Settings.
    function isWeekend(date) {
        const target = WEEKDAY_NUM[revSettings.weekendDay];
        const num = target === undefined ? 5 /* friday default */ : target;
        return date.getDay() === num;
    }

    function nextStudyDay(date, skipWeekends) {
        const d = new Date(date);
        d.setDate(d.getDate() + 1);
        if (skipWeekends !== false) while (isWeekend(d)) d.setDate(d.getDate() + 1);
        return d;
    }

    function toISODate(date) {
        return date.toISOString().slice(0, 10);
    }

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

            // Concept day
            push({
                id: `${config.subjectKey}-${chapterIdx}-concept`,
                chapterIndex: chapterIdx, type: 'concept',
                chapterTitle: ch.title, subtitle: ch.subtitle || '',
                paper: ch.paper || '', difficulty: ch.difficulty || '',
                partLabel: 'Concept',
            });
            advance();

            // Problem-solving days
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

            // Revision checkpoint(s) due after this chapter
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

        // Final full-syllabus revision
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
       Combines the still-pending (not done) tasks of every started
       subject, keeps everything already ticked exactly where it is, and
       redistributes the upcoming routine across days according to the
       chosen weekend day and how many tasks (total, across subjects)
       should land on one day.
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
                fixed: sorted.filter(e => e.done),      // untouched — progress stays
                pending: sorted.filter(e => !e.done),   // upcoming — gets replanned
            };
        });

        // Round-robin merge so no single subject monopolises a day.
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

        // Reflect any changes in whatever's currently on screen
        if (activeConfig && rebuilt[activeConfig.subjectKey]) {
            activeEntries = plansCache[activeConfig.subjectKey].entries;
            if (screen === 'table') renderTableScreen();
        }
        renderTodaysRevisionCard();

        return revSettings;
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
        // Preserve schedule order (rows array was already built in date order
        // since chapter rows are inserted on first sight of that chapterIndex,
        // which always happens before standalone entries for later chapters).
        return rows;
    }

    function rowDateRange(row) {
        const dates = row.entries.map(e => e.date).sort();
        if (dates[0] === dates[dates.length - 1]) return fmtDate(dates[0]);
        return fmtDate(dates[0]) + ' – ' + fmtDate(dates[dates.length - 1]);
    }

    function rowDone(row) { return row.entries.every(e => e.done); }

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
            // Defensive: dashboard's background init() hasn't resolved yet
            // (e.g. user clicked within the first instant of page load) —
            // wait for that same in-flight init instead of showing a false
            // empty state or re-fetching with a guessed syllabus key.
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
                const started = available && !!plansCache[planKey];
                return `
                <button class="rev-subject-row ${available ? '' : 'rev-subject-row--disabled'}"
                    ${available ? `onclick="Revision.openSubject('${name.replace(/'/g, "\\'")}')"` : 'disabled'}>
                    <div class="rev-subject-row-icon"><i class="${def.icon || 'ri-book-line'}"></i></div>
                    <div class="rev-subject-row-text">
                        <div class="rev-subject-row-name">${name}</div>
                        <div class="rev-subject-row-meta">${available ? (started ? 'Plan in progress — tap to continue' : 'Tap to set up your plan') : 'Coming soon'}</div>
                    </div>
                    ${available
                        ? '<i class="ri-arrow-right-s-line rev-subject-row-arrow"></i>'
                        : '<span class="coming-soon-badge">Coming soon</span>'}
                </button>`;
            }).join('') + `</div>`;
        }

        bodyEl().innerHTML = html;
    }

    /* ---- Open a specific subject: load plan, decide setup vs table ---- */
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
            screen = 'table';
            renderTableScreen();
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

        const today = new Date().toISOString().slice(0, 10);
        const totalDays = (activeConfig.chapters || []).length;

        bodyEl().innerHTML = `
            <div class="rev-subject-header">
                <div class="rev-subject-icon"><i class="${activeSubjectDef.icon || 'ri-book-line'}"></i></div>
                <div>
                    <div class="rev-subject-name">${activeSubjectDef ? activeSubjectName : ''}</div>
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

        // Apply the shared weekend/intensity logic across every subject now
        // that this one has joined the mix.
        try { await replanAll(revSettings.weekendDay, revSettings.tasksPerDay); } catch (e) { /* best-effort */ }
        activeEntries = (plansCache[activeConfig.subjectKey] || { entries: activeEntries }).entries;

        screen = 'table';
        renderTableScreen();
        renderTodaysRevisionCard();
    }

    /* ---- Screen: the plan table ---- */
    function renderTableScreen() {
        titleEl().textContent = activeSubjectName;
        headerActionsEl().innerHTML = `
            <div class="rev-edit-menu-wrap">
                <button class="icon-btn" onclick="Revision.toggleEditMenu(event)" title="Edit plan">
                    <i class="ri-more-2-fill"></i>
                </button>
                <div class="rev-edit-menu hidden" id="revEditMenu">
                    <button onclick="Revision.startEditStartDate()">
                        <i class="ri-calendar-event-line"></i> Edit start date
                    </button>
                    <button class="rev-edit-menu-danger" onclick="Revision.confirmResetProgress()">
                        <i class="ri-restart-line"></i> Reset progress
                    </button>
                </div>
            </div>
            <button class="icon-btn" onclick="Revision.backToSubjects()" title="Back to subjects">
                <i class="ri-arrow-left-line"></i>
            </button>`;

        const rows = buildRows(activeEntries);
        const totalRows = rows.length;
        const doneRows  = rows.filter(rowDone).length;
        const pct = totalRows > 0 ? Math.round((doneRows / totalRows) * 100) : 0;

        let tableHtml = `
        <div class="rev-table-summary">
            <span><i class="ri-calendar-line"></i> Started ${fmtDate(activeStartDate)}</span>
            <span><i class="ri-checkbox-circle-line"></i> ${doneRows} / ${totalRows} done (${pct}%)</span>
        </div>
        <div class="rev-table-wrap">
            <table class="rev-table">
                <thead>
                    <tr>
                        <th class="rev-th-date">Date</th>
                        <th class="rev-th-sub">Subject</th>
                        <th class="rev-th-topic">Topic / Type</th>
                        <th class="rev-th-tick">Done</th>
                    </tr>
                </thead>
                <tbody>`;

        rows.forEach((row, idx) => {
            const done = rowDone(row);
            if (row.kind === 'chapter') {
                const first = row.entries[0];
                const partsHtml = row.entries.map(e => `
                    <label class="rev-subtask">
                        <input type="checkbox" ${e.done ? 'checked' : ''}
                            onchange="Revision.toggleEntry('${e.id}', this.checked)" />
                        <span>${e.partLabel}</span>
                    </label>`).join('');
                tableHtml += `
                <tr class="rev-row ${done ? 'rev-row--done' : ''}">
                    <td class="rev-td-date">${rowDateRange(row)}</td>
                    <td class="rev-td-sub">${activeSubjectName}</td>
                    <td class="rev-td-topic">
                        <div class="rev-topic-main">
                            ${typeIcon('concept')}
                            <span class="rev-topic-title ${done ? 'rev-topic-title--done' : ''}">${first.chapterTitle}</span>
                            ${first.paper ? `<span class="paper-pill">${first.paper}</span>` : ''}
                            ${first.difficulty ? difficultyBadge(first.difficulty) : ''}
                        </div>
                        ${first.subtitle ? `<div class="rev-topic-sub">${first.subtitle}</div>` : ''}
                        <div class="rev-subtask-row">${partsHtml}</div>
                    </td>
                    <td class="rev-td-tick">
                        <div class="rev-row-check ${done ? 'done' : ''}" title="${done ? 'All parts done' : 'Tick all parts to complete'}">
                            ${done ? '<i class="ri-check-line"></i>' : ''}
                        </div>
                    </td>
                </tr>`;
            } else {
                const e = row.entries[0];
                tableHtml += `
                <tr class="rev-row rev-row--${e.type} ${done ? 'rev-row--done' : ''}">
                    <td class="rev-td-date">${fmtDate(e.date)}</td>
                    <td class="rev-td-sub">${activeSubjectName}</td>
                    <td class="rev-td-topic">
                        <div class="rev-topic-main">
                            ${typeIcon(e.type)}
                            <span class="rev-topic-title ${done ? 'rev-topic-title--done' : ''}">${e.chapterTitle}</span>
                            <span class="type-pill type-pill--${e.type}">${typeLabel(e.type)}</span>
                        </div>
                        ${e.subtitle ? `<div class="rev-topic-sub">${e.subtitle}</div>` : ''}
                    </td>
                    <td class="rev-td-tick">
                        <div class="rev-row-check ${done ? 'done' : ''}" onclick="Revision.toggleEntry('${e.id}', ${!e.done})">
                            ${done ? '<i class="ri-check-line"></i>' : ''}
                        </div>
                    </td>
                </tr>`;
            }
        });

        tableHtml += `</tbody></table></div>`;
        bodyEl().innerHTML = tableHtml;
    }

    /* ---- Toggle a single entry; persist; refresh whatever is visible ---- */
    async function toggleEntry(entryId, done) {
        const e = activeEntries.find(x => x.id === entryId);
        if (!e) return;
        e.done = done;

        if (screen === 'table') renderTableScreen();
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
            <button class="icon-btn" onclick="Revision.renderTableScreen()" title="Cancel">
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
                    <button class="btn btn-ghost" onclick="Revision.renderTableScreen()">Cancel</button>
                </div>
            </div>`;
    }

    async function applyEditedStartDate() {
        const input = document.getElementById('revEditDateInput');
        if (!input || !input.value) { showToast('Please pick a date', 'error'); return; }

        // Preserve completion state per chapter/checkpoint id where the
        // regenerated schedule produces the same ids (same config = same ids,
        // since ids are derived from chapterIndex/type, not from date).
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

        screen = 'table';
        renderTableScreen();
        renderTodaysRevisionCard();
    }

    function confirmResetProgress() {
        closeEditMenu();
        if (!window.confirm(`Reset all progress for ${activeSubjectName}? This clears every tick mark but keeps your schedule and start date.`)) return;
        activeEntries.forEach(e => { e.done = false; });
        renderTableScreen();
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

        const todayStr = new Date().toISOString().slice(0, 10);
        const cards = [];

        Object.entries(subjectsForSyllabus).forEach(([name, def]) => {
            if (def.status !== 'available' || !def.plan) return;
            const key = def.plan.replace(/\.json$/, '');
            const plan = plansCache[key];
            if (!plan) return;

            const todays = plan.entries.filter(e => e.date === todayStr);
            if (todays.length === 0) return;

            // Group today's entries by chapter so a multi-part chapter
            // still shows as one task row with its own ticks.
            const rows = buildRows(todays);
            cards.push({ name, key, def, rows });
        });

        if (cards.length === 0) { slot.innerHTML = ''; return; }

        slot.innerHTML = cards.map(card => {
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
        }).join('');
    }

    async function toggleTodayEntry(subjectKey, entryId, done) {
        const plan = plansCache[subjectKey];
        if (!plan) return;
        const e = plan.entries.find(x => x.id === entryId);
        if (!e) return;
        e.done = done;

        renderTodaysRevisionCard();
        // Keep the open table modal in sync if this subject is currently open
        if (activeConfig && activeConfig.subjectKey === subjectKey && screen === 'table') {
            activeEntries = plan.entries;
            renderTableScreen();
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
        confirmResetProgress, renderTodaysRevisionCard, toggleTodayEntry, renderTableScreen,
        getSettings, replanAll,
    };
})();
