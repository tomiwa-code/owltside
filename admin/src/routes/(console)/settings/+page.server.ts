import type { PageServerLoad } from './$types';
import { getSettings } from '$admin/server/store';

export const load: PageServerLoad = () => ({ settings: getSettings() });
