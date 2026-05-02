/* =============================================
   Cloud client — internal only, never user-facing
   Credentials always come from SB_CONFIG (_env.js).
   ============================================= */

const SB = (() => {
    let _client = null;
    let _email  = null;

    function init(url, key) {
        if (!url || !key) { _client = null; return false; }
        try {
            _client = (typeof window.supabase !== 'undefined')
                ? window.supabase.createClient(url, key)
                : _makeRestClient(url, key);
            return true;
        } catch (e) {
            console.error('[cloud] init error', e);
            _client = null;
            return false;
        }
    }

    function setEmail(email) { _email = email; }
    function getEmail()      { return _email; }
    function isReady()       { return _client !== null && !!_email; }

    /* Lightweight REST fallback (no SDK) */
    function _makeRestClient(url, key) {
        const base = url.replace(/\/$/, '');
        const H = {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
        };

        async function _req(method, path, body, extra = {}) {
            const res = await fetch(`${base}/rest/v1${path}`, {
                method,
                headers: { ...H, ...extra },
                body: body !== undefined ? JSON.stringify(body) : undefined,
            });
            const text = await res.text();
            if (!res.ok) throw new Error(`${res.status}: ${text}`);
            return text ? JSON.parse(text) : null;
        }

        return {
            _rest: true,
            from(table) {
                const ctx = {
                    _t: table, _f: [], _sel: '*', _one: false,
                    select(c) { ctx._sel = c || '*'; return ctx; },
                    eq(col, val) { ctx._f.push(`${col}=eq.${encodeURIComponent(val)}`); return ctx; },
                    single() { ctx._one = true; return ctx; },
                    async execute() {
                        const qs = ctx._f.length ? `&${ctx._f.join('&')}` : '';
                        const raw = await _req('GET', `/${ctx._t}?select=${ctx._sel}${qs}`);
                        const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
                        return { data: ctx._one ? (arr[0] ?? null) : arr, error: null };
                    },
                    then(res) { ctx.execute().then(res).catch(e => res({ data: null, error: e })); },
                    async upsert(row) {
                        try {
                            const data = await _req('POST', `/${ctx._t}`,
                                Array.isArray(row) ? row : [row],
                                { 'Prefer': 'resolution=merge-duplicates,return=representation' });
                            return { data, error: null };
                        } catch (e) { return { data: null, error: e }; }
                    },
                };
                return ctx;
            },
        };
    }

    /* Fetch this user's row */
    async function fetch(emailOverride) {
        const email = emailOverride || _email;
        if (!_client || !email) throw new Error('Not ready');
        if (_client._rest) {
            const ctx = _client.from('study_progress');
            ctx.eq('user_email', email);
            ctx._one = true;
            return ctx.execute();
        }
        return _client.from('study_progress').select('*').eq('user_email', email).single();
    }

    /* Upsert this user's row */
    async function upsert(chapters, settings) {
        if (!_client || !_email) throw new Error('Not ready');
        const row = {
            user_email: _email,
            chapters,
            settings,
            updated_at: new Date().toISOString(),
        };
        if (_client._rest) return _client.from('study_progress').upsert(row);
        return _client.from('study_progress').upsert(row, { onConflict: 'user_email' });
    }

    /* Check connectivity — a 404/no-row is fine, real errors throw */
    async function ping(email) {
        if (!_client) throw new Error('Client not initialised');
        const { error } = await fetch(email);
        if (error &&
            !error.message.includes('PGRST116') &&
            !error.message.includes('406') &&
            !error.message.includes('404')) throw error;
        return true;
    }

    return { init, setEmail, getEmail, isReady, fetch, upsert, ping };
})();

/* Load Supabase JS SDK in the background */
(function () {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    s.async = true;
    document.head.appendChild(s);
}());
