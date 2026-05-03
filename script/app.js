/* =============================================
   Fogdesk — Main App
   Cloud-first. No localStorage.
   Auth via Supabase session (sessionStorage).
   Subject ticks control syllabus % calculation.
   ============================================= */

let chapters        = {};
let enabledSubjects = {};
let activeTab       = '';
let expandedNotes   = {};
let pendingAction   = null;
let syncState       = 'offline';
let lastSyncTime    = null;
let isSaving        = false;
let _settings       = null;
let _user           = null;

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
    DB.initCloud();

    const loggedIn = await DB.isLoggedIn();
    if (!loggedIn) { window.location.replace('setup.html'); return; }

    _user = await DB.getUser();

    setSyncState('syncing');
    try {
        const data = await DB.pull();
        if (data) {
            chapters        = data.chapters || {};
            const s         = data.settings || {};
            enabledSubjects = s.enabledSubjects || defaultEnabled(chapters);
            _settings       = { syllabus: s.syllabus || '', startDate: s.startDate || '', endDate: s.endDate || '' };
        } else {
            // No data yet — redirect to finish setup
            window.location.replace('setup.html');
            return;
        }
        lastSyncTime = new Date().toISOString();
        setSyncState('success');
        setTimeout(() => setSyncState('idle'), 2000);
    } catch (e) {
        // Cloud unavailable — try local cache as fallback
        const cached = DB._cacheRead();
        if (cached) {
            chapters        = cached.chapters || {};
            const s         = cached.settings || {};
            enabledSubjects = s.enabledSubjects || defaultEnabled(chapters);
            _settings       = { syllabus: s.syllabus || '', startDate: s.startDate || '', endDate: s.endDate || '' };
            setSyncState('error');
            showToast('Loaded from local cache — sync when back online.', 'error');
        } else {
            setSyncState('error');
            showToast('Could not load your data. Try refreshing.', 'error');
            _settings = { syllabus: '', startDate: '', endDate: '' };
        }
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

/* ---- Greeting ---- */
function getGreeting(username) {
    const h    = new Date().getHours();
    const name = username ? username : null;
    const tag  = name ? name : 'there';

    // Time-of-day buckets with character
    if (h >= 5  && h < 12) {
        const lines = [
            `Good morning, ${tag}. Ready to own the day?`,
            `Rise and grind, ${tag}. Chapters won't check themselves.`,
            `Morning, ${tag}! Coffee first, chapters second.`,
        ];
        return lines[new Date().getDate() % lines.length];
    }
    if (h >= 12 && h < 17) {
        const lines = [
            `Hey ${tag}. Afternoon slump? Push through.`,
            `Good afternoon, ${tag}. How's the grind going?`,
            `${tag.charAt(0).toUpperCase() + tag.slice(1)}, afternoon check-in. Still on track?`,
        ];
        return lines[new Date().getDate() % lines.length];
    }
    if (h >= 17 && h < 21) {
        const lines = [
            `Evening, ${tag}. Wind down or push on?`,
            `Good evening, ${tag}. A few more chapters?`,
            `Hey ${tag}, evening edition. Let's see those numbers.`,
        ];
        return lines[new Date().getDate() % lines.length];
    }
    // Late night / deep night
    if (h >= 21 || h < 2) {
        const lines = [
            `Late night ${tag}, is it? Moonlit studying counts.`,
            `Still up, ${tag}? Dedication noted.`,
            `Night owl mode, ${tag}. The chapters respect the hustle.`,
        ];
        return lines[new Date().getDate() % lines.length];
    }
    // 2am–5am: the deep hours
    const lines = [
        `${tag.charAt(0).toUpperCase() + tag.slice(1)}… it's past 2am. You okay?`,
        `Deep night, ${tag}. Seriously, sleep is studying too.`,
        `The world is asleep, ${tag}. Just you and the syllabus.`,
    ];
    return lines[new Date().getDate() % lines.length];
}

/* ---- Dashboard ---- */
function renderDashboard() {
    const app  = document.getElementById('app');
    const s    = _settings || {};
    const tP   = calcTime(s.startDate, s.endDate);
    const sP   = calcSyllabus();
    const ins  = insight(tP.pct, sP.pct);
    const username    = _user?.user_metadata?.username || null;
    const greeting    = getGreeting(username);
    const dateRange   = fmtRange(s.startDate, s.endDate);

    app.innerHTML = `
    <div class="app-page fade-in">
      <div class="app-shell">

        <!-- Top bar: sync status + nav -->
        <div class="topbar">
            <div class="sync-indicator">
                <div class="sync-dot ${syncState}" id="syncDot"></div>
                <span id="syncLabel">${syncLabel()}</span>
            </div>
            <div class="topbar-actions">
                <a href="settings.html" class="btn btn-ghost btn-sm">
                    <i class="ri-settings-3-line"></i>
                    <span class="btn-label">Settings</span>
                </a>
                <button class="btn btn-ghost btn-sm topbar-love-btn" onclick="openDonate(true)" title="Support Fogdesk">
                    <i class="ri-heart-line"></i>
                </button>
            </div>
        </div>

        <!-- Greeting -->
        <div class="dash-greeting">
            <p class="greeting-text">${greeting}</p>
            ${dateRange ? `<p class="greeting-range">${dateRange}</p>` : ''}
        </div>

        <!-- Progress cards -->
        <div class="progress-cards">
            <div class="progress-card">
                <div class="progress-card-num" id="timePct">${tP.pct}%</div>
                <div class="progress-bar-track">
                    <div class="progress-bar-fill" id="timeFill" style="width:${tP.pct}%"></div>
                </div>
                <div class="progress-card-label">Time elapsed</div>
                <div class="progress-card-sub">${tP.elapsed} / ${tP.total} days</div>
            </div>
            <div class="progress-card">
                <div class="progress-card-num" id="sylPct">${sP.pct}%</div>
                <div class="progress-bar-track">
                    <div class="progress-bar-fill" id="sylFill" style="width:${sP.pct}%"></div>
                </div>
                <div class="progress-card-label">Syllabus done</div>
                <div class="progress-card-sub">${sP.done} / ${sP.total} chapters
                    ${sP.skipped > 0 ? `<span class="skip-note">(${sP.skipped} skipped)</span>` : ''}
                </div>
            </div>
        </div>

        <!-- Insight -->
        <div class="insight-banner ${ins.type}">
            <i class="${ins.icon}"></i>
            <span>${ins.msg}</span>
        </div>

        <!-- Actions -->
        <div class="action-row">
            <button class="btn btn-primary" onclick="openSyllabus()">
                <i class="ri-edit-line"></i> Edit Progress
            </button>
            <button class="btn btn-ghost" onclick="exportCSV()">
                <i class="ri-download-line"></i> Export
            </button>
            <button class="btn btn-ghost" id="syncBtn" onclick="manualSync()">
                <i class="ri-cloud-line"></i> Sync
            </button>
        </div>

      </div><!-- /.app-shell -->
    </div><!-- /.app-page -->

    <footer class="app-footer">
        Made with ❤️ by <a href="https://github.com/hello2himel" target="_blank">@hello2himel</a> from 🇧🇩
        <span class="footer-sep">·</span>
        Open source.
        <a href="https://github.com/hello2himel/fogdesk" target="_blank">View Source</a>
    </footer>
    `;
}

/* ---- Progress ---- */
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
    if (d >= 5)   return { type: 'ahead',   icon: 'ri-rocket-line',      msg: `You're ${d}% ahead of schedule. Keep it up!` };
    if (d <= -10) return { type: 'behind',  icon: 'ri-alert-line',       msg: `You're ${Math.abs(d)}% behind. Time to push harder.` };
    return              { type: 'ontrack', icon: 'ri-check-double-line', msg: "You're roughly on track. Stay consistent!" };
}

