import type { SupabaseClient } from '@supabase/supabase-js';
import {
	defaultFeeConfiguration,
	loadFeeConfiguration,
	loadFeeConfigurationViaRpc,
	type FeeConfiguration
} from './fees';

export type FeeConfigurationSource = 'database' | 'rpc' | 'defaults';

export interface ResolvedFeeConfiguration {
	config: FeeConfiguration;
	source: FeeConfigurationSource;
	reason: string | null;
}

export interface FeeConfigurationOptions {
	/** How long one configuration read may take before the next source is tried. */
	tablesTimeoutMs?: number;
	rpcTimeoutMs?: number;
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const withTimeout = async <T>(work: Promise<T>, ms: number, label: string): Promise<T> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`${label} did not answer within ${ms}ms`)), ms);
				// A pending timer must not keep a serverless invocation alive.
				if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
					(timer as { unref: () => void }).unref();
				}
			})
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
};

/**
 * Resolve the active fee configuration without ever blocking a quote.
 *
 * Order of preference:
 *   1. `fee_rules` / `platform_settings` through the service-role client — the
 *      authoritative rows, available on a fully configured deployment.
 *   2. `public.fee_quote_config()` through the caller's own client — the same
 *      rows, readable with the anon key, for deployments without a service key.
 *   3. The documented seed defaults, so a broken configuration read shows a
 *      real price breakdown instead of "Service fee Unavailable".
 *
 * Every demotion is reported through `source`/`reason` so the route can log it
 * once; the buyer only ever sees a working total. The amount actually charged
 * is still computed by the database when the order is created, and each read
 * is bounded so an unreachable database cannot stall a page.
 */
export async function resolveFeeConfiguration(
	clients: { admin: SupabaseClient | null; request: SupabaseClient | null },
	options: FeeConfigurationOptions = {}
): Promise<ResolvedFeeConfiguration> {
	const reasons: string[] = [];
	const tablesTimeoutMs = options.tablesTimeoutMs ?? 4_000;
	const rpcTimeoutMs = options.rpcTimeoutMs ?? 2_500;

	if (clients.admin) {
		try {
			const config = await withTimeout(loadFeeConfiguration(clients.admin), tablesTimeoutMs, 'fee tables');
			return { config, source: 'database', reason: null };
		} catch (cause) {
			reasons.push(`fee tables: ${message(cause)}`);
		}
	} else {
		reasons.push('fee tables: service-role client is not configured (SUPABASE_SERVICE_ROLE_KEY)');
	}

	if (clients.request) {
		try {
			const config = await withTimeout(loadFeeConfigurationViaRpc(clients.request), rpcTimeoutMs, 'fee_quote_config()');
			if (config) return { config, source: 'rpc', reason: null };
			reasons.push('fee_quote_config(): not deployed (apply supabase/sql/037_fee_quote_config.sql)');
		} catch (cause) {
			reasons.push(`fee_quote_config(): ${message(cause)}`);
		}
	} else {
		reasons.push('fee_quote_config(): no Supabase client available');
	}

	return { config: defaultFeeConfiguration(), source: 'defaults', reason: reasons.join('; ') };
}
