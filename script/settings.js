/* =============================================
   Settings Page
   ============================================= */

let pendingAction = null;

async function init() {
    if (!DB.isLoggedIn()) { window.location.replace('setup.html'); return; }
    DB.initCloud();

    // Show signed-in email
    const em = DB.getEmail() || '';
    document.getElementById('accountEmail').textContent = em || '—';
    const av = document.getElementById('accountAvatar');
    if (av && em) av.textContent = em[0].toUpperCase();

    // Date format hint
    const hint = document.getElementById('dateFormatHint');
    if (hint) hint.textContent = 'e.g. ' + new Date('2024-03-15').toLocaleDateString(navigator.language, {
        day: '2-digit', month: 'short', year: 'numeric',
    });

    // Load settings from cloud
    if (DB.cloudReady()) {
        try {
            const data = await DB.pull();
            if (data?.settings) {
                const s = data.settings;
                document.getElementById('startDate').value = s.startDate || '';
                document.getElementById('endDate').value   = s.endDate   || '';
                if (s.syllabus) document.getElementById('syllabusSelect').value = s.syllabus;
            }
            updateStatus('connected');
        } catch (e) {
            updateStatus('error');
            showToast('Could not load settings: ' + e.message, 'error');
        }
    } else {
        updateStatus('offline');
    }
}

function updateStatus(state) {
    const badge = document.getElementById('statusBadge');
    if (!badge) return;
    const map = {
        connected: ['Connected', 'sync-badge online'],
        offline:   ['Offline',   'sync-badge offline'],
        error:     ['Error',     'sync-badge error'],
    };
    const [text, cls] = map[state] || map.offline;
    badge.textContent = text;
    badge.className   = cls;
}

/* ---- Study Period ---- */
async function saveStudyPeriod() {
    const start = document.getElementById('startDate').value;
    const end   = document.getElementById('endDate').value;
    if (!start || !end) { showToast('Set both dates', 'error'); return; }
    if (new Date(start) >= new Date(end)) { showToast('Start must be before end', 'error'); return; }
    try {
        const data     = await DB.pull() || {};
        const settings = { ...(data.settings || {}), startDate: start, endDate: end };
        await DB.push(data.chapters || {}, settings, settings.enabledSubjects || {});
        showToast('Dates saved ✓', 'success');
    } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
}

/* ---- Curriculum ---- */
async function changeCurriculum() {
    const val = document.getElementById('syllabusSelect').value;
    if (!confirm('Changing curriculum resets your chapter list. Current progress will be replaced. Continue?')) return;
    try {
        const chapters = await DB.loadSyllabus(val);
        const data     = await DB.pull() || {};
        const settings = { ...(data.settings || {}), syllabus: val };
        const enabled  = {};
        Object.keys(chapters).forEach(s => { enabled[s] = true; });
        await DB.push(chapters, settings, enabled);
        showToast('Curriculum updated ✓', 'success');
    } catch (e) { showToast('Failed: ' + e.message, 'error'); }
}

/* ---- Export ---- */
async function exportCSV() {
    try {
        const data     = await DB.pull();
        const chapters = data?.chapters || {};
        const enabled  = data?.settings?.enabledSubjects || {};
        const rows = ['Subject,Paper,Chapter,Done,Included in %,Note'];
        Object.entries(chapters).forEach(([sub, papers]) => {
            const inc = enabled[sub] !== false ? 'Yes' : 'No';
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
    } catch (e) { showToast('Export failed: ' + e.message, 'error'); }
}

/* ---- Danger zone ---- */
function openDanger(action, msg) {
    pendingAction = action;
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmOkBtn').onclick   = execAction;
    document.getElementById('confirmModal').classList.remove('hidden');
}
function closeConfirm() {
    pendingAction = null;
    document.getElementById('confirmModal').classList.add('hidden');
}
function execAction() {
    if (pendingAction === 'resetChapters') resetChapters();
    if (pendingAction === 'logout')        DB.logout();
    closeConfirm();
}

async function resetChapters() {
    try {
        const data     = await DB.pull() || {};
        const settings = data.settings || {};
        const chapters = await DB.loadSyllabus(settings.syllabus || 'syllabus-bangladesh-hsc.json');
        const enabled  = {};
        Object.keys(chapters).forEach(s => { enabled[s] = true; });
        await DB.push(chapters, settings, enabled);
        showToast('Progress reset ✓', 'success');
    } catch (e) { showToast('Failed: ' + e.message, 'error'); }
}

/* ---- Toast ---- */
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className   = 'toast ' + type;
    document.getElementById('toastIcon').className = type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    document.getElementById('toastMsg').textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeConfirm(); });
document.getElementById('confirmModal').addEventListener('click', e => {
    if (e.target === document.getElementById('confirmModal')) closeConfirm();
});

init();
