// in dev, this makes Vite inject its client as this module's first dependency,
// so that global constant replacements are installed before any other module
// (including user hooks) evaluates. In build it's inert.
import.meta.hot;

import * as client_hooks from '../../../src/hooks.client.ts';


export { matchers } from './matchers.js';

export const nodes = [
	() => import('./nodes/0'),
	() => import('./nodes/1'),
	() => import('./nodes/2'),
	() => import('./nodes/3'),
	() => import('./nodes/4'),
	() => import('./nodes/5'),
	() => import('./nodes/6'),
	() => import('./nodes/7'),
	() => import('./nodes/8'),
	() => import('./nodes/9'),
	() => import('./nodes/10'),
	() => import('./nodes/11'),
	() => import('./nodes/12'),
	() => import('./nodes/13'),
	() => import('./nodes/14'),
	() => import('./nodes/15'),
	() => import('./nodes/16'),
	() => import('./nodes/17'),
	() => import('./nodes/18'),
	() => import('./nodes/19'),
	() => import('./nodes/20'),
	() => import('./nodes/21'),
	() => import('./nodes/22'),
	() => import('./nodes/23'),
	() => import('./nodes/24')
];

export const server_loads = [0,2];

export const dictionary = {
		"/": [~4],
		"/(console)/approvals": [~5,[2],[3]],
		"/(console)/audit": [~6,[2],[3]],
		"/(console)/audit/[id]": [~7,[2],[3]],
		"/(console)/dashboard": [~8,[2],[3]],
		"/(console)/events": [~9,[2],[3]],
		"/(console)/events/[id]": [~10,[2],[3]],
		"/login": [~24],
		"/(console)/moderation": [~11,[2],[3]],
		"/(console)/orders": [~12,[2],[3]],
		"/(console)/organizers": [~13,[2],[3]],
		"/(console)/organizers/[id]": [~14,[2],[3]],
		"/(console)/refunds": [~15,[2],[3]],
		"/(console)/reports": [~16,[2],[3]],
		"/(console)/search": [~17,[2],[3]],
		"/(console)/settings": [~18,[2],[3]],
		"/(console)/settlements": [~19,[2],[3]],
		"/(console)/staff": [~20,[2],[3]],
		"/(console)/tickets": [~21,[2],[3]],
		"/(console)/users": [~22,[2],[3]],
		"/(console)/users/[id]": [~23,[2],[3]]
	};

export const hooks = {
	handleError: client_hooks.handleError || (({ error }) => { console.error(error) }),
	init: client_hooks.init,
	reroute: (() => {}),
	transport: {}
};

export const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));
export const encoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.encode]));

export const hash = false;

export const decode = (type, value) => decoders[type](value);

export { default as root } from '../root.js';

export const get_error_template = () => import('../shared/error-template.js').then(m => m.default);