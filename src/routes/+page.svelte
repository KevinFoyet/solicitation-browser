<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const fmt = new Intl.NumberFormat('en-US');
	const syncLabel = $derived.by(() => {
		const run = data.lastRun;
		if (!run) return 'Never synced';
		const at = new Date(run.finishedAt ?? run.startedAt).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
		return run.status === 'running'
			? 'Syncing…'
			: `${run.status === 'ok' ? 'Synced' : 'Sync failed'} ${at}`;
	});
</script>

<svelte:head>
	<title>Solicitation Browser</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 text-[13px] text-gray-900">
	<header class="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-2.5">
		<div class="flex items-center gap-4">
			<div>
				<h1 class="text-sm font-semibold tracking-tight">Solicitation Browser</h1>
				<p class="text-xs text-gray-500">DLA DIBBS RFQs</p>
			</div>
			<div
				class="flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs {data.lastRun
					?.status === 'failed'
					? 'border-amber-300 bg-amber-50 text-amber-800'
					: 'border-gray-200 bg-gray-50 text-gray-700'}"
			>
				<span
					class="inline-block h-2 w-2 rounded-full {data.lastRun?.status === 'ok'
						? 'bg-emerald-500'
						: data.lastRun?.status === 'failed'
							? 'bg-amber-500'
							: 'bg-gray-400'}"
				></span>
				<span>{syncLabel}</span>
				<span class="text-gray-400">·</span>
				<span>{fmt.format(data.totals.today)} RFQs today</span>
				<span class="text-gray-400">·</span>
				<span>{fmt.format(data.totals.total)} total</span>
			</div>
		</div>
	</header>

	<main class="p-4">
		<p class="text-gray-500">
			{#if data.totals.total === 0}
				No RFQs loaded yet. The ingestion job will fill this view from DIBBS.
			{:else}
				{fmt.format(data.totals.open)} open RFQs.
			{/if}
		</p>
	</main>
</div>
