import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { supabaseConfig, supabaseServiceRoleKey, supabaseUrl } from '$admin/server/supabase-env';

const KEYS = [
	'SUPABASE_URL',
	'PUBLIC_SUPABASE_URL',
	'VITE_SUPABASE_URL',
	'SUPABASE_SERVICE_ROLE_KEY',
	'SUPABASE_SECRET_KEY'
];

const saved = new Map<string, string | undefined>();

/** Same shape Supabase issues: `<header>.<payload>.<signature>`. */
function jwt(payload: Record<string, unknown>): string {
	const part = Buffer.from(JSON.stringify(payload)).toString('base64url');
	return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${part}.c2lnbmF0dXJl`;
}

const SERVICE_KEY = jwt({ role: 'service_role', iss: 'supabase' });
const ANON_KEY = jwt({ role: 'anon', iss: 'supabase' });

beforeEach(() => {
	saved.clear();
	for (const key of KEYS) {
		saved.set(key, process.env[key]);
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of KEYS) {
		const value = saved.get(key);
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe('Supabase configuration', () => {
	it('reports an unconfigured project without a notice', () => {
		const config = supabaseConfig();
		expect(config.configured).toBe(false);
		expect(config.notice).toBe('');
	});

	it('accepts a URL plus the service-role key', () => {
		process.env.PUBLIC_SUPABASE_URL = 'https://owltside-test.supabase.co';
		process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
		const config = supabaseConfig();
		expect(config.configured).toBe(true);
		expect(config.notice).toBe('');
		expect(config.url).toBe('https://owltside-test.supabase.co');
		expect(config.key).toBe(SERVICE_KEY);
	});

	it('accepts the modern sb_secret_ service key', () => {
		process.env.PUBLIC_SUPABASE_URL = 'https://owltside-test.supabase.co';
		process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_abc123';
		expect(supabaseConfig().configured).toBe(true);
	});

	it('normalises a pasted REST endpoint or trailing slash', () => {
		process.env.SUPABASE_URL = 'https://owltside-test.supabase.co/rest/v1/';
		process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
		expect(supabaseUrl()).toBe('https://owltside-test.supabase.co');
	});

	it('falls back to SUPABASE_SECRET_KEY and ignores blank placeholders', () => {
		process.env.PUBLIC_SUPABASE_URL = 'https://owltside-test.supabase.co';
		process.env.SUPABASE_SERVICE_ROLE_KEY = '';
		process.env.SUPABASE_SECRET_KEY = SERVICE_KEY;
		expect(supabaseServiceRoleKey()).toBe(SERVICE_KEY);
	});

	it('refuses the anon key instead of returning empty admin views', () => {
		process.env.PUBLIC_SUPABASE_URL = 'https://owltside-test.supabase.co';
		process.env.SUPABASE_SERVICE_ROLE_KEY = ANON_KEY;
		const config = supabaseConfig();
		expect(config.configured).toBe(false);
		expect(config.notice).toMatch(/anon\/public key/i);
	});

	it('refuses a publishable key for the same reason', () => {
		process.env.PUBLIC_SUPABASE_URL = 'https://owltside-test.supabase.co';
		process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_publishable_abc123';
		expect(supabaseConfig().configured).toBe(false);
	});

	it('explains a URL without a scheme', () => {
		process.env.SUPABASE_URL = 'owltside-test.supabase.co';
		process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
		const config = supabaseConfig();
		expect(config.configured).toBe(false);
		expect(config.notice).toMatch(/not a valid http\(s\) URL/i);
	});

	it('explains a URL without a service key', () => {
		process.env.PUBLIC_SUPABASE_URL = 'https://owltside-test.supabase.co';
		const config = supabaseConfig();
		expect(config.configured).toBe(false);
		expect(config.notice).toMatch(/SUPABASE_SERVICE_ROLE_KEY is empty/i);
	});

	it('explains a key without a URL', () => {
		process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
		const config = supabaseConfig();
		expect(config.configured).toBe(false);
		expect(config.notice).toMatch(/project URL is missing/i);
	});
});
