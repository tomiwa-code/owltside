export type ToastTone = 'ok' | 'error' | 'info';

export interface ToastItem {
	id: number;
	tone: ToastTone;
	title: string;
	message?: string;
}

class ToastStore {
	items = $state<ToastItem[]>([]);
	private seq = 0;

	push(tone: ToastTone, title: string, message?: string) {
		const id = ++this.seq;
		this.items = [...this.items, { id, tone, title, message }];
		setTimeout(() => this.dismiss(id), 5200);
	}

	ok(title: string, message?: string) {
		this.push('ok', title, message);
	}

	error(title: string, message?: string) {
		this.push('error', title, message);
	}

	info(title: string, message?: string) {
		this.push('info', title, message);
	}

	dismiss(id: number) {
		this.items = this.items.filter((item) => item.id !== id);
	}
}

export const toasts = new ToastStore();
