/* =============================================
   Setup Wizard — Auth-first flow
   Step 1: Sign in / Sign up (+ OTP)
   Step 2: Curriculum  (only if new user / missing)
   Step 3: Study Period (only if missing)
   Returning users with full data → straight to app
   ============================================= */

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

/* ---- Magic-link / email-confirm callback ---- */
(async function checkAuth() {
    DB.initCloud();
    // detectSessionInUrl:true means the SDK exchanges any URL token automatically.
    const session = await DB.handleEmailCallback();
    if (session) {
        // Came back from a magic-link click — session is now live.
        const data = await DB.pull().catch(() => null);
        if (data && data.settings && data.settings.syllabus && data.settings.startDate && data.settings.endDate) {
            window.location.replace('index.html');
        } else {
            // New user via magic link — run setup steps 2 & 3
            goStep(2);
        }
        return;
    }
    // Already logged in from a previous session?
    const ok = await DB.isLoggedIn();
    if (ok) {
        const data = await DB.pull().catch(() => null);
        if (data && data.settings && data.settings.syllabus && data.settings.startDate && data.settings.endDate) {
            window.location.replace('index.html');
        } else {
            goStep(2);
        }
    }
})();

/* ---- Step navigation ---- */
let currentStep = 1;

function goStep(n) {
    document.querySelectorAll('.setup-step').forEach(el => el.classList.remove('active'));
    const el = document.getElementById('step' + n);
    if (el) el.classList.add('active');
    document.querySelectorAll('.brand-step').forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove('active', 'completed');
        if (s < n) el.classList.add('completed');
        else if (s === n) el.classList.add('active');
    });
    currentStep = n;
    if (n === 3) initDateDropdowns();
}

/* ---- Curriculum ---- */
document.querySelectorAll('.curriculum-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.curriculum-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        card.querySelector('input').checked = true;
    });
});

/* ---- Date dropdowns (native selects, spelled-out months) ---- */
function makeDateDropdowns(containerId, defaults) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const prefix = containerId; // unique id prefix

    const daySel   = document.createElement('select');
    const monthSel = document.createElement('select');
    const yearSel  = document.createElement('select');

    daySel.className   = 'form-input date-sel date-sel-day';
    monthSel.className = 'form-input date-sel date-sel-month';
    yearSel.className  = 'form-input date-sel date-sel-year';

    daySel.id   = prefix + '_day';
    monthSel.id = prefix + '_month';
    yearSel.id  = prefix + '_year';

    // Days
    daySel.innerHTML = '<option value="">Day</option>' +
        Array.from({length:31},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('');

    // Months
    monthSel.innerHTML = '<option value="">Month</option>' +
        MONTHS.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');

    // Years: current year -2 to +5
    const now = new Date();
    const y0  = now.getFullYear() - 2;
    const y1  = now.getFullYear() + 5;
    yearSel.innerHTML = '<option value="">Year</option>' +
        Array.from({length: y1-y0+1},(_,i)=>`<option value="${y0+i}">${y0+i}</option>`).join('');

    // Set defaults
    if (defaults) {
        const d = new Date(defaults);
        if (!isNaN(d)) {
            daySel.value   = d.getDate();
            monthSel.value = d.getMonth() + 1;
            yearSel.value  = d.getFullYear();
        }
    }

    const onChange = () => updateDatePreview();
    daySel.addEventListener('change',   onChange);
    monthSel.addEventListener('change', onChange);
    yearSel.addEventListener('change',  onChange);

    container.innerHTML = '';
    container.appendChild(daySel);
    container.appendChild(monthSel);
    container.appendChild(yearSel);
}

function getDateFromDropdowns(containerId) {
    const prefix = containerId;
    const day   = document.getElementById(prefix + '_day')?.value;
    const month = document.getElementById(prefix + '_month')?.value;
    const year  = document.getElementById(prefix + '_year')?.value;
    if (!day || !month || !year) return null;
    const d = new Date(+year, +month - 1, +day);
    if (isNaN(d)) return null;
    return d.toISOString().split('T')[0];
}

function initDateDropdowns() {
    const now  = new Date();
    const exam = new Date(); exam.setFullYear(exam.getFullYear() + 1);
    makeDateDropdowns('startDateDropdowns', now.toISOString().split('T')[0]);
    makeDateDropdowns('endDateDropdowns',   exam.toISOString().split('T')[0]);
    updateDatePreview();
}

