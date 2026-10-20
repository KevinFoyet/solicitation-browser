<script lang="ts">
	import { DUES, STATES, STATUSES, TECH_DOCS, type Filters } from '#lib/filters.js';
	import { fmtInt, officeHint, SET_ASIDE_LONG, SET_ASIDE_SHORT, SOL_TYPE_LONG } from '#lib/ui.js';
	import type { Facet } from '#lib/server/queries/rfqs.js';

	let {
		filters,
		facets,
		hasProfile,
		onChange,
		onClear
	}: {
		filters: Filters;
		facets: { fsc: Facet[]; office: Facet[]; setAside: Facet[]; solType: Facet[] };
		hasProfile: boolean;
		onChange: (patch: Partial<Filters>) => void;
		onClear: () => void;
	} = $props();

	let fscQuery = $state('');
	let showAllFsc = $state(false);
	const fscOptions = $derived.by(() => {
		const q = fscQuery.trim();
		const list = q ? facets.fsc.filter((f) => f.value.startsWith(q)) : facets.fsc;
		return showAllFsc || q ? list : list.slice(0, 15);
	});

	function toggle(key: 'fsc' | 'office' | 'setAside' | 'solType', value: string) {
		const cur = filters[key];
		onChange({ [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
	}
	const num = (e: Event) => {
		const v = (e.target as HTMLInputElement).value;
		return v === '' ? null : Math.max(0, Number(v) || 0);
	};
</script>

<aside
	class="w-[260px] shrink-0 space-y-5 overflow-y-auto border-r border-gray-200 bg-white px-3 py-3 text-[13px]"
>
	<div class="flex items-center justify-between">
		<h2 class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Filters</h2>
		<button type="button" class="text-xs text-blue-600 hover:underline" onclick={onClear}
			>Clear all</button
		>
	</div>

	<section>
		<h3 class="label">Status</h3>
		<div class="seg">
			{#each STATUSES as s (s)}
				<button
					type="button"
					class:active={filters.status === s}
					onclick={() => onChange({ status: s })}>{s}</button
				>
			{/each}
		</div>
	</section>

	<section>
		<h3 class="label">Return by within</h3>
		<div class="seg">
			{#each DUES as d (d)}
				<button type="button" class:active={filters.due === d} onclick={() => onChange({ due: d })}
					>{d === 'all' ? 'any' : `${d}d`}</button
				>
			{/each}
		</div>
	</section>

	<section>
		<h3 class="label">FSC <span class="font-normal text-gray-400">(NSN digits 1–4)</span></h3>
		<input
			type="text"
			placeholder="Filter FSCs…"
			bind:value={fscQuery}
			class="mb-1.5 w-full rounded border-gray-300 py-1 text-xs"
		/>
		<ul class="max-h-56 space-y-0.5 overflow-y-auto">
			{#each fscOptions as f (f.value)}
				<li>
					<label class="row">
						<input
							type="checkbox"
							checked={filters.fsc.includes(f.value)}
							onchange={() => toggle('fsc', f.value)}
						/>
						<span class="font-mono">{f.value}</span>
						<span class="count">{fmtInt.format(f.count)}</span>
					</label>
				</li>
			{/each}
			{#if !fscOptions.length}<li class="px-1 text-xs text-gray-400">No FSCs match.</li>{/if}
		</ul>
		{#if !showAllFsc && !fscQuery && facets.fsc.length > 15}
			<button
				type="button"
				class="mt-1 text-xs text-blue-600 hover:underline"
				onclick={() => (showAllFsc = true)}>Show all {facets.fsc.length}</button
			>
		{/if}
	</section>

	<section>
		<h3 class="label">Set-aside</h3>
		<ul class="space-y-0.5">
			{#each facets.setAside as f (f.value)}
				<li>
					<label class="row" title={SET_ASIDE_LONG[f.value] ?? f.value}>
						<input
							type="checkbox"
							checked={filters.setAside.includes(f.value)}
							onchange={() => toggle('setAside', f.value)}
						/>
						<span>{SET_ASIDE_SHORT[f.value] ?? 'Unknown'}</span>
						<span class="count">{fmtInt.format(f.count)}</span>
					</label>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h3 class="label">Quantity</h3>
		<div class="flex items-center gap-1.5">
			<input
				type="number"
				min="0"
				placeholder="min"
				value={filters.qtyMin ?? ''}
				onchange={(e) => onChange({ qtyMin: num(e) })}
				class="w-full rounded border-gray-300 py-1 text-xs"
			/>
			<span class="text-gray-400">–</span>
			<input
				type="number"
				min="0"
				placeholder="max"
				value={filters.qtyMax ?? ''}
				onchange={(e) => onChange({ qtyMax: num(e) })}
				class="w-full rounded border-gray-300 py-1 text-xs"
			/>
		</div>
	</section>

	<section>
		<h3 class="label">Tech docs</h3>
		<div class="seg">
			{#each TECH_DOCS as t (t)}
				<button
					type="button"
					class:active={filters.techDocs === t}
					onclick={() => onChange({ techDocs: t })}>{t === 'all' ? 'any' : t}</button
				>
			{/each}
		</div>
	</section>

	<section>
		<h3 class="label">Solicitation type</h3>
		<ul class="space-y-0.5">
			{#each facets.solType as f (f.value)}
				<li>
					<label class="row" title={SOL_TYPE_LONG[f.value] ?? f.value}>
						<input
							type="checkbox"
							checked={filters.solType.includes(f.value)}
							onchange={() => toggle('solType', f.value)}
						/>
						<span>{SOL_TYPE_LONG[f.value]?.split(' — ')[0] ?? f.value}</span>
						<span class="count">{fmtInt.format(f.count)}</span>
					</label>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h3 class="label">Issuing office</h3>
		<ul class="max-h-48 space-y-0.5 overflow-y-auto">
			{#each facets.office as f (f.value)}
				<li>
					<label class="row" title={officeHint(f.value)}>
						<input
							type="checkbox"
							checked={filters.office.includes(f.value)}
							onchange={() => toggle('office', f.value)}
						/>
						<span class="font-mono">{f.value}</span>
						<span class="truncate text-[11px] text-gray-400">{officeHint(f.value)}</span>
						<span class="count">{fmtInt.format(f.count)}</span>
					</label>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h3 class="label">Issued between</h3>
		<div class="flex items-center gap-1.5">
			<input
				type="date"
				value={filters.issuedFrom ?? ''}
				onchange={(e) => onChange({ issuedFrom: (e.target as HTMLInputElement).value || null })}
				class="w-full rounded border-gray-300 py-1 text-xs"
			/>
			<input
				type="date"
				value={filters.issuedTo ?? ''}
				onchange={(e) => onChange({ issuedTo: (e.target as HTMLInputElement).value || null })}
				class="w-full rounded border-gray-300 py-1 text-xs"
			/>
		</div>
	</section>

	<section>
		<h3 class="label">Triage</h3>
		<select
			value={filters.state}
			onchange={(e) =>
				onChange({ state: (e.target as HTMLSelectElement).value as Filters['state'] })}
			class="w-full rounded border-gray-300 py-1 text-xs"
		>
			{#each STATES as s (s)}<option value={s}>{s}</option>{/each}
		</select>
		<label class="row mt-2">
			<input
				type="checkbox"
				checked={filters.newOnly}
				onchange={() => onChange({ newOnly: !filters.newOnly })}
			/>
			<span>New since last sync</span>
		</label>
		{#if hasProfile}
			<label class="row mt-1">
				<input
					type="checkbox"
					checked={filters.mine}
					onchange={() => onChange({ mine: !filters.mine })}
				/>
				<span>Only my profile (FSCs, watchlist, eligibility)</span>
			</label>
		{/if}
	</section>
</aside>
