/* =============================================
   Cloud client — internal only, never user-facing
   Uses Supabase Auth (email + password + OTP).
   Credentials always come from SB_CONFIG (_env.js).
   ============================================= */

const SB = (() => {
    let _client = null;

    function init(url, key) {
        if (!url || !key) { _client = null; return false; }
        try {
            if (typeof window.supabase !== 'undefined') {
                _client = window.supabase.createClient(url, key, {
                    auth: {
                        storage: sessionStorage,
                        autoRefreshToken: true,
                        persistSession: true,
                        detectSessionInUrl: true,
                    }
                });
                return true;
            }
            return false;
        } catch (e) {
            console.error('[cloud] init error', e);
            _client = null;
            return false;
        }
    }

    function ready() { return _client !== null; }

    /* ---- Auth ---- */

    async function getSession() {
        if (!_client) throw new Error('Not initialised');
        const { data, error } = await _client.auth.getSession();
        if (error) throw error;
        return data.session || null;
    }

    async function getUser() {
        const s = await getSession();
        return s?.user || null;
    }

    async function isLoggedIn() {
        try { return !!(await getSession()); } catch { return false; }
    }

    async function signUp(email, password, username) {
        if (!_client) throw new Error('Not initialised');
        const { data, error } = await _client.auth.signUp({
            email,
            password,
            options: { data: { username } }
        });
        if (error) throw error;
        return data;
    }

    async function signIn(email, password) {
        if (!_client) throw new Error('Not initialised');
        const { data, error } = await _client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    }

    async function verifyOtp(email, token) {
        if (!_client) throw new Error('Not initialised');
        const { data, error } = await _client.auth.verifyOtp({ email, token, type: 'email' });
        if (error) throw error;
        return data;
    }

    async function resendOtp(email) {
        if (!_client) throw new Error('Not initialised');
        const { error } = await _client.auth.resend({ type: 'signup', email });
        if (error) throw error;
    }

    async function signOut() {
        if (_client) await _client.auth.signOut();
    }

    /* ---- Data (auth JWT is sent automatically by the SDK) ---- */

    async function fetchProgress() {
        if (!_client) throw new Error('Not initialised');
        const { data, error } = await _client.from('study_progress').select('*').single();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    }

    async function upsertProgress(chapters, settings) {
        if (!_client) throw new Error('Not initialised');
        const user = await getUser();
        if (!user) throw new Error('Not signed in');
        const { error } = await _client.from('study_progress').upsert(
            { user_id: user.id, chapters, settings, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
        );
        if (error) throw error;
    }

    return { init, ready, getSession, getUser, isLoggedIn, signUp, signIn, verifyOtp, resendOtp, signOut, fetchProgress, upsertProgress };
})();

/* Load Supabase SDK synchronously so it's available immediately */
(function () {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.async = false;
    document.head.appendChild(s);
}());
