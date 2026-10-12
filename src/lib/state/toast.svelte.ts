export interface Toast {
	id: number;
	kind: 'success' | 'error' | 'info';
	text: string;
}

let toasts = $state<Toast[]>([]);
let nextId = 1;

export function toast(text: string, kind: Toast['kind'] = 'info'): void {
	const id = nextId++;
	toasts = [...toasts, { id, kind, text }];
	setTimeout(() => {
		toasts = toasts.filter((t) => t.id !== id);
	}, 3200);
}

export function dismissToast(id: number): void {
	toasts = toasts.filter((t) => t.id !== id);
}

export function getToasts(): Toast[] {
	return toasts;
}
