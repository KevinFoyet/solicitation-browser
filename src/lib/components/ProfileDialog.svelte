<script lang="ts">
	import type { VendorProfile } from '#lib/server/db/schema.js';
	import { SET_ASIDE_LONG } from '#lib/ui.js';

	let {
		profile,
		open,
		onClose,
		onSaved
	}: { profile: VendorProfile | null; open: boolean; onClose: () => void; onSaved: () => void } =
		$props();

	let dialog: HTMLDialogElement;
	let name = $state('');
	let fscs = $state('');
	let watchNsns = $state('');
	let setAsideCodes = $state<string[]>([]);
	let minQty = $state('');
	let error = $state('');
	let saving = $state(false);

	$effect(() => {
		if (open) {
			name = profile?.name ?? '';
			fscs = (profile?.fscs ?? []).join(', ');
			watchNsns = (profile?.watchNsns ?? []).join('\n');
			setAsideCodes = [...(profile?.setAsideCodes ?? [])];
			minQty = profile?.minQty?.toString() ?? '';
			dialog?.showModal();
		} else dialog?.close();
	});

	async function save(e: Event) {
		e.preventDefault();
		saving = true;
		error = '';
		const res = await fetch('/api/profile', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				name,
				fscs: fscs.split(/[\s,]+/).filter(Boolean),
				watchNsns: watchNsns.split(/[\s,]+/).filter(Boolean),
				setAsideCodes,
				minQty: minQty === '' ? null : Number(minQty)
			})
		});
		saving = false;
		if (!res.ok) {
			error = (await res.json().catch(() => ({ message: res.statusText }))).message;
			return;
		}
		onSaved();
	}
	const toggleCode = (c: string) =>
		(setAsideCodes = setAsideCodes.includes(c)
			? setAsideCodes.filter((x) => x !== c)
			: [...setAsideCodes, c]);
</script>

<dialog
	bind:this={dialog}
	onclose={onClose}
	class="w-[520px] max-w-[95vw] rounded-lg p-0 shadow-2xl backdrop:bg-black/30"
>
	<form onsubmit={save} class="space-y-4 p-5 text-[13px]">
		<div>
			<h2 class="text-sm font-semibold">My vendor profile</h2>
			<p class="text-xs text-gray-500">
				Drives the default “mine” view: your product categories, watchlist, and eligibility.
			</p>
		</div>
		<label class="block">
			<span class="field-label">Company</span>
			<input type="text" bind:value={name} class="field-input" placeholder="Acme Parts LLC" />
		</label>
		<label class="block">
			<span class="field-label"
				>FSCs you sell <span class="text-gray-400">(4 digits, comma-separated)</span></span
			>
			<input
				type="text"
				bind:value={fscs}
				class="field-input font-mono"
				placeholder="6515, 4730, 5340"
			/>
		</label>
		<label class="block">
			<span class="field-label"
				>Watchlist NSNs <span class="text-gray-400">(quoted or won before; one per line)</span
				></span
			>
			<textarea
				rows="3"
				bind:value={watchNsns}
				class="field-input font-mono"
				placeholder="8475-01-389-6117"></textarea>
		</label>
		<fieldset>
			<span class="field-label"
				>Set-asides you are eligible for <span class="text-gray-400">(none checked = all)</span
				></span
			>
			<div class="mt-1 grid grid-cols-2 gap-1">
				{#each Object.entries(SET_ASIDE_LONG).filter(([c]) => c !== 'unknown') as [code, label] (code)}
					<label class="flex items-center gap-2"
						><input
							type="checkbox"
							checked={setAsideCodes.includes(code)}
							onchange={() => toggleCode(code)}
							class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
						/> <span>{label}</span></label
					>
				{/each}
			</div>
		</fieldset>
		<label class="block">
			<span class="field-label">Minimum quantity worth quoting</span>
			<input type="number" min="0" bind:value={minQty} class="field-input w-32" placeholder="any" />
		</label>
		{#if error}<p class="text-xs text-red-600">{error}</p>{/if}
		<div class="flex justify-end gap-2 pt-1">
			<button type="button" class="btn" onclick={onClose}>Cancel</button>
			<button type="submit" class="btn btn-primary" disabled={saving}
				>{saving ? 'Saving…' : 'Save profile'}</button
			>
		</div>
	</form>
</dialog>
