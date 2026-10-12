import type { Session } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			session: Session | null;
			demoMode: boolean;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			offline?: boolean;
		}
	}
}

export {};
