/* =============================================
   Settings Page
   ============================================= */

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

async function init() {
    DB.initCloud();

    const loggedIn = await DB.isLoggedIn();
    if (!loggedIn) { window.location.replace('setup.html'); return; }

    const user = await DB.getUser();
    if (user) {
        const email    = user.email || '';
        const username = user.user_metadata?.username || '';
        document.getElementById('accountEmail').textContent    = email || '—';
        document.getElementById('accountUsername').textContent = username ? '@' + username : '—';
        const av = document.getElementById('accountAvatar');
        if (av) av.textContent = (username || email || '?')[0].toUpperCase();
    }

    try {
        const data = await DB.pull();
        if (data?.settings) {
            const s = data.settings;
            initDateDropdowns('startDateDropdowns', s.startDate);
            initDateDropdowns('endDateDropdowns',   s.endDate);
            if (s.syllabus) document.getElementById('syllabusSelect').value = s.syllabus;
        } else {
            initDateDropdowns('startDateDropdowns', null);
            initDateDropdowns('endDateDropdowns',   null);
        }
        updateStatus('connected');
    } catch (e) {
        updateStatus('error');
        showToast('Could not load settings: ' + e.message, 'error');
        initDateDropdowns('startDateDropdowns', null);
        initDateDropdowns('endDateDropdowns',   null);
    }
}

/* ---- Native date dropdowns ---- */
function initDateDropdowns(containerId, isoValue) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const daySel   = document.createElement('select');
    const monthSel = document.createElement('select');
    const yearSel  = document.createElement('select');

    daySel.className   = 'form-input date-sel date-sel-day';
    monthSel.className = 'form-input date-sel date-sel-month';
    yearSel.className  = 'form-input date-sel date-sel-year';

    daySel.id   = containerId + '_day';
    monthSel.id = containerId + '_month';
    yearSel.id  = containerId + '_year';

    daySel.innerHTML = '<option value="">Day</option>' +
        Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');

    monthSel.innerHTML = '<option value="">Month</option>' +
        MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');

    const now = new Date();
    const y0  = now.getFullYear() - 3;
    const y1  = now.getFullYear() + 6;
    yearSel.innerHTML = '<option value="">Year</option>' +
        Array.from({length: y1-y0+1},(_,i)=>`<option value="${y0+i}">${y0+i}</option>`).join('');

    if (isoValue) {
        const d = new Date(isoValue);
        if (!isNaN(d)) {
            daySel.value   = d.getDate();
            monthSel.value = d.getMonth() + 1;
            yearSel.value  = d.getFullYear();
        }
    }

    container.innerHTML = '';
    container.appendChild(daySel);
    container.appendChild(monthSel);
    container.appendChild(yearSel);
}

function getDateFromDropdowns(containerId) {
    const day   = document.getElementById(containerId + '_day')?.value;
    const month = document.getElementById(containerId + '_month')?.value;
    const year  = document.getElementById(containerId + '_year')?.value;
    if (!day || !month || !year) return null;
    const d = new Date(+year, +month - 1, +day);
    return isNaN(d) ? null : d.toISOString().split('T')[0];
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
    const start = getDateFromDropdowns('startDateDropdowns');
    const end   = getDateFromDropdowns('endDateDropdowns');
    if (!start) { showToast('Please select a start date', 'error'); return; }
    if (!end)   { showToast('Please select an exam/target date', 'error'); return; }
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
    const confirmed = window.confirm('Changing curriculum resets your chapter list. Your dates are kept. Continue?');
    if (!confirmed) return;
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

/* ---- Danger actions — use native confirm ---- */
async function confirmResetChapters() {
    if (!window.confirm('Reset all chapter progress? This cannot be undone.')) return;
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

async function confirmLogout() {
    if (!window.confirm('Sign out? Your progress stays safely in the cloud.')) return;
    await DB.logout();
}

/* ---- Toast ---- */
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className = 'toast ' + type;
    document.getElementById('toastIcon').className = type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    document.getElementById('toastMsg').textContent = msg;
    clearTimeout(el._t);
    el.classList.remove('hidden');
    el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

init();
