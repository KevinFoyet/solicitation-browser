<script lang="ts">
	import { fmtInt, fmtTime } from '#lib/ui.js';
	import type { ScrapeRun } from '#lib/server/db/schema.js';

	let {
		latest,
		lastOk,
		totals,
		total,
		q,
		mine,
		mineAvailable,
		syncing,
		onSearch,
		onToggleMine,
		onRefresh,
		onProfile
	}: {
		latest: ScrapeRun | null;
		lastOk: ScrapeRun | null;
		totals: { total: number; today: number };
		total: number;
		q: string;
		mine: boolean;
		mineAvailable: boolean;
		syncing: boolean;
		onSearch: (q: string) => void;
		onToggleMine: () => void;
		onRefresh: () => void;
		onProfile: () => void;
	} = $props();

	// eslint-disable-next-line svelte/prefer-writable-derived -- local draft that follows the URL value
	let search = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		search = q;
	});
	function onInput(e: Event) {
		search = (e.target as HTMLInputElement).value;
		clearTimeout(timer);
		timer = setTimeout(() => onSearch(search.trim()), 250);
	}

	const pill = $derived.by(() => {
		if (syncing || latest?.status === 'running') {
			const p = latest?.pagesFetched ?? 0;
			return {
				tone: 'border-blue-200 bg-blue-50 text-blue-800',
				dot: 'bg-blue-500 animate-pulse',
				text: `Syncing… ${p ? `${p} pages` : ''}`
			};
		}
		if (!latest)
			return {
				tone: 'border-gray-200 bg-gray-50 text-gray-600',
				dot: 'bg-gray-400',
				text: 'Never synced'
			};
		if (latest.status === 'failed')
			return {
				tone: 'border-amber-300 bg-amber-50 text-amber-900',
				dot: 'bg-amber-500',
				text: `Sync failed ${fmtTime(latest.finishedAt)}`
			};
		return {
			tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
			dot: 'bg-emerald-500',
			text: `Synced ${fmtTime(latest.finishedAt)}`
		};
	});
</script>

<header class="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
	<div class="flex items-center gap-3 px-4 py-2">
		<div class="mr-2 shrink-0">
			<h1 class="text-sm font-semibold tracking-tight">Solicitation Browser</h1>
			<p class="text-[11px] leading-tight text-gray-500">DLA DIBBS RFQs</p>
		</div>

		<div
			class="flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs {pill.tone}"
			title={latest?.error ?? ''}
		>
			<span class="inline-block h-2 w-2 rounded-full {pill.dot}"></span>
			<span>{pill.text}</span>
			<span class="opacity-40">·</span>
			<span>{fmtInt.format(totals.today)} today</span>
			<span class="opacity-40">·</span>
			<span>{fmtInt.format(totals.total)} total</span>
		</div>

		<div class="relative ml-auto w-full max-w-md">
			<input
				id="search"
				type="search"
				placeholder="Search NSN, nomenclature, solicitation, PR…  ( / )"
				value={search}
				oninput={onInput}
				class="w-full rounded-md border-gray-300 py-1.5 pr-8 pl-3 text-[13px] shadow-sm focus:border-blue-500 focus:ring-blue-500"
			/>
			{#if search}
				<button
					type="button"
					class="absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
					aria-label="Clear search"
					onclick={() => {
						search = '';
						onSearch('');
					}}>×</button
				>
			{/if}
		</div>

		<div class="flex shrink-0 items-center gap-1.5">
			<span class="text-xs text-gray-500 tabular-nums">{fmtInt.format(total)} matches</span>
			{#if mineAvailable}
				<button type="button" class="btn" onclick={onToggleMine}
					>{mine ? 'Show all' : 'Show mine'}</button
				>
			{/if}
			<button type="button" class="btn" onclick={onProfile}>My profile</button>
			<button
				type="button"
				class="btn btn-primary"
				disabled={syncing || latest?.status === 'running'}
				onclick={onRefresh}
			>
				{syncing || latest?.status === 'running' ? 'Syncing…' : 'Refresh'}
			</button>
		</div>
	</div>

	{#if latest?.status === 'failed'}
		<div class="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
			<strong>Sync failed {fmtTime(latest.finishedAt)}:</strong>
			{latest.error}
			{#if lastOk}· Showing data from {fmtTime(lastOk.finishedAt)} ({fmtInt.format(
					lastOk.rowsUpserted
				)} rows).{/if}
		</div>
	{/if}
</header>
