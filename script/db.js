/* =============================================
   DB — cloud-first data layer
   • SB_CONFIG (from _env.js) holds URL + key — users never see these
   • sessionStorage holds only the user's email (auth token)
   • No localStorage anywhere
   ============================================= */

const DB = (() => {
    const SS = {
        get: k  => { try { return JSON.parse(sessionStorage.getItem('sb_' + k)); } catch { return null; } },
        set: (k, v) => { try { sessionStorage.setItem('sb_' + k, JSON.stringify(v)); } catch {} },
        clear:  () => sessionStorage.clear(),
    };

    /* URL + key always from env; never user-supplied */
    function _cfg() {
        return window.SB_CONFIG || { url: '', key: '' };
    }

    /* ---- Auth ---- */
    function getEmail() { return SS.get('email') || ''; }

    function saveEmail(email) { SS.set('email', email); }

    function isLoggedIn() {
        const { url, key } = _cfg();
        return !!(url && key && getEmail());
    }

    function logout() {
        SS.clear();
        window.location.replace('setup.html');
    }

    /* ---- Init cloud client ---- */
    function initCloud() {
        const { url, key } = _cfg();
        if (!url || !key) return false;
        const ok = SB.init(url, key);
        const email = getEmail();
        if (ok && email) SB.setEmail(email);
        return ok;
    }

    function cloudReady() { return SB.isReady(); }

    /* ---- Syllabus loader ---- */
    async function loadSyllabus(filename) {
        const res = await fetch(`config/${filename}`);
        if (!res.ok) throw new Error(`Cannot load ${filename}`);
        return res.json();
    }

    /* ---- Cloud R/W ---- */
    async function pull() {
        if (!SB.isReady()) throw new Error('Not signed in');
        const { data, error } = await SB.fetch();
        if (error &&
            !error.message.includes('PGRST116') &&
            !error.message.includes('null')) throw error;
        return data || null;
    }

    async function push(chapters, settings, enabledSubjects) {
        if (!SB.isReady()) throw new Error('Not signed in');
        const { error } = await SB.upsert(chapters, { ...settings, enabledSubjects });
        if (error) throw error;
    }

    return {
        getEmail, saveEmail,
        isLoggedIn, logout,
        initCloud, cloudReady,
        loadSyllabus,
        pull, push,
        _cfg,
    };
})();
