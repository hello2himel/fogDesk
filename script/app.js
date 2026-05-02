/* =============================================
   Study Buddy — Main App
   Cloud-first. No localStorage.
   Subject ticks control which subjects count
   toward the syllabus % progress.
   ============================================= */

let chapters        = {};
let enabledSubjects = {};
let activeTab       = '';
let expandedNotes   = {};
let pendingAction   = null;
let syncState       = 'offline';
let lastSyncTime    = null;
let isSaving        = false;
let _settings       = null; // in-memory cache

/* ---- Date helpers ---- */
function fmtDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(navigator.language, {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}
function fmtRange(s, e) {
    if (!s || !e) return '';
    return fmtDate(s) + ' — ' + fmtDate(e);
}

/* ---- Boot ---- */
async function boot() {
    if (!DB.isLoggedIn()) { window.location.replace('setup.html'); return; }

    const ok = DB.initCloud();
    if (!ok) {
        hideLoader();
        showToast('App not configured. Contact the developer.', 'error');
        renderShell({ startDate: '', endDate: '' });
        return;
    }

    setSyncState('syncing');
    try {
        const data = await DB.pull();
        if (data) {
            chapters        = data.chapters || {};
            const s         = data.settings || {};
            enabledSubjects = s.enabledSubjects || defaultEnabled(chapters);
            _settings       = { syllabus: s.syllabus || '', startDate: s.startDate || '', endDate: s.endDate || '' };
        } else {
            // First-ever login for this account
            chapters        = await DB.loadSyllabus('syllabus-bangladesh-hsc.json');
            enabledSubjects = defaultEnabled(chapters);
            _settings       = { syllabus: 'syllabus-bangladesh-hsc.json', startDate: '', endDate: '' };
        }
        lastSyncTime = new Date().toISOString();
        setSyncState('success');
        setTimeout(() => setSyncState('idle'), 2000);
    } catch (e) {
        setSyncState('error');
        showToast('Could not load your data. Try refreshing.', 'error');
        _settings = { syllabus: '', startDate: '', endDate: '' };
    }

    if (!activeTab || !chapters[activeTab]) activeTab = Object.keys(chapters)[0] || '';
    renderDashboard();
    hideLoader();
}

function defaultEnabled(chs) {
    const o = {};
    Object.keys(chs).forEach(s => { o[s] = true; });
    return o;
}

function hideLoader() {
    const el = document.getElementById('loadingScreen');
    if (el) el.remove();
}

/* ---- Dashboard ---- */
function renderDashboard() {
    const app  = document.getElementById('app');
    const s    = _settings || {};
    const tP   = calcTime(s.startDate, s.endDate);
    const sP   = calcSyllabus();
    const ins  = insight(tP.pct, sP.pct);

    app.innerHTML = `
    <div class="app-shell fade-in">
        <header class="app-header">
            <div class="app-header-left">
                <h1>Study <em>Buddy</em></h1>
                <p>${fmtRange(s.startDate, s.endDate)}</p>
            </div>
            <div class="header-right">
                <div class="sync-indicator">
                    <div class="sync-dot ${syncState}" id="syncDot"></div>
                    <span id="syncLabel">${syncLabel()}</span>
                </div>
                <a href="settings.html" class="btn btn-ghost btn-sm">
                    <i class="ri-settings-3-line"></i> Settings
                </a>
                <button class="btn btn-ghost btn-sm" onclick="triggerLogout()" title="Sign out">
                    <i class="ri-logout-box-r-line"></i>
                </button>
            </div>
        </header>

        <div class="progress-cards">
            <div class="progress-card">
                <div class="progress-card-num" id="timePct">${tP.pct}%</div>
                <div class="progress-bar-track"><div class="progress-bar-fill" id="timeFill" style="width:${tP.pct}%"></div></div>
                <div class="progress-card-label">Time elapsed</div>
                <div class="progress-card-sub">${tP.elapsed} / ${tP.total} days</div>
            </div>
            <div class="progress-card">
                <div class="progress-card-num" id="sylPct">${sP.pct}%</div>
                <div class="progress-bar-track"><div class="progress-bar-fill" id="sylFill" style="width:${sP.pct}%"></div></div>
                <div class="progress-card-label">Syllabus done</div>
                <div class="progress-card-sub">${sP.done} / ${sP.total} chapters
                    ${sP.skipped > 0 ? `<span class="skip-note">(${sP.skipped} skipped)</span>` : ''}
                </div>
            </div>
        </div>

        <div class="insight-banner ${ins.type}">
            <i class="${ins.icon}"></i>
            <span>${ins.msg}</span>
        </div>

        <div class="action-row">
            <button class="btn btn-primary" onclick="openSyllabus()">
                <i class="ri-edit-line"></i> Edit Progress
            </button>
            <button class="btn btn-ghost" onclick="exportCSV()">
                <i class="ri-download-line"></i> Export CSV
            </button>
            <button class="btn btn-ghost" id="syncBtn" onclick="manualSync()">
                <i class="ri-cloud-line"></i> Sync
            </button>
        </div>
    </div>

    <footer class="app-footer">
        Made with ❤️ by <a href="https://github.com/hello2himel" target="_blank">@hello2himel</a> from 🇧🇩
        <span class="footer-sep">·</span>
        This is open source software.
        <a href="https://github.com/hello2himel/study-buddy" target="_blank">View Source Code</a>
    </footer>
    </div>
    `;
}

/* ---- Progress calculations ---- */
function calcTime(startDate, endDate) {
    if (!startDate || !endDate) return { pct: 0, elapsed: 0, total: 0 };
    const s = new Date(startDate), e = new Date(endDate), n = new Date();
    const total   = Math.max(1, Math.ceil((e - s) / 86400000));
    const elapsed = Math.min(total, Math.max(0, Math.ceil((n - s) / 86400000)));
    return { pct: Math.round((elapsed / total) * 100), elapsed, total };
}

function calcSyllabus() {
    let total = 0, done = 0, skipped = 0;
    Object.entries(chapters).forEach(([sub, papers]) => {
        const on = enabledSubjects[sub] !== false;
        Object.values(papers).forEach(chs => {
            if (on) { total += chs.length; done += chs.filter(c => c.done).length; }
            else    { skipped += chs.length; }
        });
    });
    return { total, done, skipped, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function insight(tP, sP) {
    const d = sP - tP;
    if (d >= 5)  return { type: 'ahead',   icon: 'ri-rocket-line',        msg: `You're ${d}% ahead of schedule. Keep it up!` };
    if (d <= -10) return { type: 'behind', icon: 'ri-alert-line',          msg: `You're ${Math.abs(d)}% behind. Time to push harder.` };
    return              { type: 'ontrack', icon: 'ri-check-double-line',   msg: "You're roughly on track. Stay consistent!" };
}

function syncLabel() {
    if (syncState === 'syncing') return 'Saving…';
    if (syncState === 'success') return 'Saved';
    if (syncState === 'error')   return 'Save failed';
    if (!DB.cloudReady())        return 'Offline';
    return lastSyncTime ? 'Saved ' + timeAgo(lastSyncTime) : 'Ready';
}

function timeAgo(iso) {
    const m = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
}

/* ---- Syllabus modal ---- */
function openSyllabus() {
    renderSubjectList();
    renderTabs();
    renderChapters();
    document.getElementById('syllabusModal').classList.remove('hidden');
}
function closeSyllabus() { document.getElementById('syllabusModal').classList.add('hidden'); }

/* Subject panel with tick buttons */
function renderSubjectList() {
    const container = document.getElementById('subjectList');
    if (!container) return;
    container.innerHTML = Object.keys(chapters).map(sub => {
        const on    = enabledSubjects[sub] !== false;
        const papers = chapters[sub];
        const total = Object.values(papers).reduce((a, c) => a + c.length, 0);
        const done  = Object.values(papers).reduce((a, c) => a + c.filter(x => x.done).length, 0);
        return `
        <div class="subject-row ${on ? 'enabled' : 'disabled'}">
            <button class="subject-tick ${on ? 'ticked' : ''}"
                onclick="toggleSubject('${sub}')"
                title="${on ? 'Exclude from progress %' : 'Include in progress %'}">
                ${on ? '<i class="ri-checkbox-circle-fill"></i>' : '<i class="ri-checkbox-blank-circle-line"></i>'}
            </button>
            <span class="subject-name" onclick="switchTab('${sub}')">${sub}</span>
            <span class="subject-stat">${done}/${total}</span>
        </div>`;
    }).join('');
}

function toggleSubject(sub) {
    enabledSubjects[sub] = !(enabledSubjects[sub] !== false);
    renderSubjectList();
    updateBars();
    scheduleSave();
}

function renderTabs() {
    document.getElementById('subjectTabs').innerHTML = Object.keys(chapters).map(sub =>
        `<button class="tab-btn ${sub === activeTab ? 'active' : ''}" onclick="switchTab('${sub}')">${sub}</button>`
    ).join('');
}

function switchTab(sub) {
    activeTab = sub;
    renderTabs();
    renderChapters();
}

function renderChapters() {
    const grid = document.getElementById('chaptersGrid');
    if (!chapters[activeTab]) { grid.innerHTML = '<p style="color:var(--text-3);padding:1rem;">No chapters found.</p>'; return; }
    grid.innerHTML = '<div class="chapters-grid">' +
        Object.entries(chapters[activeTab]).map(([paper, chs]) => `
            <div class="paper-section">
                <div class="paper-title">${paper}</div>
                <div class="chapter-list">
                    ${chs.map(ch => `
                        <div class="chapter-item">
                            <div class="ch-checkbox ${ch.done ? 'done' : ''}" onclick="toggleChapter('${activeTab}','${paper}','${ch.id}')" title="Toggle">
                                ${ch.done ? '<i class="ri-check-line scale-in"></i>' : ''}
                            </div>
                            <div class="ch-text">
                                <div class="ch-title ${ch.done ? 'done' : ''}" onclick="toggleChapter('${activeTab}','${paper}','${ch.id}')">${ch.title}</div>
                                ${expandedNotes[ch.id] ? `
                                <div class="ch-note-area">
                                    <textarea placeholder="Add a note…"
                                        onblur="saveNote('${activeTab}','${paper}','${ch.id}',this.value)"
                                    >${ch.note || ''}</textarea>
                                </div>` : ''}
                            </div>
                            <div class="ch-note-btn ${ch.note ? 'active' : ''}" title="Note" onclick="toggleNote('${ch.id}')">
                                <i class="ri-file-text-line"></i>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`).join('') + '</div>';
}

function toggleChapter(sub, paper, id) {
    chapters[sub][paper] = chapters[sub][paper].map(ch => ch.id === id ? { ...ch, done: !ch.done } : ch);
    updateBars();
    renderChapters();
    renderSubjectList();
    scheduleSave();
}

function toggleNote(id) { expandedNotes[id] = !expandedNotes[id]; renderChapters(); }

function saveNote(sub, paper, id, note) {
    chapters[sub][paper] = chapters[sub][paper].map(ch => ch.id === id ? { ...ch, note } : ch);
    scheduleSave();
}

function updateBars() {
    const s = _settings || {};
    const t = calcTime(s.startDate, s.endDate);
    const p = calcSyllabus();
    const $ = id => document.getElementById(id);
    if ($('timePct'))  $('timePct').textContent  = t.pct + '%';
    if ($('timeFill')) $('timeFill').style.width  = t.pct + '%';
    if ($('sylPct'))   $('sylPct').textContent   = p.pct + '%';
    if ($('sylFill'))  $('sylFill').style.width   = p.pct + '%';
}

/* ---- Sync ---- */
let _saveTimer = null;
function scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(silentSync, 2000);
}

async function silentSync() {
    if (!DB.cloudReady() || isSaving) return;
    isSaving = true;
    setSyncState('syncing');
    try {
        await DB.push(chapters, _settings || {}, enabledSubjects);
        lastSyncTime = new Date().toISOString();
        setSyncState('success');
        setTimeout(() => setSyncState('idle'), 2500);
    } catch (e) {
        setSyncState('error');
        setTimeout(() => setSyncState('idle'), 3000);
    } finally { isSaving = false; }
}

async function manualSync() {
    if (!DB.cloudReady()) { showToast('Not connected', 'error'); return; }
    setSyncState('syncing');
    try {
        await DB.push(chapters, _settings || {}, enabledSubjects);
        lastSyncTime = new Date().toISOString();
        setSyncState('success');
        showToast('Saved to cloud ✓', 'success');
        setTimeout(() => setSyncState('idle'), 2500);
    } catch (e) {
        setSyncState('error');
        showToast('Save failed: ' + e.message, 'error');
        setTimeout(() => setSyncState('idle'), 3000);
    }
}

function setSyncState(state) {
    syncState = state;
    const dot   = document.getElementById('syncDot');
    const label = document.getElementById('syncLabel');
    if (dot)   dot.className   = 'sync-dot ' + state;
    if (label) label.textContent = syncLabel();
}

/* ---- Export ---- */
function exportCSV() {
    const rows = ['Subject,Paper,Chapter,Done,Included in %,Note'];
    Object.entries(chapters).forEach(([sub, papers]) => {
        const inc = enabledSubjects[sub] !== false ? 'Yes' : 'No';
        Object.entries(papers).forEach(([paper, chs]) => {
            chs.forEach(ch => {
                rows.push(`"${sub}","${paper}","${ch.title.replace(/"/g, '""')}",${ch.done ? 'Yes' : 'No'},${inc},"${(ch.note || '').replace(/"/g, '""')}"`);
            });
        });
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    a.download = 'study-progress.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('CSV exported', 'success');
}

/* ---- Confirm modal ---- */
function openConfirm(action, msg) {
    pendingAction = action;
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmOkBtn').onclick   = execAction;
    document.getElementById('confirmModal').classList.remove('hidden');
}
function closeConfirm() {
    pendingAction = null;
    document.getElementById('confirmModal').classList.add('hidden');
}
async function execAction() {
    if (pendingAction === 'resetAll') await resetAll();
    if (pendingAction === 'logout')   DB.logout();
    closeConfirm();
}

async function resetAll() {
    try {
        const f = await DB.loadSyllabus((_settings || {}).syllabus || 'syllabus-bangladesh-hsc.json');
        chapters        = f;
        enabledSubjects = defaultEnabled(chapters);
        updateBars();
        renderChapters();
        renderSubjectList();
        scheduleSave();
        showToast('All progress reset', 'success');
        closeSyllabus();
    } catch (e) { showToast('Reset failed: ' + e.message, 'error'); }
}

function triggerLogout() { openConfirm('logout', 'Sign out? Your progress is safely saved in the cloud.'); }

/* ---- Toast ---- */
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    const ic = document.getElementById('toastIcon');
    const tx = document.getElementById('toastMsg');
    el.className  = 'toast ' + type;
    ic.className  = type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    tx.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

/* ---- Keyboard ---- */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeConfirm(); closeSyllabus(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); manualSync(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); exportCSV(); }
});
document.getElementById('syllabusModal').addEventListener('click', e => {
    if (e.target === document.getElementById('syllabusModal')) closeSyllabus();
});
document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target === document.getElementById('confirmModal')) closeConfirm();
});

boot();
