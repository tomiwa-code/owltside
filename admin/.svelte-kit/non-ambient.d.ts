
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/(console)" | "/" | "/api" | "/api/approvals" | "/api/approvals/[id]" | "/api/approvals/[id]/decision" | "/api/audit" | "/api/audit/verify" | "/api/cases" | "/api/cases/[id]" | "/api/cases/[id]/resolve" | "/api/client-log" | "/api/events" | "/api/events/[id]" | "/api/events/[id]/status" | "/api/export" | "/api/export/[report]" | "/api/health" | "/api/moderation" | "/api/moderation/[id]" | "/api/moderation/[id]/decision" | "/api/orders" | "/api/orders/[id]" | "/api/orders/[id]/refund" | "/api/organizers" | "/api/organizers/[id]" | "/api/organizers/[id]/status" | "/api/refunds" | "/api/refunds/batch" | "/api/refunds/[id]" | "/api/refunds/[id]/decision" | "/api/reports" | "/api/reports/[id]" | "/api/reports/[id]/decision" | "/api/search" | "/api/session-probe" | "/api/settings" | "/api/settlements" | "/api/settlements/reconcile" | "/api/staff" | "/api/staff/invite" | "/api/staff/[id]" | "/api/staff/[id]/status" | "/api/tickets" | "/api/tickets/[id]" | "/api/tickets/[id]/actions" | "/api/users" | "/api/users/[id]" | "/api/users/[id]/status" | "/(console)/approvals" | "/(console)/audit" | "/(console)/audit/[id]" | "/(console)/dashboard" | "/(console)/events" | "/(console)/events/[id]" | "/login" | "/logout" | "/(console)/moderation" | "/(console)/orders" | "/(console)/organizers" | "/(console)/organizers/[id]" | "/(console)/refunds" | "/(console)/reports" | "/(console)/search" | "/(console)/settings" | "/(console)/settlements" | "/(console)/staff" | "/(console)/tickets" | "/(console)/users" | "/(console)/users/[id]";
		RouteParams(): {
			"/api/approvals/[id]": { id: string };
			"/api/approvals/[id]/decision": { id: string };
			"/api/cases/[id]": { id: string };
			"/api/cases/[id]/resolve": { id: string };
			"/api/events/[id]": { id: string };
			"/api/events/[id]/status": { id: string };
			"/api/export/[report]": { report: string };
			"/api/moderation/[id]": { id: string };
			"/api/moderation/[id]/decision": { id: string };
			"/api/orders/[id]": { id: string };
			"/api/orders/[id]/refund": { id: string };
			"/api/organizers/[id]": { id: string };
			"/api/organizers/[id]/status": { id: string };
			"/api/refunds/[id]": { id: string };
			"/api/refunds/[id]/decision": { id: string };
			"/api/reports/[id]": { id: string };
			"/api/reports/[id]/decision": { id: string };
			"/api/staff/[id]": { id: string };
			"/api/staff/[id]/status": { id: string };
			"/api/tickets/[id]": { id: string };
			"/api/tickets/[id]/actions": { id: string };
			"/api/users/[id]": { id: string };
			"/api/users/[id]/status": { id: string };
			"/(console)/audit/[id]": { id: string };
			"/(console)/events/[id]": { id: string };
			"/(console)/organizers/[id]": { id: string };
			"/(console)/users/[id]": { id: string }
		};
		LayoutParams(): {
			"/(console)": { id?: string | undefined };
			"/": { id?: string | undefined; report?: string | undefined };
			"/api": { id?: string | undefined; report?: string | undefined };
			"/api/approvals": { id?: string | undefined };
			"/api/approvals/[id]": { id: string };
			"/api/approvals/[id]/decision": { id: string };
			"/api/audit": Record<string, never>;
			"/api/audit/verify": Record<string, never>;
			"/api/cases": { id?: string | undefined };
			"/api/cases/[id]": { id: string };
			"/api/cases/[id]/resolve": { id: string };
			"/api/client-log": Record<string, never>;
			"/api/events": { id?: string | undefined };
			"/api/events/[id]": { id: string };
			"/api/events/[id]/status": { id: string };
			"/api/export": { report?: string | undefined };
			"/api/export/[report]": { report: string };
			"/api/health": Record<string, never>;
			"/api/moderation": { id?: string | undefined };
			"/api/moderation/[id]": { id: string };
			"/api/moderation/[id]/decision": { id: string };
			"/api/orders": { id?: string | undefined };
			"/api/orders/[id]": { id: string };
			"/api/orders/[id]/refund": { id: string };
			"/api/organizers": { id?: string | undefined };
			"/api/organizers/[id]": { id: string };
			"/api/organizers/[id]/status": { id: string };
			"/api/refunds": { id?: string | undefined };
			"/api/refunds/batch": Record<string, never>;
			"/api/refunds/[id]": { id: string };
			"/api/refunds/[id]/decision": { id: string };
			"/api/reports": { id?: string | undefined };
			"/api/reports/[id]": { id: string };
			"/api/reports/[id]/decision": { id: string };
			"/api/search": Record<string, never>;
			"/api/session-probe": Record<string, never>;
			"/api/settings": Record<string, never>;
			"/api/settlements": Record<string, never>;
			"/api/settlements/reconcile": Record<string, never>;
			"/api/staff": { id?: string | undefined };
			"/api/staff/invite": Record<string, never>;
			"/api/staff/[id]": { id: string };
			"/api/staff/[id]/status": { id: string };
			"/api/tickets": { id?: string | undefined };
			"/api/tickets/[id]": { id: string };
			"/api/tickets/[id]/actions": { id: string };
			"/api/users": { id?: string | undefined };
			"/api/users/[id]": { id: string };
			"/api/users/[id]/status": { id: string };
			"/(console)/approvals": Record<string, never>;
			"/(console)/audit": { id?: string | undefined };
			"/(console)/audit/[id]": { id: string };
			"/(console)/dashboard": Record<string, never>;
			"/(console)/events": { id?: string | undefined };
			"/(console)/events/[id]": { id: string };
			"/login": Record<string, never>;
			"/logout": Record<string, never>;
			"/(console)/moderation": Record<string, never>;
			"/(console)/orders": Record<string, never>;
			"/(console)/organizers": { id?: string | undefined };
			"/(console)/organizers/[id]": { id: string };
			"/(console)/refunds": Record<string, never>;
			"/(console)/reports": Record<string, never>;
			"/(console)/search": Record<string, never>;
			"/(console)/settings": Record<string, never>;
			"/(console)/settlements": Record<string, never>;
			"/(console)/staff": Record<string, never>;
			"/(console)/tickets": Record<string, never>;
			"/(console)/users": { id?: string | undefined };
			"/(console)/users/[id]": { id: string }
		};
		Pathname(): "/" | `/api/approvals/${string}/decision` & {} | "/api/audit/verify" | `/api/cases/${string}/resolve` & {} | "/api/client-log" | "/api/events" | `/api/events/${string}/status` & {} | `/api/export/${string}` & {} | "/api/health" | `/api/moderation/${string}/decision` & {} | `/api/orders/${string}/refund` & {} | `/api/organizers/${string}/status` & {} | "/api/refunds/batch" | `/api/refunds/${string}/decision` & {} | `/api/reports/${string}/decision` & {} | "/api/search" | "/api/session-probe" | "/api/settings" | "/api/settlements/reconcile" | "/api/staff/invite" | `/api/staff/${string}/status` & {} | `/api/tickets/${string}/actions` & {} | `/api/users/${string}/status` & {} | "/approvals" | "/audit" | `/audit/${string}` & {} | "/dashboard" | "/events" | `/events/${string}` & {} | "/login" | "/logout" | "/moderation" | "/orders" | "/organizers" | `/organizers/${string}` & {} | "/refunds" | "/reports" | "/search" | "/settings" | "/settlements" | "/staff" | "/tickets" | "/users" | `/users/${string}` & {};
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/icons/icon-192.png" | "/icons/icon-512.png" | "/logo-stacked.png" | "/logo.png" | "/owl-icon.png" | string & {};
	}
}