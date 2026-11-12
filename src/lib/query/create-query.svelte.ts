import type { DefaultError, QueryClient, QueryKey } from '@tanstack/query-core';
import {
	createQuery,
	useQueryClient,
	type CreateQueryOptions,
	type CreateQueryResult,
	type DefinedInitialDataOptions,
	type UndefinedInitialDataOptions
} from '@tanstack/svelte-query';
import { getQueryClient } from './client';

type AppQueryOptions<
	TQueryFnData,
	TError,
	TData,
	TQueryKey extends QueryKey
> =
	| UndefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>
	| DefinedInitialDataOptions<TQueryFnData, TError, TData, TQueryKey>;

/**
 * The provider's client when a `QueryClientProvider` is in the tree, otherwise
 * the module-level client. The fallback keeps queries working in component
 * tests and in any portal rendered outside the provider.
 */
function resolveClient(): QueryClient {
	try {
		return useQueryClient();
	} catch {
		return getQueryClient();
	}
}

/**
 * `createQuery` bound to this app's QueryClient.
 *
 * Passing the client explicitly (instead of relying on the provider context)
 * means a query works in a component test, a portal, or any SSR edge case where
 * `QueryClientProvider` is not an ancestor — while still reading and writing the
 * same cache the provider exposes. Screens should use this rather than importing
 * `createQuery` directly so the binding lives in one place.
 */
export function createAppQuery<
	TQueryFnData = unknown,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey
>(
	options: () => AppQueryOptions<TQueryFnData, TError, TData, TQueryKey>
): CreateQueryResult<TData, TError> {
	return createQuery(
		options as () => CreateQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
		resolveClient
	) as CreateQueryResult<TData, TError>;
}
