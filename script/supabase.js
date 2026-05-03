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

    /* Check if the page was opened from a magic-link / email confirmation URL.
       detectSessionInUrl:true (set in init) handles PKCE & implicit flows
       automatically — calling getSession() after init picks it up. */
    async function handleEmailCallback() {
        if (!_client) return null;
        const { data, error } = await _client.auth.getSession();
        if (error) return null;
        return data.session || null;
    }

    async function signOut() {
        if (_client) await _client.auth.signOut();
    }

    /* ── Account mutations ──────────────────────────────────────────────
       All three require an active session (user is already signed in).

       changeEmail: Supabase sends a confirmation link to the NEW address.
         The change only takes effect once the user clicks that link.
         We re-authenticate first so the session token is fresh (avoids
         the "requires recent sign-in" 401 Supabase can throw).

       changePassword: re-authenticates then updates the password in one
         roundtrip. Supabase does NOT send a confirmation email for this.

       deleteAccount: calls a Postgres RPC `delete_account()` that runs
         as the authenticated user (SECURITY DEFINER) and does:
           DELETE FROM auth.users WHERE id = auth.uid();
         The function must be created in the Supabase SQL editor — see
         example/schema.sql for the exact definition.
         We re-auth first to confirm intent, then RPC, then sign out.
    ────────────────────────────────────────────────────────────────── */

    async function changeEmail(currentPassword, newEmail) {
        if (!_client) throw new Error('Not initialised');
        // Re-authenticate to get a fresh session before sensitive op
        const user = await getUser();
        if (!user) throw new Error('Not signed in');
        const { error: reAuthErr } = await _client.auth.signInWithPassword({
            email: user.email, password: currentPassword
        });
        if (reAuthErr) throw new Error('Current password is incorrect');
        // Now update the email — Supabase will email the new address for confirmation
        const { error } = await _client.auth.updateUser({ email: newEmail });
        if (error) throw error;
    }

    async function changePassword(currentPassword, newPassword) {
        if (!_client) throw new Error('Not initialised');
        const user = await getUser();
        if (!user) throw new Error('Not signed in');
        // Re-auth to verify current password before allowing change
        const { error: reAuthErr } = await _client.auth.signInWithPassword({
            email: user.email, password: currentPassword
        });
        if (reAuthErr) throw new Error('Current password is incorrect');
        const { error } = await _client.auth.updateUser({ password: newPassword });
        if (error) throw error;
    }

    async function deleteAccount(currentPassword) {
        if (!_client) throw new Error('Not initialised');
        const user = await getUser();
        if (!user) throw new Error('Not signed in');
        // Re-auth to confirm intent
        const { error: reAuthErr } = await _client.auth.signInWithPassword({
            email: user.email, password: currentPassword
        });
        if (reAuthErr) throw new Error('Password is incorrect');
        // Call server-side RPC — see example/schema.sql for definition
        const { error } = await _client.rpc('delete_account');
        if (error) throw error;
        await _client.auth.signOut();
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

    return { init, ready, getSession, getUser, isLoggedIn, signUp, signIn, verifyOtp, resendOtp, handleEmailCallback, signOut, changeEmail, changePassword, deleteAccount, fetchProgress, upsertProgress };
})();

/* Load Supabase SDK synchronously so it's available immediately */
(function () {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.async = false;
    document.head.appendChild(s);
}());
