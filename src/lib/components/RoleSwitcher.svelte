<script lang="ts">
	import { page } from '$app/state';
	import { ArrowLeftRight, Check, Megaphone, Ticket, UserRound } from '@lucide/svelte';
	import Sheet from './Sheet.svelte';
	import { busyEnhance as enhance } from '$lib/utils/enhance';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { OperatingIdentity } from '$lib/constants/operating-identity';

	let { currentRole, signedIn, expanded = false }: { currentRole: OperatingIdentity; signedIn: boolean; expanded?: boolean } = $props();
	let open = $state(false);
	let pending = $state<string | null>(null);
	let error = $state('');
	const roles = [
		{ id: 'attendee', label: 'Attendee', icon: Ticket, description: 'Discover events and manage your ticket wallet.' },
		{ id: 'organizer', label: 'Organizer', icon: Megaphone, description: 'Create events and open your organizer console.' },
		{ id: 'guest', label: 'Guest', icon: UserRound, description: 'Browse without organizer tools. Your account and tickets are kept.' }
	] as const;
	const label = $derived(roles.find((role) => role.id === currentRole)?.label ?? 'Guest');
	const submit: SubmitFunction = ({ formData, cancel }) => {
		if (pending) { cancel(); return; }
		pending = String(formData.get('identity')); error = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'failure') error = String(result.data?.error ?? 'Your role could not be changed.');
				else if (result.type === 'error') error = 'Your role could not be changed. Please try again.';
				else { await update(); open = false; }
			} finally { pending = null; }
		};
	};
</script>

<div class="flex flex-wrap items-center gap-3">
	<span class="text-body-sm text-on-surface-variant">Current role: <strong class="text-primary">{label}</strong></span>
	{#if signedIn && !expanded}
		<button type="button" class="h-10 px-4 rounded-full border border-surface-glass-border bg-surface-container-high text-body-sm font-semibold flex items-center gap-2" onclick={() => { open = true; error = ''; }}><ArrowLeftRight class="w-4 h-4" />Switch role</button>
	{:else if !signedIn}<a href="/auth/login" class="text-body-sm text-primary">Sign in to switch roles</a>{/if}
</div>
{#snippet choices()}
	<p class="text-body-sm text-on-surface-variant mb-4">Choose how you use Owltside. Switching roles does not create a new account or remove your tickets.</p>
	{#if error}<p role="alert" class="rounded-lg bg-error/10 text-error p-3 mb-3">{error}</p>{/if}
	<div class="flex flex-col gap-3">
		{#each roles as role}
			<form method="POST" action="/settings?/setIdentity" use:enhance={submit}>
				<input type="hidden" name="identity" value={role.id} />
				<input type="hidden" name="returnTo" value={page.url.pathname === '/profile' ? '/profile' : '/settings'} />
				<button type="submit" disabled={pending !== null || currentRole === role.id} aria-pressed={currentRole === role.id} aria-busy={pending === role.id} class="w-full flex items-center gap-3 rounded-xl border p-4 text-left disabled:opacity-70 {currentRole === role.id ? 'border-primary bg-primary/10' : 'border-surface-glass-border bg-surface-container-high/50'}">
					<role.icon class="w-5 h-5 text-primary shrink-0" />
					<span class="flex-1"><span class="block font-semibold">{pending === role.id ? 'Switching…' : role.label}</span><span class="block text-body-sm text-on-surface-variant mt-1">{role.description}</span></span>
					{#if currentRole === role.id}<Check class="w-4 h-4 text-primary" />{/if}
				</button>
			</form>
		{/each}
	</div>
{/snippet}
{#if expanded && signedIn}{@render choices()}{/if}
<Sheet {open} title="Switch role" close={() => { if (!pending) open = false; }}>{@render choices()}</Sheet>
