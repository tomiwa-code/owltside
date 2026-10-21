import type { AdminSession } from '$admin/types';

declare global {
	namespace App {
		interface Locals {
			admin: AdminSession | null;
			requestId: string;
		}
		interface PageData {
			admin?: AdminSession | null;
			mode?: 'live' | 'demo';
		}
	}
}

export {};
