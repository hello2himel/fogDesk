/* =============================================
   DB — cloud-first data layer
   Auth is fully handled by Supabase Auth.
   Session stored in sessionStorage by the SDK.
   No localStorage anywhere.
   ============================================= */

const DB = (() => {
    function _cfg() { return window.SB_CONFIG || { supa_url: '', supa_key: '' }; }

    /* Init cloud client — call once on every page load */
    function initCloud() {
        const { supa_url, supa_key } = _cfg();
        if (!supa_url || !supa_key) return false;
        // Retry until SDK is loaded (it loads async)
        if (typeof window.supabase === 'undefined') return false;
        return SB.init(supa_url, supa_key);
    }

    async function ensureReady() {
        if (SB.ready()) return true;
        // SDK may still be loading — wait up to 3s
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (initCloud()) return true;
        }
        return false;
    }

    /* ---- Auth ---- */

    async function isLoggedIn() {
        if (!(await ensureReady())) return false;
        return SB.isLoggedIn();
    }

    async function getUser() {
        if (!(await ensureReady())) return null;
        return SB.getUser();
    }

    async function signUp(email, password, username) {
        await ensureReady();
        return SB.signUp(email, password, username);
    }

    async function signIn(email, password) {
        await ensureReady();
        return SB.signIn(email, password);
    }

    async function verifyOtp(email, token) {
        await ensureReady();
        return SB.verifyOtp(email, token);
    }

    async function resendOtp(email) {
        await ensureReady();
        return SB.resendOtp(email);
    }

    async function logout() {
        if (SB.ready()) await SB.signOut();
        sessionStorage.clear();
        window.location.replace('setup.html');
    }

    /* ---- Syllabus loader ---- */
    async function loadSyllabus(filename) {
        const res = await fetch(`config/${filename}`);
        if (!res.ok) throw new Error(`Cannot load ${filename}`);
        return res.json();
    }

    /* ---- Cloud R/W ---- */
    async function pull() {
        if (!(await ensureReady())) throw new Error('Not ready');
        return SB.fetchProgress();
    }

    async function push(chapters, settings, enabledSubjects) {
        if (!(await ensureReady())) throw new Error('Not ready');
        await SB.upsertProgress(chapters, { ...settings, enabledSubjects });
    }

    return { initCloud, ensureReady, isLoggedIn, getUser, signUp, signIn, verifyOtp, resendOtp, logout, loadSyllabus, pull, push, _cfg };
})();
