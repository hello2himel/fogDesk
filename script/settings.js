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

/* ── Inline form toggle ──────────────────────────────────────── */
function toggleForm(id) {
    const form   = document.getElementById(id);
    const toggle = form.previousElementSibling; // the button
    const isOpen = !form.hidden;

    // Close all forms first
    document.querySelectorAll('.inline-form').forEach(f => {
        f.hidden = true;
        const t = f.previousElementSibling;
        if (t) { t.setAttribute('aria-expanded', 'false'); t.classList.remove('open'); }
    });

    // Open the clicked one (unless it was already open)
    if (!isOpen) {
        form.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        toggle.classList.add('open');
        // Focus first input inside
        setTimeout(() => form.querySelector('input')?.focus(), 60);
    }
}

/* ── Change username ──────────────────────────────────────────── */
async function changeUsername() {
    const raw = document.getElementById('newUsername').value.trim();
    const btn = document.getElementById('changeUsernameBtn');

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(raw)) {
        showToast('Username must be 3–20 characters: letters, numbers, underscores', 'error');
        return;
    }

    setBtnLoading(btn, 'Saving…');
    try {
        await DB.changeUsername(raw);
        // Update the UI immediately
        const display = '@' + raw;
        document.getElementById('accountUsername').textContent = display;
        const av = document.getElementById('accountAvatar');
        if (av) av.textContent = raw[0].toUpperCase();
        showToast('Username updated ✓', 'success');
        toggleForm('changeUsernameForm');
        document.getElementById('newUsername').value = '';
    } catch (e) {
        showToast(e.message || 'Failed to update username', 'error');
    } finally {
        setBtnReady(btn, '<i class="ri-check-line"></i> Save username');
    }
}

/* ── Change email ─────────────────────────────────────────────── */
async function changeEmail() {
    const newEmail  = document.getElementById('newEmail').value.trim();
    const password  = document.getElementById('emailCurrentPwd').value;
    const btn       = document.getElementById('changeEmailBtn');

    if (!newEmail || !newEmail.includes('@')) { showToast('Enter a valid email address', 'error'); return; }
    if (!password) { showToast('Enter your current password', 'error'); return; }

    setBtnLoading(btn, 'Sending…');
    try {
        await DB.changeEmail(password, newEmail);
        showToast('Confirmation sent to ' + newEmail + ' — click the link to finish.', 'success');
        toggleForm('changeEmailForm'); // close panel
        document.getElementById('newEmail').value        = '';
        document.getElementById('emailCurrentPwd').value = '';
    } catch (e) {
        showToast(e.message || 'Failed to change email', 'error');
    } finally {
        setBtnReady(btn, '<i class="ri-send-plane-line"></i> Send confirmation');
    }
}

/* ── Change password ──────────────────────────────────────────── */
async function changePassword() {
    const current  = document.getElementById('currentPwd').value;
    const next     = document.getElementById('newPwd').value;
    const confirm  = document.getElementById('confirmPwd').value;
    const btn      = document.getElementById('changePasswordBtn');

    if (!current)          { showToast('Enter your current password', 'error'); return; }
    if (next.length < 6)   { showToast('New password must be at least 6 characters', 'error'); return; }
    if (next !== confirm)  { showToast('Passwords do not match', 'error'); return; }
    if (next === current)  { showToast('New password must differ from current', 'error'); return; }

    setBtnLoading(btn, 'Updating…');
    try {
        await DB.changePassword(current, next);
        showToast('Password updated ✓', 'success');
        toggleForm('changePasswordForm');
        ['currentPwd','newPwd','confirmPwd'].forEach(id => document.getElementById(id).value = '');
    } catch (e) {
        showToast(e.message || 'Failed to update password', 'error');
    } finally {
        setBtnReady(btn, '<i class="ri-check-line"></i> Update password');
    }
}

/* ── Delete account ───────────────────────────────────────────── */
async function deleteAccount() {
    const confirmText = document.getElementById('deleteConfirmText').value.trim();
    const password    = document.getElementById('deletePwd').value;
    const btn         = document.getElementById('deleteAccountBtn');

    if (confirmText !== 'DELETE') { showToast('Type DELETE in capitals to confirm', 'error'); return; }
    if (!password)                { showToast('Enter your password to confirm', 'error'); return; }

    setBtnLoading(btn, 'Deleting…');
    try {
        await DB.deleteAccount(password);
        // deleteAccount signs out internally; redirect to setup
        DB._cacheClear();
        window.location.replace('setup.html');
    } catch (e) {
        showToast(e.message || 'Failed to delete account', 'error');
        setBtnReady(btn, '<i class="ri-delete-bin-line"></i> Permanently delete');
    }
}

/* ── Password visibility toggle ──────────────────────────────── */
function togglePwd(inputId, iconId) {
    const inp  = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!inp || !icon) return;
    if (inp.type === 'password') { inp.type = 'text';     icon.className = 'ri-eye-off-line'; }
    else                         { inp.type = 'password'; icon.className = 'ri-eye-line'; }
}

/* ── Native date dropdowns ───────────────────────────────────── */
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
    const y0  = now.getFullYear() - 3, y1 = now.getFullYear() + 6;
    yearSel.innerHTML = '<option value="">Year</option>' +
        Array.from({length: y1-y0+1},(_,i)=>`<option value="${y0+i}">${y0+i}</option>`).join('');

    if (isoValue) {
        const d = new Date(isoValue);
        if (!isNaN(d)) {
            daySel.value = d.getDate(); monthSel.value = d.getMonth() + 1; yearSel.value = d.getFullYear();
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

/* ── Status badge ────────────────────────────────────────────── */
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

/* ── Study Period ────────────────────────────────────────────── */
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

/* ── Curriculum ──────────────────────────────────────────────── */
async function changeCurriculum() {
    const val = document.getElementById('syllabusSelect').value;
    if (!window.confirm('Changing curriculum resets your chapter list. Your dates are kept. Continue?')) return;
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

/* ── Export ──────────────────────────────────────────────────── */
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

/* ── Danger actions ──────────────────────────────────────────── */
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

/* ── Helpers ─────────────────────────────────────────────────── */
function setBtnLoading(btn, label) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${label}`;
}
function setBtnReady(btn, html) {
    btn.disabled = false;
    btn.innerHTML = html;
}

function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className = 'toast ' + type;
    document.getElementById('toastIcon').className = type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    document.getElementById('toastMsg').textContent = msg;
    clearTimeout(el._t);
    el.classList.remove('hidden');
    el._t = setTimeout(() => el.classList.add('hidden'), 4500);
}

/* ── Close open forms on Escape ──────────────────────────────── */
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.inline-form').forEach(f => {
        if (!f.hidden) toggleForm(f.id);
    });
});

init();