function syncLabel() {
    if (syncState === 'syncing') return 'Saving…';
    if (syncState === 'success') return 'Saved';
    if (syncState === 'error')   return 'Save failed';
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

function renderSubjectList() {
    const container = document.getElementById('subjectList');
    if (!container) return;
    container.innerHTML = Object.keys(chapters).map(sub => {
        const on    = enabledSubjects[sub] !== false;
        const total = Object.values(chapters[sub]).reduce((a, c) => a + c.length, 0);
        const done  = Object.values(chapters[sub]).reduce((a, c) => a + c.filter(x => x.done).length, 0);
        const pct   = total > 0 ? Math.round((done/total)*100) : 0;
        return `
        <button class="subject-pill ${on ? 'enabled' : 'disabled'}" onclick="toggleSubject('${sub}')"
            title="${on ? 'Click to exclude from syllabus %' : 'Click to include in syllabus %'}">
            <span class="pill-check">${on ? '<i class="ri-checkbox-circle-fill"></i>' : '<i class="ri-circle-line"></i>'}</span>
            <span class="pill-name">${sub}</span>
            <span class="pill-stat">${pct}%</span>
        </button>`;
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

function switchTab(sub) { activeTab = sub; renderTabs(); renderChapters(); }

function renderChapters() {
    const grid = document.getElementById('chaptersGrid');
    if (!chapters[activeTab]) {
        grid.innerHTML = '<p style="color:var(--text-3);padding:1rem;">No chapters found.</p>';
        return;
    }
    grid.innerHTML = '<div class="chapters-grid">' +
        Object.entries(chapters[activeTab]).map(([paper, chs]) => `
            <div class="paper-section">
                <div class="paper-title">${paper}</div>
                <div class="chapter-list">
                    ${chs.map(ch => `
                        <div class="chapter-item">
                            <div class="ch-checkbox ${ch.done ? 'done' : ''}"
                                onclick="toggleChapter('${activeTab}','${paper}','${ch.id}')">
                                ${ch.done ? '<i class="ri-check-line scale-in"></i>' : ''}
                            </div>
                            <div class="ch-text">
                                <div class="ch-title ${ch.done ? 'done' : ''}"
                                    onclick="toggleChapter('${activeTab}','${paper}','${ch.id}')">${ch.title}</div>
                                ${expandedNotes[ch.id] ? `
                                <div class="ch-note-area">
                                    <textarea placeholder="Add a note…"
                                        onblur="saveNote('${activeTab}','${paper}','${ch.id}',this.value)"
                                    >${ch.note || ''}</textarea>
                                </div>` : ''}
                            </div>
                            <div class="ch-note-btn ${ch.note ? 'active' : ''}"
                                title="Note" onclick="toggleNote('${ch.id}')">
                                <i class="ri-file-text-line"></i>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`).join('') + '</div>';
}

function toggleChapter(sub, paper, id) {
    chapters[sub][paper] = chapters[sub][paper].map(ch =>
        ch.id === id ? { ...ch, done: !ch.done } : ch
    );
    updateBars();
    renderChapters();
    renderSubjectList();
    scheduleSave();
}

function toggleNote(id) { expandedNotes[id] = !expandedNotes[id]; renderChapters(); }

function saveNote(sub, paper, id, note) {
    chapters[sub][paper] = chapters[sub][paper].map(ch =>
        ch.id === id ? { ...ch, note } : ch
    );
    scheduleSave();
}

function updateBars() {
    const s  = _settings || {};
    const tP = calcTime(s.startDate, s.endDate);
    const sP = calcSyllabus();
    const ins = insight(tP.pct, sP.pct);
    const $   = id => document.getElementById(id);

    if ($('timePct'))  $('timePct').textContent  = tP.pct + '%';
    if ($('timeFill')) $('timeFill').style.width  = tP.pct + '%';
    if ($('sylPct'))   $('sylPct').textContent   = sP.pct + '%';
    if ($('sylFill'))  $('sylFill').style.width   = sP.pct + '%';

    // Refresh insight banner in-place (no full re-render)
    const banner = document.querySelector('.insight-banner');
    if (banner) {
        banner.className = `insight-banner ${ins.type}`;
        banner.innerHTML = `<i class="${ins.icon}"></i><span>${ins.msg}</span>`;
    }
}

/* ---- Sync ---- */
let _saveTimer = null;
function scheduleSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(silentSync, 2000);
}

async function silentSync() {
    if (isSaving) return;
    isSaving = true;
    setSyncState('syncing');
    try {
        await DB.push(chapters, _settings || {}, enabledSubjects);
        // Pull back immediately so local state is always a mirror of cloud
        const fresh = await DB.pull();
        if (fresh) reconcile(fresh);
        lastSyncTime = new Date().toISOString();
        setSyncState('success');
        setTimeout(() => setSyncState('idle'), 2500);
    } catch (e) {
        setSyncState('error');
        setTimeout(() => setSyncState('idle'), 3000);
    } finally { isSaving = false; }
}

async function manualSync() {
    setSyncState('syncing');
    try {
        await DB.push(chapters, _settings || {}, enabledSubjects);
        // Pull back to confirm cloud state and refresh UI
        const fresh = await DB.pull();
        if (fresh) reconcile(fresh);
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

/* ── reconcile: apply fresh cloud data to local state and refresh UI ──
   Called after every successful push→pull cycle.
   Does NOT re-render the whole dashboard (avoids flash/scroll-reset);
   updates bars, syllabus modal panels, and local variables in place. */
function reconcile(data) {
    chapters        = data.chapters || chapters;
    const s         = data.settings || {};
    enabledSubjects = s.enabledSubjects || enabledSubjects;
    _settings       = { syllabus: s.syllabus || _settings?.syllabus || '',
                        startDate: s.startDate || _settings?.startDate || '',
                        endDate:   s.endDate   || _settings?.endDate   || '' };
    // Refresh bars and open modal panels without a full re-render
    updateBars();
    if (!document.getElementById('syllabusModal').classList.contains('hidden')) {
        renderSubjectList();
        renderChapters();
    }
}

function setSyncState(state) {
    syncState = state;
    const dot   = document.getElementById('syncDot');
    const label = document.getElementById('syncLabel');
    if (dot)   dot.className    = 'sync-dot ' + state;
    if (label) label.textContent = syncLabel();
}

/* ---- Export ---- */
function exportCSV() {
    const rows = ['Subject,Paper,Chapter,Done,Included in %,Note'];
    Object.entries(chapters).forEach(([sub, papers]) => {
        const inc = enabledSubjects[sub] !== false ? 'Yes' : 'No';
        Object.entries(papers).forEach(([paper, chs]) => {
            chs.forEach(ch => {
                rows.push(`"${sub}","${paper}","${ch.title.replace(/"/g,'""')}",${ch.done?'Yes':'No'},${inc},"${(ch.note||'').replace(/"/g,'""')}"`);
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

/* ---- Logout / Confirm ---- */
function triggerLogout() { if (window.confirm('Sign out? Your progress stays safely in the cloud.')) DB.logout(); }

function openConfirm(action, msg) {
    if (!window.confirm(msg)) return;
    if (action === 'resetAll') resetAll();
    if (action === 'logout')   DB.logout();
}
// kept for keyboard Escape compat
function closeConfirm() {}

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

/* ---- Toast ---- */
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className = 'toast ' + type;
    document.getElementById('toastIcon').className = type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    document.getElementById('toastMsg').textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

/* ---- Keyboard ---- */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSyllabus(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); manualSync(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); exportCSV(); }
});
document.getElementById('syllabusModal').addEventListener('click', e => {
    if (e.target === document.getElementById('syllabusModal')) closeSyllabus();
});

// boot() is called via patchedBoot() below (with donate tracking)

/* ── Donate system ───────────────────────────────────────────────
   Shows a polite modal once after 7+ days of use.
   Uses localStorage only for the donate-nudge timestamps
   (not for any study data — that lives in Supabase).
   Keys:
     fd_first_visit  — ISO timestamp of first ever visit
     fd_donate_shown — ISO timestamp of last time modal was shown
     fd_donated      — "1" if user clicked the donate link (never nudge again)
   ──────────────────────────────────────────────────────────────── */

const DONATE_URL   = 'https://hello2himel.netlify.app/donate?source=fogdesk';
const DONATE_DAYS  = 7;    // minimum days before first nudge
const DONATE_SNOOZE = 60;  // days before re-showing after "maybe later"

function _donateKey(k) { return 'fd_' + k; }

function _daysSince(isoKey) {
    const raw = localStorage.getItem(_donateKey(isoKey));
    if (!raw) return null;
    return (Date.now() - new Date(raw).getTime()) / 86400000;
}

function initDonateTracking() {
    // Record first visit if not already set
    if (!localStorage.getItem(_donateKey('first_visit'))) {
        localStorage.setItem(_donateKey('first_visit'), new Date().toISOString());
    }
}

function checkDonateNudge() {
    // Never nudge if already donated
    if (localStorage.getItem(_donateKey('donated'))) return;

    const daysSinceFirst = _daysSince('first_visit');
    if (daysSinceFirst === null || daysSinceFirst < DONATE_DAYS) return;

    const daysSinceShown = _daysSince('donate_shown');
    // Show if never shown, or enough time has passed since last snooze
    if (daysSinceShown !== null && daysSinceShown < DONATE_SNOOZE) return;

    // Delay slightly so it doesn't interrupt page load
    setTimeout(() => openDonate(false), 3000);
}

function openDonate(manual = false) {
    document.getElementById('donateBackdrop')?.classList.remove('hidden');
    document.getElementById('donateModal')?.classList.remove('hidden');
    if (!manual) {
        localStorage.setItem(_donateKey('donate_shown'), new Date().toISOString());
    }
}

function closeDonate() {
    document.getElementById('donateBackdrop')?.classList.add('hidden');
    document.getElementById('donateModal')?.classList.add('hidden');
}

function snoozeDonate() {
    localStorage.setItem(_donateKey('donate_shown'), new Date().toISOString());
    closeDonate();
}

// Hook into boot — run tracking after successful load
const _origBoot = boot;
(async function patchedBoot() {
    initDonateTracking();
    await _origBoot();
    checkDonateNudge();
})();
