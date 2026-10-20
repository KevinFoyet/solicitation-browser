<script lang="ts">
	import type { RfqRow } from '#lib/server/queries/rfqs.js';
	import {
		dueLabel,
		dueTone,
		fmtDate,
		fmtInt,
		officeHint,
		SET_ASIDE_LONG,
		SET_ASIDE_SHORT
	} from '#lib/ui.js';

	let {
		rows,
		selectedId,
		loading,
		onSelect,
		onOpen,
		onTriage
	}: {
		rows: RfqRow[];
		selectedId: number | null;
		loading: boolean;
		onSelect: (id: number) => void;
		onOpen: (row: RfqRow) => void;
		onTriage: (row: RfqRow, state: 'interested' | 'passed' | null) => void;
	} = $props();

	const nsnUrl = (digits: string) =>
		`https://www.dibbs.bsm.dla.mil/RFQ/RFQNsn.aspx?value=${digits}&category=issue&Scope=`;
</script>

<div class="relative overflow-x-auto {loading ? 'opacity-60 transition-opacity' : ''}">
	<table class="w-full border-collapse text-[12.5px]">
		<thead
			class="sticky top-0 z-10 bg-gray-50 text-left text-[11px] font-medium tracking-wide text-gray-500 uppercase"
		>
			<tr>
				<th class="th w-8"></th>
				<th class="th">NSN / Part</th>
				<th class="th">Nomenclature</th>
				<th class="th">Solicitation</th>
				<th class="th text-right">Qty</th>
				<th class="th">Set-aside</th>
				<th class="th text-center">Docs</th>
				<th class="th">Office</th>
				<th class="th">Issued</th>
				<th class="th">Return by</th>
				<th class="th">Status</th>
				<th class="th text-right">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.rfq.id)}
				{@const r = row.rfq}
				<tr
					class="cursor-pointer border-b border-gray-100 odd:bg-white even:bg-gray-50/60 hover:bg-blue-50/60 {selectedId ===
					r.id
						? 'bg-blue-50! ring-1 ring-blue-300 ring-inset'
						: ''} {row.triageState === 'passed' ? 'text-gray-400' : ''}"
					onclick={() => onOpen(row)}
					onmouseenter={() => onSelect(r.id)}
					data-id={r.id}
				>
					<td class="td">
						{#if row.isNew}<span
								class="rounded bg-blue-600 px-1 py-px text-[9px] font-semibold text-white">NEW</span
							>{/if}
						{#if row.triageState === 'interested'}<span title="Interested" class="text-amber-500"
								>★</span
							>{/if}
						{#if row.triageState === 'quoted'}<span title="Quoted" class="text-emerald-600">✓</span
							>{/if}
					</td>
					<td class="td font-mono whitespace-nowrap">
						{#if r.nsnDigits}
							<a
								href={nsnUrl(r.nsnDigits)}
								target="_blank"
								rel="noopener"
								class="hover:underline"
								onclick={(e) => e.stopPropagation()}
								title="NSN view on DIBBS">{r.nsn}</a
							>
						{:else}
							<span title="Part number">{r.nsn}</span>
						{/if}
						{#if r.fsc}<span class="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500"
								>{r.fsc}</span
							>{/if}
					</td>
					<td class="td max-w-[220px] truncate" title={r.nomenclature ?? ''}
						>{r.nomenclature ?? '—'}</td
					>
					<td class="td font-mono whitespace-nowrap">
						{r.solicitationFmt}
						<span class="ml-1 text-[10px] text-gray-400">{r.purchaseRequest}</span>
					</td>
					<td class="td text-right whitespace-nowrap tabular-nums">
						{r.quantity != null ? fmtInt.format(r.quantity) : '—'}
						{#if r.unitOfIssue}<span class="text-[10px] text-gray-400">{r.unitOfIssue}</span>{/if}
					</td>
					<td class="td">
						{#if r.setAsideCode}
							<span
								class="rounded px-1.5 py-px text-[10px] font-medium {r.setAsideCode === 'N'
									? 'bg-gray-100 text-gray-600'
									: 'bg-violet-100 text-violet-800'}"
								title={SET_ASIDE_LONG[r.setAsideCode]}>{SET_ASIDE_SHORT[r.setAsideCode]}</span
							>
						{:else}
							<span class="text-gray-300">?</span>
						{/if}
					</td>
					<td class="td text-center">
						{#if r.hasTechDocs}
							<a
								href={r.techDocsUrl ?? r.dibbsUrl}
								target="_blank"
								rel="noopener"
								class="text-blue-600"
								title="Technical documents"
								onclick={(e) => e.stopPropagation()}>✓</a
							>
						{:else if r.hasTechDocs === false}<span class="text-gray-300">–</span>{:else}<span
								class="text-gray-300">?</span
							>{/if}
					</td>
					<td class="td whitespace-nowrap" title={officeHint(r.issuingOffice)}>
						<span class="font-mono">{r.issuingOffice}</span>
						<span class="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500">{r.solType}</span>
					</td>
					<td class="td whitespace-nowrap tabular-nums">{fmtDate(r.issuedDate ?? r.postedDate)}</td>
					<td class="td whitespace-nowrap tabular-nums">
						{fmtDate(r.returnBy)}
						<span
							class="ml-1 rounded px-1.5 py-px text-[10px] font-medium tabular-nums {dueTone(
								row.daysLeft
							)}">{dueLabel(row.daysLeft)}</span
						>
					</td>
					<td class="td">
						<span class={r.status === 'Open' ? 'text-emerald-700' : 'text-gray-400'}
							>{r.status}</span
						>
					</td>
					<td class="td text-right whitespace-nowrap">
						<a
							href={r.dibbsUrl}
							target="_blank"
							rel="noopener"
							class="link"
							onclick={(e) => e.stopPropagation()}>DIBBS ↗</a
						>
						{#if r.pdfUrl}<a
								href={r.pdfUrl}
								target="_blank"
								rel="noopener"
								class="link ml-1.5"
								onclick={(e) => e.stopPropagation()}>PDF ↗</a
							>{/if}
						<button
							type="button"
							class="ml-1.5 {row.triageState === 'interested'
								? 'text-amber-500'
								: 'text-gray-300 hover:text-amber-500'}"
							title="Interested (i)"
							onclick={(e) => {
								e.stopPropagation();
								onTriage(row, row.triageState === 'interested' ? null : 'interested');
							}}>★</button
						>
						<button
							type="button"
							class="ml-1 {row.triageState === 'passed'
								? 'text-gray-700'
								: 'text-gray-300 hover:text-gray-700'}"
							title="Pass (x)"
							onclick={(e) => {
								e.stopPropagation();
								onTriage(row, row.triageState === 'passed' ? null : 'passed');
							}}>✕</button
						>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
