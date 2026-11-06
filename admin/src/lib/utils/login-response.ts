import { deserialize } from '$app/forms';
import type { ActionResult } from '@sveltejs/kit';

type LoginData = { error?: string; email?: string };
type LoginResult = ActionResult<LoginData, LoginData>;

/** Action data uses SvelteKit/devalue serialization, not ordinary nested JSON. */
export async function readLoginResult(response: Response): Promise<LoginResult | null> {
	try {
		return deserialize<LoginData, LoginData>(await response.text());
	} catch {
		// Proxies can return HTML or malformed data instead of an action result.
		return null;
	}
}

export function loginFailureMessage(result: LoginResult, status: number): string {
	if (result.type === 'failure' && typeof result.data?.error === 'string') {
		return result.data.error;
	}
	if (result.type === 'error' && typeof result.error?.message === 'string') {
		return result.error.message;
	}
	return `Sign-in was rejected (HTTP ${status}).`;
}
