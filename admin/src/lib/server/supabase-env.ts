import { parse as parseEnv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * One source of truth for the admin's Supabase configuration.
 *
 * Every live driver (data, moderation, approvals, reports) resolves credentials
 * through this module, so two panels can never disagree about whether the
 * console is reading Supabase or the seeded demo dataset.
 *
 * The admin is a nested SvelteKit project, so it accepts the same variable
 * names as the public app and, in development, also reads the repository-root
 * `.env` files. That is what lets a single `.env` at the repo root serve both
 * apps without duplicating secrets.
 */

let localEnvLoaded = false;

/**
 * Manual `.env` loading instead of a plain `dotenv.config()` call.
 *
 * `dotenv` never overwrites a variable that already exists, and SvelteKit's dev
 * server pre-populates `process.env` from `admin/.env`. A copied
 * `.env.example` usually contains empty placeholders (`PUBLIC_SUPABASE_URL=`),
 * which would then mask the real value in the repository-root `.env`. Filling
 * only blank keys keeps file precedence while letting the root `.env` win over
 * an empty placeholder.
 */
function applyEnvFile(path: string): void {
	let contents: string;
	try {
		contents = readFileSync(path, 'utf8');
	} catch {
		return;
	}
	for (const [key, value] of Object.entries(parseEnv(contents))) {
		const current = process.env[key];
		if (current === undefined || current === '') process.env[key] = value;
	}
}

export function loadLocalEnvFiles(): void {
	if (localEnvLoaded || process.env.NODE_ENV === 'production') return;
	const cwd = process.cwd();
	const mode = process.env.NODE_ENV || 'development';
	// Highest precedence first; only blank keys are filled, so the first file
	// that actually sets a value wins.
	const files = [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env'];
	// admin/.env first, then the repository-root .env the public app uses.
	for (const file of files) applyEnvFile(resolve(cwd, file));
	for (const file of files) applyEnvFile(resolve(cwd, '..', file));
	localEnvLoaded = true;
}

function envValue(...keys: string[]): string {
	loadLocalEnvFiles();
	for (const key of keys) {
		const value = (process.env[key] ?? '').trim();
		if (value) return value;
	}
	return '';
}

/** Project URL, without a trailing slash or a pasted `/rest/v1` suffix. */
export function supabaseUrl(): string {
	return envValue('SUPABASE_URL', 'PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL')
		.replace(/\/+$/, '')
		.replace(/\/rest\/v1$/, '');
}

/**
 * Server-only key. The service-role (or new `sb_secret_…`) key is required:
 * the public app's RLS policies are attendee/organizer scoped, so an anon key
 * cannot read the admin's cross-tenant views at all.
 */
export function supabaseServiceRoleKey(): string {
	return envValue('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
}

/** `role` claim of a JWT-style key (`anon`, `service_role`, …), unverified. */
function keyRole(key: string): string | null {
	if (key.startsWith('sb_secret_')) return 'service_role';
	if (key.startsWith('sb_publishable_')) return 'anon';
	const part = key.split('.')[1];
	if (!part) return null;
	try {
		const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as {
			role?: unknown;
		};
		return typeof payload.role === 'string' ? payload.role : null;
	} catch {
		return null;
	}
}

export interface SupabaseConfig {
	url: string;
	key: string;
	/** True when both halves are present and usable. */
	configured: boolean;
	/** Human-readable misconfiguration, surfaced as a banner. Empty when fine. */
	notice: string;
}

/**
 * Resolve the configuration once, with the checks that otherwise surface as an
 * opaque 500 ("Invalid URL", "User not allowed") on every console page.
 */
export function supabaseConfig(): SupabaseConfig {
	const url = supabaseUrl();
	const key = supabaseServiceRoleKey();

	if (!url && !key) {
		return { url, key, configured: false, notice: '' };
	}
	if (!url) {
		return {
			url,
			key,
			configured: false,
			notice:
				'A Supabase service-role key is set but the project URL is missing. Add PUBLIC_SUPABASE_URL (or SUPABASE_URL) to admin/.env or the repository-root .env.'
		};
	}
	if (!/^https?:\/\/[^\s]+$/i.test(url)) {
		return {
			url,
			key,
			configured: false,
			notice: `The Supabase project URL "${url}" is not a valid http(s) URL. Use the Project URL from Supabase → Settings → API, e.g. https://<project>.supabase.co`
		};
	}
	if (!key) {
		return {
			url,
			key,
			configured: false,
			notice:
				'The Supabase project URL is set but SUPABASE_SERVICE_ROLE_KEY is empty, so the console stays on its demo dataset. Add the service-role key (Supabase → Settings → API → service_role) — the anon key cannot read the admin views.'
		};
	}
	if (keyRole(key) === 'anon') {
		return {
			url,
			key,
			configured: false,
			notice:
				'SUPABASE_SERVICE_ROLE_KEY holds the anon/public key. The console needs the service-role key (Supabase → Settings → API → service_role) — with the anon key every read is filtered by RLS and admin user lookups are rejected.'
		};
	}
	return { url, key, configured: true, notice: '' };
}

export function supabaseConfigured(): boolean {
	return supabaseConfig().configured;
}
