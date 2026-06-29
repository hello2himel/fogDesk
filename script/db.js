/* =============================================
   DB — cloud-first data layer
   Auth is fully handled by Supabase Auth.
   Session stored in sessionStorage by the SDK.
   
   Local cache: localStorage under key 'sb_cache'
   - Written after every successful cloud push/pull
   - Read as fallback ONLY when cloud is unavailable
   - Cloud always overwrites local on pull
   ============================================= */

const CACHE_KEY = 'sb_progress_cache';

const DB = (() => {
    function _cfg() { return window.SB_CONFIG || { url: '', key: '' }; }

    /* Init cloud client — call once on every page load */
    function initCloud() {
        const { url, key } = _cfg();
        if (!url || !key) return false;
        if (typeof window.supabase === 'undefined') return false;
        return SB.init(url, key);
    }

    async function ensureReady() {
        if (SB.ready()) return true;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 100));
            if (initCloud()) return true;
        }
        return false;
    }

    /* ---- Local cache helpers ---- */
    function _cacheWrite(data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        } catch (_) { /* storage full or unavailable — ignore */ }
    }

    function _cacheRead() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            return JSON.parse(raw).data || null;
        } catch (_) { return null; }
    }

    function _cacheClear() {
        try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
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

    async function handleEmailCallback() {
        await ensureReady();
        return SB.handleEmailCallback();
    }

    async function changeUsername(newUsername) {
        await ensureReady();
        return SB.changeUsername(newUsername);
    }

    async function changeEmail(currentPassword, newEmail) {
        await ensureReady();
        return SB.changeEmail(currentPassword, newEmail);
    }

    async function changePassword(currentPassword, newPassword) {
        await ensureReady();
        return SB.changePassword(currentPassword, newPassword);
    }

    async function deleteAccount(currentPassword) {
        await ensureReady();
        return SB.deleteAccount(currentPassword);
    }

    async function logout() {
        if (SB.ready()) await SB.signOut();
        sessionStorage.clear();
        _cacheClear();
        window.location.replace('setup.html');
    }

    /* ---- Syllabus loader ---- */
    async function loadSyllabus(filename) {
        const res = await fetch(`config/${filename}`);
        if (!res.ok) throw new Error(`Cannot load ${filename}`);
        return res.json();
    }

    /* ---- Cloud R/W with local cache ---- */

    async function pull() {
        if (!(await ensureReady())) {
            // Offline — return local cache as fallback
            const cached = _cacheRead();
            if (cached) return cached;
            throw new Error('Not ready');
        }
        try {
            const data = await SB.fetchProgress();
            if (data) {
                // Cloud data always wins — overwrite local cache, but keep
                // any cached revisionPlans (a separate domain) intact.
                const existing = _cacheRead() || {};
                _cacheWrite({ ...data, revisionPlans: existing.revisionPlans });
            }
            return data;
        } catch (e) {
            // Cloud failed — try local cache as fallback
            const cached = _cacheRead();
            if (cached) return cached;
            throw e;
        }
    }

    async function push(chapters, settings, enabledSubjects) {
        if (!(await ensureReady())) throw new Error('Not ready');
        await SB.upsertProgress(chapters, { ...settings, enabledSubjects });
        // Mirror to local cache after successful push, keeping revisionPlans intact
        const existing = _cacheRead() || {};
        _cacheWrite({ chapters, settings: { ...settings, enabledSubjects }, revisionPlans: existing.revisionPlans });
    }

    /* ---- Final Revision Planner ---- */

    async function loadRevisionConfig(filename) {
        const res = await fetch(`config/revision/${filename}`);
        if (!res.ok) throw new Error(`Cannot load ${filename}`);
        return res.json();
    }

    async function loadRevisionRegistry() {
        const res = await fetch(`config/revision/registry.json`);
        if (!res.ok) throw new Error('Cannot load revision registry');
        return res.json();
    }

    async function pullAllRevisionPlans() {
        if (!(await ensureReady())) {
            const cached = _cacheRead();
            return (cached && cached.revisionPlans) || [];
        }
        try {
            const rows = await SB.fetchAllRevisionPlans();
            const cached = _cacheRead() || {};
            _cacheWrite({ ...cached, revisionPlans: rows });
            return rows;
        } catch (e) {
            const cached = _cacheRead();
            if (cached && cached.revisionPlans) return cached.revisionPlans;
            throw e;
        }
    }

    async function pullRevisionPlan(subjectKey) {
        if (!(await ensureReady())) {
            const cached = _cacheRead();
            const rows = (cached && cached.revisionPlans) || [];
            return rows.find(r => r.subject_key === subjectKey) || null;
        }
        try {
            const row = await SB.fetchRevisionPlan(subjectKey);
            return row;
        } catch (e) {
            const cached = _cacheRead();
            const rows = (cached && cached.revisionPlans) || [];
            const fallback = rows.find(r => r.subject_key === subjectKey);
            if (fallback) return fallback;
            throw e;
        }
    }

    async function pushRevisionPlan(subjectKey, startDate, entries) {
        if (!(await ensureReady())) throw new Error('Not ready');
        await SB.upsertRevisionPlan(subjectKey, startDate, entries);
        // Refresh the cached list of plans so offline fallback stays current
        try {
            const cached = _cacheRead() || {};
            const rows = (cached.revisionPlans || []).filter(r => r.subject_key !== subjectKey);
            rows.push({ subject_key: subjectKey, start_date: startDate, entries });
            _cacheWrite({ ...cached, revisionPlans: rows });
        } catch (_) { /* cache is best-effort */ }
    }

    async function deleteRevisionPlan(subjectKey) {
        if (!(await ensureReady())) throw new Error('Not ready');
        await SB.deleteRevisionPlan(subjectKey);
        try {
            const cached = _cacheRead() || {};
            const rows = (cached.revisionPlans || []).filter(r => r.subject_key !== subjectKey);
            _cacheWrite({ ...cached, revisionPlans: rows });
        } catch (_) {}
    }

    return {
        initCloud, ensureReady, isLoggedIn, getUser,
        signUp, signIn, verifyOtp, resendOtp, handleEmailCallback,
        changeEmail, changeUsername, changePassword, deleteAccount,
        logout, loadSyllabus, pull, push, _cfg,
        _cacheRead, _cacheWrite, _cacheClear,
        loadRevisionConfig, loadRevisionRegistry,
        pullAllRevisionPlans, pullRevisionPlan, pushRevisionPlan, deleteRevisionPlan,
    };
})();
