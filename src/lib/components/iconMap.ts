import {
	AudioWaveform,
	BrainCircuit,
	Brush,
	Disc3,
	Landmark,
	Music,
	PenTool,
	Sparkles,
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

export const categories: { id: string; label: string; icon: LucideIcon }[] = [
	{ id: 'all', label: 'All Vibes', icon: Sparkles },
	{ id: 'nightlife', label: 'Nightlife', icon: Disc3 },
	{ id: 'tech', label: 'Tech & AI', icon: BrainCircuit },
	{ id: 'music', label: 'Music & Concerts', icon: Music },
	{ id: 'design', label: 'Design & Arts', icon: Brush },
	{ id: 'conferences', label: 'Conferences', icon: Landmark },
	{ id: 'workshops', label: 'Workshops', icon: Terminal },
	{ id: 'food', label: 'Food & Drink', icon: UtensilsCrossed }
];
