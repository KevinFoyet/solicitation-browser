<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import {
		activeChips,
		DEFAULTS,
		SORT_LABELS,
		SORTS,
		toSearchParams,
		type Filters
	} from '#lib/filters.js';
	import type { RfqRow } from '#lib/server/queries/rfqs.js';
	import { fmtInt } from '#lib/ui.js';
	import Header from '#lib/components/Header.svelte';
	import FilterSidebar from '#lib/components/FilterSidebar.svelte';
	import RfqTable from '#lib/components/RfqTable.svelte';
	import RfqDrawer from '#lib/components/RfqDrawer.svelte';
	import ProfileDialog from '#lib/components/ProfileDialog.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// ---- URL is the single source of truth for filters -------------------------------------
	function apply(patch: Partial<Filters>, resetPage = true) {
		const next: Filters = {
			...data.filters,
			...patch,
			page: resetPage ? 1 : (patch.page ?? data.filters.page)
		};
		const sp = toSearchParams(next, data.mineDefault);
		goto(`?${sp}`, { reset: resetPage });
	}
	const clearAll = () => goto(data.mineDefault ? '?' : '?mine=0', { reset: false });
	const chips = $derived(activeChips(data.filters));
	function removeChip(key: keyof Filters, value?: string) {
		const cur = data.filters[key];
		if (Array.isArray(cur) && value !== undefined)
			apply({ [key]: cur.filter((v) => v !== value) } as Partial<Filters>);
		else apply({ [key]: DEFAULTS[key] } as Partial<Filters>);
	}
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.filters.pageSize)));
	const loading = $derived(navigating.to !== null);

	// ---- Selection, drawer, keyboard ---------------------------------------------------------
	let selectedId = $state<number | null>(null);
	let drawerRow = $state<RfqRow | null>(null);
	let profileOpen = $state(false);
	const rows = $derived(data.rows);
	const selectedIndex = $derived(rows.findIndex((r) => r.rfq.id === selectedId));
	$effect(() => {
		// Keep the drawer in sync with freshly loaded data (e.g. after a triage change).
		if (drawerRow) drawerRow = rows.find((r) => r.rfq.id === drawerRow!.rfq.id) ?? drawerRow;
	});

	function move(delta: number) {
		if (!rows.length) return;
		const i = Math.min(
			rows.length - 1,
			Math.max(0, (selectedIndex < 0 ? -1 : selectedIndex) + delta)
		);
		selectedId = rows[i].rfq.id;
		if (drawerRow) drawerRow = rows[i];
		document.querySelector(`tr[data-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' });
	}
	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
		if (e.key === 'Escape') {
			drawerRow = null;
			(t as HTMLInputElement).blur?.();
			return;
		}
		if (typing) return;
		if (e.key === '/') {
			e.preventDefault();
			document.getElementById('search')?.focus();
			return;
		}
		if (e.key === 'j') move(1);
		else if (e.key === 'k') move(-1);
		else if (e.key === 'Enter' && selectedIndex >= 0) drawerRow = rows[selectedIndex];
		else if (e.key === 'o' && selectedIndex >= 0)
			window.open(rows[selectedIndex].rfq.dibbsUrl, '_blank', 'noopener');
		else if (e.key === 'i' && selectedIndex >= 0)
			triage(
				rows[selectedIndex],
				rows[selectedIndex].triageState === 'interested' ? null : 'interested'
			);
		else if (e.key === 'x' && selectedIndex >= 0)
			triage(rows[selectedIndex], rows[selectedIndex].triageState === 'passed' ? null : 'passed');
		else if (e.key === 'r' && !e.metaKey && !e.ctrlKey) refresh();
	}

	// ---- Mutations ---------------------------------------------------------------------------
	async function triage(
		row: RfqRow,
		state: 'interested' | 'passed' | 'quoted' | null,
		note?: string
	) {
		row.triageState = state; // optimistic
		if (note !== undefined) row.triageNote = note;
		await fetch('/api/triage', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ rfqId: row.rfq.id, state, note })
		});
		await invalidateAll();
	}

	let syncing = $state(false);
	let pollTimer: ReturnType<typeof setTimeout> | undefined;
	async function poll() {
		const res = await fetch('/api/refresh');
		const { running, latest } = await res.json();
		await invalidateAll();
		if (running || latest?.status === 'running') pollTimer = setTimeout(poll, 3000);
		else syncing = false;
	}
	async function refresh() {
		if (syncing) return;
		syncing = true;
		const res = await fetch('/api/refresh', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		});
		if (res.status === 409 || res.ok) pollTimer = setTimeout(poll, 1500);
		else syncing = false;
	}
	$effect(() => {
		if (data.runs.latest?.status === 'running' && !syncing) {
			syncing = true;
			pollTimer = setTimeout(poll, 2000);
		}
		return () => clearTimeout(pollTimer);
	});
</script>

<svelte:head><title>Solicitation Browser · {fmtInt.format(data.total)} RFQs</title></svelte:head>
<svelte:window onkeydown={onKey} />

<div class="flex h-screen flex-col bg-gray-50 text-[13px] text-gray-900">
	<Header
		latest={data.runs.latest}
		lastOk={data.runs.lastOk}
		totals={data.totals}
		total={data.total}
		q={data.filters.q}
		mine={data.filters.mine}
		mineAvailable={data.mineDefault}
		{syncing}
		onSearch={(q) => apply({ q })}
		onToggleMine={() => apply({ mine: !data.filters.mine })}
		onRefresh={refresh}
		onProfile={() => (profileOpen = true)}
	/>

	<div class="flex min-h-0 flex-1">
		<FilterSidebar
			filters={data.filters}
			facets={data.facets}
			hasProfile={data.mineDefault}
			onChange={(p) => apply(p)}
			onClear={clearAll}
		/>

		<main class="flex min-w-0 flex-1 flex-col">
			<div class="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5">
				{#if data.filters.mine && data.mineDefault}
					<span
						class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200"
						>My profile applied</span
					>
				{/if}
				{#each chips as chip (chip.key + (chip.value ?? ''))}
					<button
						type="button"
						class="group inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-200"
						onclick={() => removeChip(chip.key, chip.value)}
					>
						{chip.label} <span class="text-gray-400 group-hover:text-gray-700">×</span>
					</button>
				{/each}
				{#if !chips.length}<span class="text-xs text-gray-400"
						>Open RFQs, not expired{data.filters.state === 'unreviewed' ? ', unreviewed' : ''}</span
					>{/if}
				<div class="ml-auto flex items-center gap-2 text-xs text-gray-500">
					<span class="tabular-nums">{fmtInt.format(data.total)} results</span>
					<label class="flex items-center gap-1"
						>Sort
						<select
							value={data.filters.sort}
							onchange={(e) =>
								apply({ sort: (e.target as HTMLSelectElement).value as Filters['sort'] })}
							class="rounded border-gray-300 py-0.5 pr-7 text-xs"
						>
							{#each SORTS as s (s)}<option value={s}>{SORT_LABELS[s]}</option>{/each}
						</select>
					</label>
				</div>
			</div>

			<div class="min-h-0 flex-1 overflow-auto">
				{#if rows.length}
					<RfqTable
						{rows}
						{selectedId}
						{loading}
						onSelect={(id) => (selectedId = id)}
						onOpen={(row) => {
							selectedId = row.rfq.id;
							drawerRow = row;
						}}
						onTriage={triage}
					/>
				{:else}
					<div class="mx-auto mt-16 max-w-md text-center">
						<p class="text-sm font-medium text-gray-700">
							{data.totals.total === 0 ? 'No RFQs loaded yet.' : 'No RFQs match these filters.'}
						</p>
						<p class="mt-1 text-xs text-gray-500">
							{#if data.totals.total === 0}
								{syncing || data.runs.latest?.status === 'running'
									? 'The first sync from DIBBS is running — this view fills in automatically.'
									: 'Press Refresh to pull today’s solicitations from DIBBS.'}
							{:else}Try widening the filters:{/if}
						</p>
						{#if data.totals.total > 0}
							<div class="mt-3 flex flex-wrap justify-center gap-2">
								{#if data.filters.due !== 'all'}<button
										type="button"
										class="btn"
										onclick={() => apply({ due: 'all' })}>Any return date</button
									>{/if}
								{#if data.filters.fsc.length}<button
										type="button"
										class="btn"
										onclick={() => apply({ fsc: [] })}>Clear FSC</button
									>{/if}
								{#if data.filters.state !== 'all'}<button
										type="button"
										class="btn"
										onclick={() => apply({ state: 'all' })}>Include reviewed</button
									>{/if}
								{#if data.filters.mine}<button
										type="button"
										class="btn"
										onclick={() => apply({ mine: false })}>Show all</button
									>{/if}
								{#if data.filters.status !== 'all'}<button
										type="button"
										class="btn"
										onclick={() => apply({ status: 'all' })}>Include removed & expired</button
									>{/if}
								<button type="button" class="btn" onclick={clearAll}>Clear all</button>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<div
				class="flex items-center justify-between border-t border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600"
			>
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="btn"
						disabled={data.filters.page <= 1}
						onclick={() => apply({ page: data.filters.page - 1 }, false)}>‹ Prev</button
					>
					<span class="tabular-nums"
						>Page {fmtInt.format(data.filters.page)} of {fmtInt.format(totalPages)}</span
					>
					<button
						type="button"
						class="btn"
						disabled={data.filters.page >= totalPages}
						onclick={() => apply({ page: data.filters.page + 1 }, false)}>Next ›</button
					>
				</div>
				<label class="flex items-center gap-1"
					>Rows
					<select
						value={String(data.filters.pageSize)}
						onchange={(e) => apply({ pageSize: Number((e.target as HTMLSelectElement).value) })}
						class="rounded border-gray-300 py-0.5 pr-7 text-xs"
					>
						{#each [50, 100, 200] as n (n)}<option value={String(n)}>{n}</option>{/each}
					</select>
				</label>
				<span class="text-gray-400"
					>j/k move · Enter details · o DIBBS · i ★ · x ✕ · / search · r refresh</span
				>
			</div>
		</main>
	</div>
</div>

{#if drawerRow}
	<RfqDrawer row={drawerRow} onClose={() => (drawerRow = null)} onTriage={triage} />
{/if}

{#if profileOpen}
	<ProfileDialog
		profile={data.profile}
		open={profileOpen}
		onClose={() => (profileOpen = false)}
		onSaved={async () => {
			profileOpen = false;
			await invalidateAll();
			await goto('?', { refreshAll: true });
		}}
	/>
{/if}