function updateDatePreview() {
    const s = getDateFromDropdowns('startDateDropdowns');
    const e = getDateFromDropdowns('endDateDropdowns');
    if (!s || !e) return;
    const start = new Date(s), end = new Date(e), now = new Date();
    if (start >= end) return;
    const total   = Math.ceil((end - start) / 86400000);
    const elapsed = Math.max(0, Math.ceil((now - start) / 86400000));
    const left    = Math.max(0, total - elapsed);
    document.getElementById('previewDays').textContent    = total;
    document.getElementById('previewElapsed').textContent = elapsed;
    document.getElementById('previewLeft').textContent    = left;
    document.getElementById('datePreview').classList.remove('hidden');
}

/* ---- Step 1: Auth ---- */
let _authMode     = 'login';
let _pendingEmail = '';
let _resendTimer  = null;

function setAuthMode(mode) {
    _authMode = mode;
    document.querySelectorAll('.auth-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.mode === mode)
    );
    document.getElementById('authCredFields').classList.toggle('hidden', mode === 'otp');
    document.getElementById('authOtpPanel').classList.toggle('hidden', mode !== 'otp');
    const isSignup = mode === 'signup';
    document.getElementById('authUsernameGroup').classList.toggle('hidden', !isSignup);
    document.getElementById('authPasswordConfirmGroup').classList.toggle('hidden', !isSignup);
    const btn = document.getElementById('authSubmitBtn');
    if (mode === 'login')  { btn.innerHTML = '<i class="ri-login-circle-line"></i> Sign in';       btn.dataset.mode = 'login'; }
    if (mode === 'signup') { btn.innerHTML = '<i class="ri-user-add-line"></i> Create account';    btn.dataset.mode = 'signup'; }
}

async function submitAuth() {
    const cfg = DB._cfg();
    if (!cfg.url || !cfg.key) {
        toast('This app is not configured. Contact the developer.', 'error');
        return;
    }

    const btn      = document.getElementById('authSubmitBtn');
    const mode     = btn.dataset.mode;
    const email    = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;

    if (!email || !email.includes('@')) { toast('Enter a valid email address', 'error'); return; }
    if (!password || password.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }

    if (mode === 'signup') {
        const username = document.getElementById('authUsername').value.trim();
        const confirm  = document.getElementById('authPasswordConfirm').value;
        if (!username) { toast('Enter a username', 'error'); return; }
        if (!/^[a-z0-9_]{3,20}$/.test(username)) {
            toast('Username: 3–20 chars, lowercase letters, numbers, underscores only', 'error'); return;
        }
        if (password !== confirm) { toast('Passwords do not match', 'error'); return; }

        setBtnLoading(btn, 'Creating account…');
        try {
            await DB.signUp(email, password, username);
            _pendingEmail = email;
            toast('Check your inbox for a verification code!', 'success');
            showOtpPanel(email);
        } catch (e) {
            toast(friendlyError(e.message), 'error');
            setBtnReady(btn, mode);
        }
        return;
    }

    // Login
    setBtnLoading(btn, 'Signing in…');
    try {
        await DB.signIn(email, password);
        _pendingEmail = email;
        toast('Signed in! Loading your account…', 'success');
        await afterLogin();
    } catch (e) {
        // Unverified account: re-enter OTP flow
        if (e.message && e.message.includes('Email not confirmed')) {
            _pendingEmail = email;
            try { await DB.resendOtp(email); } catch (_) {}
            toast("Your email isn't verified yet — we sent a new code to your inbox.", 'success');
            showOtpPanel(email);
        } else {
            toast(friendlyError(e.message), 'error');
            setBtnReady(btn, mode);
        }
    }
}

/* After successful login/OTP — decide where to send the user */
async function afterLogin() {
    const data = await DB.pull().catch(() => null);
    const s    = data?.settings || {};
    if (data && s.syllabus && s.startDate && s.endDate) {
        // Fully configured returning user → straight to dashboard
        window.location.replace('index.html');
    } else {
        // New user or incomplete setup → continue wizard
        goStep(2);
    }
}

function showOtpPanel(email) {
    _authMode = 'otp';
    document.getElementById('authCredFields').classList.add('hidden');
    document.getElementById('authOtpPanel').classList.remove('hidden');
    document.querySelector('.auth-tabs').classList.add('hidden');
    document.getElementById('otpEmailHint').textContent = email;
    document.getElementById('authOtpInput').value = '';
    document.getElementById('authOtpInput').focus();
    startResendTimer();
}

async function verifyOtp() {
    const token = document.getElementById('authOtpInput').value.trim().replace(/\s/g, '');
    if (!token || token.length < 4) { toast('Enter the code from your email', 'error'); return; }

    const btn = document.getElementById('otpVerifyBtn');
    setBtnLoading(btn, 'Verifying…');

    try {
        await DB.verifyOtp(_pendingEmail, token);
        toast('Verified! Setting up your account…', 'success');
        btn.disabled = true;
        await afterLogin();
    } catch (e) {
        toast(friendlyError(e.message), 'error');
        setBtnReady(btn, 'verify');
        document.getElementById('authOtpInput').focus();
    }
}

