import type { PageServerLoad } from './$types';
import { getDashboard } from '$admin/server/store';

export const load: PageServerLoad = () => ({ dashboard: getDashboard() });
