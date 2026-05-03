/* =============================================
   Settings Page — Fogdesk
   ============================================= */

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

/* ── Bootstrap ──────────────────────────────────────────────── */
async function init() {
    DB.initCloud();

    const loggedIn = await DB.isLoggedIn();
    if (!loggedIn) { window.location.replace('setup.html'); return; }

    const user = await DB.getUser();
    if (user) {
        const email    = user.email || '';
        const username = user.user_metadata?.username || '';
        document.getElementById('accountEmail').textContent    = email || '—';
        document.getElementById('accountUsername').textContent = username ? '@' + username : email || '—';
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

/* ── Account modal ──────────────────────────────────────────── */
function openAccountModal() {
    // Sync identity into modal
    document.getElementById('modalAvatar').textContent = document.getElementById('accountAvatar').textContent;
    document.getElementById('modalName').textContent   = document.getElementById('accountUsername').textContent;
    document.getElementById('modalEmail').textContent  = document.getElementById('accountEmail').textContent;

    document.getElementById('acctOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    showScreen('scr-main');
}

function closeAccountModal() {
    document.getElementById('acctOverlay').classList.add('hidden');
    document.body.style.overflow = '';
    // Reset to main screen cleanly
    showScreen('scr-main');
    // Clear all form inputs
    ['newUsername','newEmail','emailCurrentPwd',
     'currentPwd','newPwd','confirmPwd',
     'deleteConfirmText','deletePwd'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

/* ── Screen navigation inside modal ────────────────────────── */
function showScreen(id) {
    document.querySelectorAll('#acctModal > div').forEach(el => {
        el.classList.add('hidden');
    });
    const target = document.getElementById(id);
    if (target) {
        target.classList.remove('hidden');
        // Focus first input on form screens
        if (id !== 'scr-main') {
            setTimeout(() => target.querySelector('input')?.focus(), 60);
        }
    }
}

/* ── Change username ────────────────────────────────────────── */
async function changeUsername() {
    const raw = document.getElementById('newUsername').value.trim();
    const btn = document.getElementById('changeUsernameBtn');

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(raw)) {
        showToast('3–20 characters: letters, numbers, underscores only', 'error');
        return;
    }

    setBtnLoading(btn, 'Saving…');
    try {
        await DB.changeUsername(raw);
        const display  = '@' + raw;
        const initial  = raw[0].toUpperCase();
        document.getElementById('accountUsername').textContent = display;
        document.getElementById('accountAvatar').textContent   = initial;
        document.getElementById('modalName').textContent       = display;
        document.getElementById('modalAvatar').textContent     = initial;
        document.getElementById('newUsername').value = '';
        showToast('Username updated ✓', 'success');
        showScreen('scr-main');
    } catch (e) {
        showToast(e.message || 'Failed to update username', 'error');
    } finally {
        setBtnReady(btn, '<i class="ri-check-line"></i> Save');
    }
}

/* ── Change email ───────────────────────────────────────────── */
async function changeEmail() {
    const newEmail = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('emailCurrentPwd').value;
    const btn      = document.getElementById('changeEmailBtn');

    if (!newEmail || !newEmail.includes('@')) { showToast('Enter a valid email address', 'error'); return; }
    if (!password)                            { showToast('Enter your current password', 'error'); return; }

    setBtnLoading(btn, 'Sending…');
    try {
        await DB.changeEmail(password, newEmail);
        document.getElementById('newEmail').value        = '';
        document.getElementById('emailCurrentPwd').value = '';
        showToast('Confirmation sent — click the link in your email to finish', 'success');
        showScreen('scr-main');
    } catch (e) {
        showToast(e.message || 'Failed to change email', 'error');
    } finally {
        setBtnReady(btn, '<i class="ri-send-plane-line"></i> Send link');
    }
}

/* ── Change password ────────────────────────────────────────── */
async function changePassword() {
    const current = document.getElementById('currentPwd').value;
    const next    = document.getElementById('newPwd').value;
    const confirm = document.getElementById('confirmPwd').value;
    const btn     = document.getElementById('changePasswordBtn');

    if (!current)         { showToast('Enter your current password', 'error'); return; }
    if (next.length < 6)  { showToast('New password must be at least 6 characters', 'error'); return; }
    if (next !== confirm) { showToast('Passwords do not match', 'error'); return; }
    if (next === current) { showToast('New password must differ from current', 'error'); return; }

    setBtnLoading(btn, 'Updating…');
    try {
        await DB.changePassword(current, next);
        ['currentPwd','newPwd','confirmPwd'].forEach(id => { document.getElementById(id).value = ''; });
        showToast('Password updated ✓', 'success');
        showScreen('scr-main');
    } catch (e) {
        showToast(e.message || 'Failed to update password', 'error');
    } finally {
        setBtnReady(btn, '<i class="ri-check-line"></i> Update');
    }
}

/* ── Delete account ─────────────────────────────────────────── */
async function deleteAccount() {
    const confirmText = document.getElementById('deleteConfirmText').value.trim();
    const password    = document.getElementById('deletePwd').value;
    const btn         = document.getElementById('deleteAccountBtn');

    if (confirmText !== 'DELETE') { showToast('Type DELETE in capitals to confirm', 'error'); return; }
    if (!password)                { showToast('Enter your password to confirm', 'error'); return; }

    setBtnLoading(btn, 'Deleting…');
    try {
        await DB.deleteAccount(password);
        DB._cacheClear();
        window.location.replace('setup.html');
    } catch (e) {
        showToast(e.message || 'Failed to delete account', 'error');
        setBtnReady(btn, '<i class="ri-delete-bin-line"></i> Delete forever');
    }
}

/* ── Password visibility toggle ─────────────────────────────── */
function togglePwd(inputId, iconId) {
    const inp  = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!inp || !icon) return;
    if (inp.type === 'password') { inp.type = 'text';     icon.className = 'ri-eye-off-line'; }
    else                         { inp.type = 'password'; icon.className = 'ri-eye-line'; }
}

/* ── Date dropdowns ─────────────────────────────────────────── */
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
    const y0 = now.getFullYear() - 3, y1 = now.getFullYear() + 6;
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

/* ── Status badge ───────────────────────────────────────────── */
function updateStatus(state) {
    const badge = document.getElementById('statusBadge');
    if (!badge) return;
    const map = {
        connected: ['Connected', 'status-badge online'],
        offline:   ['Offline',   'status-badge offline'],
        error:     ['Error',     'status-badge error'],
    };
    const [text, cls] = map[state] || map.offline;
    badge.textContent = text;
    badge.className   = cls;
}

/* ── Save study period ──────────────────────────────────────── */
async function saveStudyPeriod() {
    const start = getDateFromDropdowns('startDateDropdowns');
    const end   = getDateFromDropdowns('endDateDropdowns');
    if (!start) { showToast('Please select a start date', 'error'); return; }
    if (!end)   { showToast('Please select an exam/target date', 'error'); return; }
    if (new Date(start) >= new Date(end)) { showToast('Start must be before end date', 'error'); return; }
    try {
        const data     = await DB.pull() || {};
        const settings = { ...(data.settings || {}), startDate: start, endDate: end };
        await DB.push(data.chapters || {}, settings, data.settings?.enabledSubjects || {});
        showToast('Dates saved ✓', 'success');
    } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
}

/* ── Change curriculum ──────────────────────────────────────── */
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

/* ── Export CSV ─────────────────────────────────────────────── */
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
        a.download = 'fogdesk-progress.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('CSV exported', 'success');
    } catch (e) { showToast('Export failed: ' + e.message, 'error'); }
}

/* ── Reset chapters ─────────────────────────────────────────── */
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

/* ── Sign out ───────────────────────────────────────────────── */
async function confirmLogout() {
    if (!window.confirm('Sign out? Your progress stays safely in the cloud.')) return;
    await DB.logout();
}

/* ── Button helpers ─────────────────────────────────────────── */
function setBtnLoading(btn, label) {
    btn.disabled  = true;
    btn.innerHTML = `<span class="spinner"></span> ${label}`;
}
function setBtnReady(btn, html) {
    btn.disabled  = false;
    btn.innerHTML = html;
}

/* ── Toast ──────────────────────────────────────────────────── */
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className = 'toast ' + type;
    document.getElementById('toastIcon').className =
        type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    document.getElementById('toastMsg').textContent = msg;
    clearTimeout(el._t);
    el.classList.remove('hidden');
    el._t = setTimeout(() => el.classList.add('hidden'), 4500);
}

/* ── Keyboard handling ──────────────────────────────────────── */
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const overlay = document.getElementById('acctOverlay');
    if (overlay.classList.contains('hidden')) return;
    // If on a sub-screen, go back; else close the whole modal
    const current = document.querySelector('#acctModal > div:not(.hidden)');
    if (current && current.id !== 'scr-main') {
        showScreen('scr-main');
    } else {
        closeAccountModal();
    }
});

/* ── Click backdrop to close ────────────────────────────────── */
document.getElementById('acctOverlay').addEventListener('click', function(e) {
    if (e.target === this) closeAccountModal();
});

init();
