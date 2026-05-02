/* =============================================
   Setup Wizard
   Step 4 = Sign in / Sign up with:
     - email + password (+ username for sign-up)
     - OTP emailed by Supabase → verify inline
   ============================================= */

/* Redirect if already signed in */
(async function checkAuth() {
    DB.initCloud();
    const ok = await DB.isLoggedIn();
    if (ok) window.location.replace('index.html');
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
    const hint = document.getElementById('dateFormatHint');
    if (hint) hint.textContent = 'e.g. ' + new Date('2024-03-15').toLocaleDateString(navigator.language, { day: '2-digit', month: 'short', year: 'numeric' });
    updateDatePreview();
}

function formatFriendly(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(navigator.language, { day: '2-digit', month: 'short', year: 'numeric' });
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

/* ---- Step 4: Auth ---- */
// Tracks which sub-view is active: 'login' | 'signup' | 'otp'
let _authMode   = 'login';
let _pendingEmail = '';
let _resendTimer  = null;

function setAuthMode(mode) {
    _authMode = mode;

    // Tabs
    document.querySelectorAll('.auth-tab').forEach(t =>
        t.classList.toggle('active', t.dataset.mode === mode)
    );

    // Panels — OTP panel is toggled separately
    document.getElementById('authCredFields').classList.toggle('hidden', mode === 'otp');
    document.getElementById('authOtpPanel').classList.toggle('hidden', mode !== 'otp');

    // Within cred fields: show/hide signup-only fields
    const isSignup = mode === 'signup';
    document.getElementById('authUsernameGroup').classList.toggle('hidden', !isSignup);
    document.getElementById('authPasswordConfirmGroup').classList.toggle('hidden', !isSignup);

    // Submit button label
    const btn = document.getElementById('authSubmitBtn');
    if (mode === 'login')  { btn.innerHTML = '<i class="ri-login-circle-line"></i> Sign in'; btn.dataset.mode = 'login'; }
    if (mode === 'signup') { btn.innerHTML = '<i class="ri-user-add-line"></i> Create account'; btn.dataset.mode = 'signup'; }
}

/* Validate fields and call Supabase Auth */
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
        toast('Check your inbox for a verification code!', 'success');
        showOtpPanel(email);
    } catch (e) {
        toast(friendlyError(e.message), 'error');
        setBtnReady(btn, mode);
    }
}

/* Show OTP verification panel */
function showOtpPanel(email) {
    _authMode = 'otp';
    document.getElementById('authCredFields').classList.add('hidden');
    document.getElementById('authOtpPanel').classList.remove('hidden');
    // hide tabs during otp
    document.querySelector('.auth-tabs').classList.add('hidden');

    document.getElementById('otpEmailHint').textContent = email;
    document.getElementById('authOtpInput').value = '';
    document.getElementById('authOtpInput').focus();
    startResendTimer();
}

/* Verify the OTP */
async function verifyOtp() {
    const token = document.getElementById('authOtpInput').value.trim().replace(/\s/g, '');
    if (!token || token.length < 4) { toast('Enter the code from your email', 'error'); return; }

    const btn = document.getElementById('otpVerifyBtn');
    setBtnLoading(btn, 'Verifying…');

    try {
        await DB.verifyOtp(_pendingEmail, token);
        toast('Verified! Setting up your account…', 'success');
        btn.disabled = true;
        await finishSetup();
    } catch (e) {
        toast(friendlyError(e.message), 'error');
        setBtnReady(btn, 'verify');
        document.getElementById('authOtpInput').focus();
    }
}

/* Resend OTP */
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

/* After OTP verified — seed initial data for new users */
async function finishSetup() {
    const syllabus  = document.querySelector('input[name="syllabus"]:checked')?.value || 'syllabus-bangladesh-hsc.json';
    const startDate = document.getElementById('startDate').value;
    const endDate   = document.getElementById('endDate').value;

    try {
        const existing = await DB.pull();
        if (!existing) {
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

/* Go back from OTP panel to credentials */
function backFromOtp() {
    clearInterval(_resendTimer);
    _authMode = 'login';
    document.getElementById('authCredFields').classList.remove('hidden');
    document.getElementById('authOtpPanel').classList.add('hidden');
    document.querySelector('.auth-tabs').classList.remove('hidden');
    setAuthMode('login');
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
    if (msg.includes('Email not confirmed'))       return 'Please verify your email first.';
    if (msg.includes('already registered'))        return 'An account with this email already exists.';
    if (msg.includes('Token has expired'))         return 'Code expired. Request a new one.';
    if (msg.includes('Invalid OTP'))               return 'Incorrect code. Check your email and try again.';
    if (msg.includes('Password should be'))        return 'Password must be at least 6 characters.';
    return msg;
}

/* Enter key on OTP field */
document.getElementById('authOtpInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') verifyOtp();
});

/* Password field enter → submit */
document.getElementById('authPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuth();
});


/* ---- Toggle password visibility ---- */
function togglePwd(inputId, iconId) {
    const inp  = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (inp.type === 'password') { inp.type = 'text';     icon.className = 'ri-eye-off-line'; }
    else                         { inp.type = 'password'; icon.className = 'ri-eye-line'; }
}

/* ---- Toast ---- */
function toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.className = 'toast ' + type;
    document.getElementById('toastIcon').className = type === 'success' ? 'ri-check-line' : 'ri-error-warning-line';
    document.getElementById('toastMsg').textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.add('hidden'), 4000);
}

/* ---- Init ---- */
DB.initCloud();
setDefaultDates();
goStep(1);
setAuthMode('login');
