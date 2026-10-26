// in dev, this makes Vite inject its client as this module's first dependency,
// so that global constant replacements are installed before any other module
// (including user hooks) evaluates. In build it's inert.
import.meta.hot;




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
	() => import('./nodes/21')
];

export const server_loads = [0,2];

export const dictionary = {
		"/(console)/audit": [~4,[2],[3]],
		"/(console)/audit/[id]": [~5,[2],[3]],
		"/(console)/dashboard": [~6,[2],[3]],
		"/(console)/events": [~7,[2],[3]],
		"/(console)/events/[id]": [~8,[2],[3]],
		"/login": [~21],
		"/(console)/moderation": [~9,[2],[3]],
		"/(console)/orders": [~10,[2],[3]],
		"/(console)/organizers": [~11,[2],[3]],
		"/(console)/organizers/[id]": [~12,[2],[3]],
		"/(console)/refunds": [~13,[2],[3]],
		"/(console)/search": [~14,[2],[3]],
		"/(console)/settings": [~15,[2],[3]],
		"/(console)/settlements": [~16,[2],[3]],
		"/(console)/staff": [~17,[2],[3]],
		"/(console)/tickets": [~18,[2],[3]],
		"/(console)/users": [~19,[2],[3]],
		"/(console)/users/[id]": [~20,[2],[3]]
	};

export const hooks = {
	handleError: (({ error }) => { console.error(error) }),
	
	reroute: (() => {}),
	transport: {}
};

export const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));
export const encoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.encode]));

export const hash = false;

export const decode = (type, value) => decoders[type](value);

export { default as root } from '../root.js';

export const get_error_template = () => import('../shared/error-template.js').then(m => m.default);