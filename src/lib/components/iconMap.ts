import {
	AudioWaveform,
	BrainCircuit,
	Brush,
	Disc3,
	Landmark,
	Music,
	PenTool,
	Terminal,
	UtensilsCrossed,
	Warehouse,
	type LucideIcon
} from '@lucide/svelte';

export const coverIcons: Record<string, LucideIcon> = {
	'brain-circuit': BrainCircuit,
	'audio-waveform': AudioWaveform,
	terminal: Terminal,
	'utensils-crossed': UtensilsCrossed,
	landmark: Landmark,
	'disc-3': Disc3,
	'pen-tool': PenTool,
	warehouse: Warehouse,
	brush: Brush,
	music: Music
};

export const categoryIcons = {
	all: 'stars',
	tech: 'brain-circuit',
	music: 'audio-waveform',
	design: 'brush',
	conferences: 'landmark',
	workshops: 'terminal',
	food: 'utensils-crossed',
	nightlife: 'disc-3'
} as const;

export const categories: { id: string; label: string }[] = [
	{ id: 'all', label: 'All Vibes' },
	{ id: 'tech', label: 'Tech & AI' },
	{ id: 'music', label: 'Music & Concerts' },
	{ id: 'design', label: 'Design & Art' },
	{ id: 'conferences', label: 'Conferences' },
	{ id: 'workshops', label: 'Workshops' },
	{ id: 'food', label: 'Food & Drink' },
	{ id: 'nightlife', label: 'Nightlife' }
];
