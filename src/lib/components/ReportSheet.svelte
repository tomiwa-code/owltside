<script lang="ts">
	import { CircleCheck, Flag, ShieldAlert } from '@lucide/svelte';
	import Sheet from '$components/Sheet.svelte';
	import { toast } from '$lib/state/toast.svelte';
	import {
		REPORT_CATEGORIES,
		REPORT_TARGET_LABELS,
		type ReportTargetType
	} from '$lib/constants/report-categories';

	/**
	 * Report form for an event listing or a public profile.
	 *
	 * Nothing is actioned here: the submission is queued as an `open` report and
	 * the trust & safety team reviews it in the admin console.
	 */
	let {
		open = false,
		targetType,
		targetId,
		targetLabel,
		close
	}: {
		open?: boolean;
		targetType: ReportTargetType;
		targetId: string;
		targetLabel: string;
		close: () => void;
	} = $props();

	const categories = $derived(REPORT_CATEGORIES[targetType]);
	const targetNoun = $derived(REPORT_TARGET_LABELS[targetType]);

	let category = $state('');
	let details = $state('');
	let error = $state('');
	let submitting = $state(false);
	let submitted = $state(false);

	const MIN_DETAILS = 10;

	function reset() {
		category = '';
		details = '';
		error = '';
		submitting = false;
		submitted = false;
	}

	function dismiss() {
		reset();
		close();
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		if (!category) {
			error = 'Choose the violation that best describes the problem.';
			return;
		}
		if (details.trim().length < MIN_DETAILS) {
			error = 'Add a little more detail so the review team can act on it.';
			return;
		}
		if (submitting) return;
		submitting = true;
		try {
			const response = await fetch('/api/reports', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ targetType, targetId, targetLabel, category, details })
			});
			const payload = (await response.json().catch(() => ({}))) as { error?: string };
			if (!response.ok) {
				error = payload.error ?? 'Your report could not be submitted. Please try again.';
				return;
			}
			submitted = true;
			toast('Report submitted — our trust & safety team will review it', 'success');
		} catch {
			error = 'Your report could not be submitted. Check your connection and try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<Sheet open={open} title={targetType === 'event' ? 'Report this listing' : 'Report this profile'} close={dismiss}>
	{#if submitted}
		<div class="flex flex-col items-center gap-3 py-6 text-center">
			<span class="w-12 h-12 rounded-full bg-accent-emerald/10 border border-accent-emerald/30 flex items-center justify-center">
				<CircleCheck class="w-6 h-6 text-accent-emerald" />
			</span>
			<div>
				<h3 class="font-display text-headline-md text-on-surface font-semibold">Report submitted</h3>
				<p class="text-body-sm text-on-surface-variant mt-1 max-w-sm">
					Thanks for flagging this {targetNoun}. Our trust &amp; safety team reviews every report and will act on it if it breaks the community guidelines.
				</p>
			</div>
			<button
				type="button"
				class="h-11 px-6 rounded-full bg-primary text-on-primary text-body-sm font-semibold mt-1"
				onclick={dismiss}
			>
				Done
			</button>
		</div>
	{:else}
		<form class="flex flex-col gap-4" onsubmit={submit}>
			<div class="rounded-lg border border-surface-glass-border bg-surface-container-high/40 p-3 flex items-start gap-3">
				<ShieldAlert class="w-5 h-5 text-primary shrink-0 mt-0.5" />
				<div class="min-w-0">
					<p class="text-body-sm font-semibold text-on-surface truncate">{targetLabel}</p>
					<p class="text-body-sm text-on-surface-variant mt-1">
						Reports are private. The person you are reporting is never told who submitted it.
					</p>
				</div>
			</div>

			<label class="flex flex-col gap-1.5 text-body-sm text-on-surface-variant" for="report-category">
				Violation category
				<select
					id="report-category"
					bind:value={category}
					required
					class="h-11 px-3 rounded-lg bg-surface-base border border-surface-glass-border text-on-surface text-body-md focus:outline-none focus:border-primary"
				>
					<option value="" disabled>Select what is wrong…</option>
					{#each categories as option (option.id)}
						<option value={option.id}>{option.label}</option>
					{/each}
				</select>
			</label>

			<div class="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
				<label for="report-details">Additional details</label>
				<textarea
					id="report-details"
					bind:value={details}
					rows="4"
					maxlength="1000"
					required
					placeholder={targetType === 'event'
						? 'What looks wrong? Include dates, prices or screenshots you can describe…'
						: 'What happened? Include messages, links or anything that helps us verify…'}
					class="w-full resize-y min-h-24 rounded-lg bg-surface-base border border-surface-glass-border p-3 text-body-md text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary"
				></textarea>
				<span class="flex items-center justify-between text-xs">
					<span>{details.trim().length < MIN_DETAILS ? `At least ${MIN_DETAILS} characters` : 'Thanks — this is enough detail to review.'}</span>
					<span class="font-code">{details.length}/1000</span>
				</span>
			</div>

			{#if error}
				<p class="rounded-lg bg-error/10 border border-error/30 px-3 py-2 text-body-sm text-error" role="alert">{error}</p>
			{/if}

			<div class="flex flex-col gap-2 pt-1">
				<button
					type="submit"
					disabled={submitting || !category || details.trim().length < MIN_DETAILS}
					class="h-11 rounded-full bg-error-container text-on-error-container font-semibold text-body-md flex items-center justify-center gap-2 disabled:opacity-40"
				>
					<Flag class="w-4 h-4" /> {submitting ? 'Submitting report…' : 'Submit report'}
				</button>
				<button type="button" class="h-10 text-body-sm font-medium text-on-surface-variant hover:text-on-surface" onclick={dismiss}>
					Cancel
				</button>
			</div>
			<p class="text-xs text-on-surface-variant text-center">
				Knowingly false reports may lead to your own account being restricted.
			</p>
		</form>
	{/if}
</Sheet>
