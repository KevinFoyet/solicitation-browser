<script lang="ts">
	import type { RfqRow } from '#lib/server/queries/rfqs.js';
	import {
		dueLabel,
		dueTone,
		fmtDate,
		fmtInt,
		officeHint,
		SET_ASIDE_LONG,
		SOL_TYPE_LONG
	} from '#lib/ui.js';

	let {
		row,
		onClose,
		onTriage
	}: {
		row: RfqRow;
		onClose: () => void;
		onTriage: (
			row: RfqRow,
			state: 'interested' | 'passed' | 'quoted' | null,
			note?: string
		) => void;
	} = $props();

	// eslint-disable-next-line svelte/prefer-writable-derived -- editable draft that follows the row
	let note = $state('');
	$effect(() => {
		note = row.triageNote ?? '';
	});
	const r = $derived(row.rfq);
	const quoteUrl = $derived(
		`https://www.dibbs.bsm.dla.mil/RA/Quote/QuoteFrm.aspx?sn=${r.solicitation}`
	);
	const fields = $derived<[string, string][]>([
		['Purchase request', r.purchaseRequest || '—'],
		['Quantity', r.quantity != null ? `${fmtInt.format(r.quantity)} ${r.unitOfIssue ?? ''}` : '—'],
		['FSC', r.fsc ?? '—'],
		[
			'Set-aside',
			r.setAsideCode
				? `${SET_ASIDE_LONG[r.setAsideCode]} (${r.setAsideCode})`
				: (r.setAsideLabel ?? 'Unknown')
		],
		[
			'Issuing office',
			`${r.issuingOffice} ${officeHint(r.issuingOffice) ? `· ${officeHint(r.issuingOffice)}` : ''}`
		],
		['Solicitation type', SOL_TYPE_LONG[r.solType ?? ''] ?? r.solType ?? '—'],
		['Buyer code', r.buyerCode ?? '—'],
		['AMSC', r.amsc ?? '—'],
		['Tech docs', r.hasTechDocs == null ? 'Unknown' : r.hasTechDocs ? 'Yes' : 'None'],
		['Issued', fmtDate(r.issuedDate)],
		['Posted', fmtDate(r.postedDate)],
		['Status', r.status],
		['Source', r.source === 'listing' ? 'DIBBS listing page' : 'DIBBS daily index file'],
		['First seen', new Date(r.firstSeenAt).toLocaleString()],
		['Last seen', new Date(r.lastSeenAt).toLocaleString()]
	]);
</script>

<aside
	class="fixed inset-y-0 right-0 z-30 flex w-[420px] max-w-full flex-col border-l border-gray-200 bg-white shadow-xl"
	aria-label="RFQ details"
>
	<div class="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
		<div class="min-w-0">
			<div class="font-mono text-sm font-semibold">{r.solicitationFmt}</div>
			<div class="truncate text-[13px] text-gray-700">{r.nomenclature ?? '—'}</div>
			<div class="mt-0.5 font-mono text-xs text-gray-500">{r.nsn}</div>
		</div>
		<button
			type="button"
			class="text-xl leading-none text-gray-400 hover:text-gray-700"
			onclick={onClose}
			aria-label="Close (Esc)">×</button
		>
	</div>

	<div class="flex items-center gap-2 border-b border-gray-200 px-4 py-2.5 text-[13px]">
		<span class="rounded px-1.5 py-px text-[11px] font-medium {dueTone(row.daysLeft)}"
			>Return by {fmtDate(r.returnBy)} · {dueLabel(row.daysLeft)}</span
		>
		{#if row.isNew}<span class="rounded bg-blue-600 px-1 py-px text-[10px] font-semibold text-white"
				>NEW</span
			>{/if}
	</div>

	<div class="flex flex-wrap gap-2 border-b border-gray-200 px-4 py-3">
		<a href={r.dibbsUrl} target="_blank" rel="noopener" class="btn btn-primary">Open on DIBBS ↗</a>
		{#if r.pdfUrl}<a href={r.pdfUrl} target="_blank" rel="noopener" class="btn"
				>Solicitation PDF ↗</a
			>{/if}
		<a href={quoteUrl} target="_blank" rel="noopener" class="btn" title="Requires your DIBBS login"
			>Quote on DIBBS ↗</a
		>
	</div>

	<dl
		class="grid flex-1 grid-cols-[130px_1fr] gap-x-3 gap-y-1.5 overflow-y-auto px-4 py-3 text-[13px]"
	>
		{#each fields as [k, v] (k)}
			<dt class="text-gray-500">{k}</dt>
			<dd class="text-gray-900">{v}</dd>
		{/each}
	</dl>

	<div class="space-y-2 border-t border-gray-200 px-4 py-3">
		<div class="flex gap-2">
			<button
				type="button"
				class="btn flex-1 {row.triageState === 'interested' ? 'ring-2 ring-amber-400' : ''}"
				onclick={() => onTriage(row, row.triageState === 'interested' ? null : 'interested')}
				>★ Interested</button
			>
			<button
				type="button"
				class="btn flex-1 {row.triageState === 'passed' ? 'ring-2 ring-gray-500' : ''}"
				onclick={() => onTriage(row, row.triageState === 'passed' ? null : 'passed')}>✕ Pass</button
			>
			<button
				type="button"
				class="btn flex-1 {row.triageState === 'quoted' ? 'ring-2 ring-emerald-500' : ''}"
				onclick={() => onTriage(row, row.triageState === 'quoted' ? null : 'quoted')}
				>✓ Quoted</button
			>
		</div>
		<textarea
			rows="3"
			placeholder="Notes (saved on blur)"
			bind:value={note}
			onblur={() => {
				if (note !== (row.triageNote ?? ''))
					onTriage(
						row,
						(row.triageState as 'interested' | 'passed' | 'quoted' | null) ?? 'interested',
						note
					);
			}}
			class="w-full rounded-md border-gray-300 text-[13px]"></textarea>
		<p class="text-[11px] text-gray-400">
			Keys: j/k move · Enter open · o DIBBS · i interested · x pass · / search · Esc close
		</p>
	</div>
</aside>