async function resendOtp() {
    try {
        await DB.resendOtp(_pendingEmail);
        toast('Code resent — check your inbox', 'success');
        startResendTimer();
    } catch (e) {
        toast(friendlyError(e.message), 'error');
    }
}

let _resendSeconds = 0;
function startResendTimer() {
    clearInterval(_resendTimer);
    _resendSeconds = 30;
    const resendBtn = document.getElementById('resendOtpBtn');
    resendBtn.disabled = true;
    resendBtn.textContent = `Resend in ${_resendSeconds}s`;
    _resendTimer = setInterval(() => {
        _resendSeconds--;
        if (_resendSeconds <= 0) {
            clearInterval(_resendTimer);
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend code';
        } else {
            resendBtn.textContent = `Resend in ${_resendSeconds}s`;
        }
    }, 1000);
}

function backFromOtp() {
    clearInterval(_resendTimer);
    _authMode = 'login';
    document.getElementById('authCredFields').classList.remove('hidden');
    document.getElementById('authOtpPanel').classList.add('hidden');
    document.querySelector('.auth-tabs').classList.remove('hidden');
    setAuthMode('login');
}

/* ---- Step 3: Date validation & finish ---- */
function validateDatesAndFinish() {
    const s = getDateFromDropdowns('startDateDropdowns');
    const e = getDateFromDropdowns('endDateDropdowns');
    if (!s) { toast('Please select a start date', 'error'); return; }
    if (!e) { toast('Please select an exam / target date', 'error'); return; }
    if (new Date(s) >= new Date(e)) { toast('Start date must be before exam date', 'error'); return; }
    finishSetup(s, e);
}

async function finishSetup(startDate, endDate) {
    const syllabus = document.querySelector('input[name="syllabus"]:checked')?.value
                  || 'syllabus-bangladesh-hsc.json';

    try {
        const existing = await DB.pull().catch(() => null);
        if (!existing) {
            const chapters = await DB.loadSyllabus(syllabus);
            const enabled  = {};
            Object.keys(chapters).forEach(s => { enabled[s] = true; });
            await DB.push(chapters, { syllabus, startDate, endDate }, enabled);
        } else {
            // Update settings only — keep existing chapter progress
            const s = existing.settings || {};
            await DB.push(existing.chapters || {}, { ...s, syllabus, startDate, endDate }, s.enabledSubjects || {});
        }
        window.location.replace('index.html');
    } catch (e) {
        toast('Setup failed: ' + e.message, 'error');
    }
}

/* ---- Helpers ---- */
function setBtnLoading(btn, label) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${label}`;
}
function setBtnReady(btn, mode) {
    btn.disabled = false;
    if (mode === 'verify') { btn.innerHTML = '<i class="ri-shield-check-line"></i> Verify'; return; }
    if (mode === 'login')  btn.innerHTML = '<i class="ri-login-circle-line"></i> Sign in';
    if (mode === 'signup') btn.innerHTML = '<i class="ri-user-add-line"></i> Create account';
}

function friendlyError(msg) {
    if (!msg) return 'Something went wrong. Try again.';
    if (msg.includes('Invalid login credentials')) return 'Wrong email or password.';
    if (msg.includes('Email not confirmed'))       return 'Your email isn\'t verified. Sign in again to get a new code.';
    if (msg.includes('already registered'))        return 'An account with this email already exists.';
    if (msg.includes('Token has expired'))         return 'Code expired. Request a new one.';
    if (msg.includes('Invalid OTP'))               return 'Incorrect code. Check your email and try again.';
    if (msg.includes('Password should be'))        return 'Password must be at least 6 characters.';
    return msg;
}

function togglePwd(inputId, iconId) {
    const inp  = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (inp.type === 'password') { inp.type = 'text';     icon.className = 'ri-eye-off-line'; }
    else                         { inp.type = 'password'; icon.className = 'ri-eye-line'; }
}

function toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className = 'toast ' + type;
    document.getElementById('toastIcon').className = type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    document.getElementById('toastMsg').textContent = msg;
    clearTimeout(el._t);
    el.classList.remove('hidden');
    el._t = setTimeout(() => el.classList.add('hidden'), 4000);
}

/* ---- Keyboard ---- */
document.getElementById('authOtpInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') verifyOtp();
});
document.getElementById('authPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuth();
});

/* ---- Init ---- */
DB.initCloud();
goStep(1);
setAuthMode('login');
