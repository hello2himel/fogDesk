/* =============================================
   Setup Wizard
   Step 4 = account login / sign-up (email only).
   No cloud tech branding visible to the user.
   ============================================= */

if (DB.isLoggedIn()) window.location.replace('index.html');

/* ---- Step navigation ---- */
let currentStep = 1;

function goStep(n) {
    document.querySelectorAll('.setup-step').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('step' + n);
    if (target) target.classList.add('active');
    document.querySelectorAll('.brand-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (s < n) el.classList.add('completed');
        else if (s === n) el.classList.add('active');
    });
    currentStep = n;
}

/* ---- Curriculum ---- */
document.querySelectorAll('.curriculum-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.curriculum-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        card.querySelector('input').checked = true;
    });
});

/* ---- Date step ---- */
function setDefaultDates() {
    const start = new Date();
    const end   = new Date();
    end.setFullYear(end.getFullYear() + 1);

    document.getElementById('startDate').value = start.toISOString().split('T')[0];
    document.getElementById('endDate').value   = end.toISOString().split('T')[0];

    // Show locale-aware format hint
    const hint = document.getElementById('dateFormatHint');
    if (hint) {
        const sample = new Date('2024-03-15');
        hint.textContent = 'e.g. ' + sample.toLocaleDateString(navigator.language, {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    }

    updateDatePreview();
}

function formatFriendly(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(navigator.language, {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

function updateDatePreview() {
    const s = document.getElementById('startDate').value;
    const e = document.getElementById('endDate').value;
    if (!s || !e) return;
    const start = new Date(s), end = new Date(e), now = new Date();
    if (start >= end) return;
    const total   = Math.ceil((end - start) / 86400000);
    const elapsed = Math.max(0, Math.ceil((now - start) / 86400000));
    const left    = Math.max(0, total - elapsed);

    document.getElementById('previewDays').textContent    = total;
    document.getElementById('previewElapsed').textContent = elapsed;
    document.getElementById('previewLeft').textContent    = left;

    const sf = document.getElementById('previewStartFmt');
    const ef = document.getElementById('previewEndFmt');
    if (sf) sf.textContent = formatFriendly(s);
    if (ef) ef.textContent = formatFriendly(e);

    document.getElementById('datePreview').classList.remove('hidden');
    const fd = document.getElementById('dateFriendly');
    if (fd) fd.style.display = 'block';
}

document.getElementById('startDate').addEventListener('change', updateDatePreview);
document.getElementById('endDate').addEventListener('change', updateDatePreview);

function validateDatesAndContinue() {
    const s = document.getElementById('startDate').value;
    const e = document.getElementById('endDate').value;
    if (!s || !e) { toast('Please set both dates', 'error'); return; }
    if (new Date(s) >= new Date(e)) { toast('Start date must be before end date', 'error'); return; }
    goStep(4);
}

/* ---- Step 4: Account (login / sign-up) ---- */
function setAuthMode(mode) {
    // mode: 'login' | 'signup'
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    document.getElementById('authLoginFields').classList.toggle('hidden', mode !== 'login');
    document.getElementById('authSignupFields').classList.toggle('hidden', mode !== 'signup');
    document.getElementById('authSubmitBtn').textContent = mode === 'login' ? 'Sign in & Finish' : 'Create account & Finish';
    document.getElementById('authSubmitBtn').dataset.mode = mode;
}

async function submitAuth() {
    const btn  = document.getElementById('authSubmitBtn');
    const mode = btn.dataset.mode || 'login';

    const email = document.getElementById('authEmail').value.trim();
    if (!email || !email.includes('@')) { toast('Enter a valid email address', 'error'); return; }

    // Check app is configured
    const cfg = DB._cfg();
    if (!cfg.url || !cfg.key) {
        toast('This app is not configured yet. Please contact the developer.', 'error');
        return;
    }

    if (mode === 'signup') {
        const name = document.getElementById('authName').value.trim();
        if (!name) { toast('Enter your name', 'error'); return; }
    }

    btn.disabled = true;
    btn.textContent = 'Please wait…';

    try {
        // Init cloud with env credentials
        SB.init(cfg.url, cfg.key);
        await new Promise(r => setTimeout(r, 500)); // allow SDK to load
        SB.init(cfg.url, cfg.key);

        // Verify connectivity (a missing row is fine)
        await SB.ping(email);

        // Save email as session credential
        DB.saveEmail(email);
        SB.setEmail(email);

        toast('All set! Loading your dashboard…', 'success');
        await new Promise(r => setTimeout(r, 700));

        await finishSetup(email);
    } catch (e) {
        toast('Could not connect. Please try again.', 'error');
        btn.disabled = false;
        setAuthMode(mode);
    }
}

async function finishSetup(email) {
    const syllabus   = document.querySelector('input[name="syllabus"]:checked')?.value || 'syllabus-bangladesh-hsc.json';
    const startDate  = document.getElementById('startDate').value;
    const endDate    = document.getElementById('endDate').value;

    try {
        // Check if this user already has data (returning user)
        const existing = await DB.pull();
        if (!existing) {
            // New user — write initial data
            const chapters = await DB.loadSyllabus(syllabus);
            const enabled  = {};
            Object.keys(chapters).forEach(s => { enabled[s] = true; });
            await DB.push(chapters, { syllabus, startDate, endDate }, enabled);
        }
        window.location.replace('index.html');
    } catch (e) {
        toast('Setup failed: ' + e.message, 'error');
    }
}

/* ---- Toast ---- */
function toast(msg, type = 'success') {
    const el   = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const txt  = document.getElementById('toastMsg');
    el.className   = 'toast ' + type;
    icon.className = type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    txt.textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

/* ---- Init ---- */
setDefaultDates();
goStep(1);
setAuthMode('login');
