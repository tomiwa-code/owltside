import type { RequestHandler } from './$types';
import { biometricDisabledResponse } from '$lib/server/biometrics-disabled';

// Keep a non-cacheable tombstone for older installed clients. No challenge,
// enrollment, signature verification, or unlock cookie may be issued.
export const POST: RequestHandler = ({ cookies }) => biometricDisabledResponse(cookies);
export const DELETE: RequestHandler = ({ cookies }) => biometricDisabledResponse(cookies);
