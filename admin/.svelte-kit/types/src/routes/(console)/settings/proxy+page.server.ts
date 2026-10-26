// @ts-nocheck
import type { PageServerLoad } from './$types';
import { getSettings } from '$admin/server/store';

export const load = () => ({ settings: getSettings() });
;null as any as PageServerLoad;