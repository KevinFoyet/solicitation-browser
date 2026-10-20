/**
 * HTTP session for DIBBS (ASP.NET WebForms behind a WAF).
 *
 * - The WAF rejects non-browser user agents ("Request Rejected"), so we send a desktop UA.
 * - Every host (www.dibbs…, dibbs2…) gates first access behind a DoD consent page
 *   (`/dodwarning.aspx?goto=…`). Passing it means POSTing the page's hidden WebForms fields
 *   plus `butAgree=OK` and keeping the session cookies. Cookies are per host.
 * - Native fetch does not keep cookies and drops Set-Cookie on redirects, so redirects are
 *   followed manually. It also force-adds headers (e.g. `sec-fetch-mode: cors`) that make the
 *   WAF reject form POSTs, so the transport is plain `node:https`.
 */
import https from 'node:https';

export const WWW = 'https://www.dibbs.bsm.dla.mil';
export const DL = 'https://dibbs2.bsm.dla.mil';

const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export interface SessionOptions {
	delayMs?: number;
	timeoutMs?: number;
	retries?: number;
	log?: (msg: string) => void;
}

export class DibbsError extends Error {}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Extract `<input type="hidden" name=… value=…>` pairs (WebForms viewstate etc.). */
export function hiddenFields(html: string): Record<string, string> {
	const out: Record<string, string> = {};
	const re = /<input\b[^>]*>/gi;
	for (const m of html.matchAll(re)) {
		const tag = m[0];
		if (!/type\s*=\s*["']?hidden/i.test(tag)) continue;
		const name = /name\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
		if (!name) continue;
		const value = /value\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
		out[name] = unescapeHtml(value);
	}
	return out;
}

export function unescapeHtml(s: string): string {
	return s
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&');
}

interface RawResponse {
	status: number;
	location: string | null;
	setCookies: string[];
	body: Uint8Array;
}

/** Minimal HTTPS request: exact headers, no automatic redirects, buffered body. */
function rawRequest(
	url: string,
	method: string,
	headers: Record<string, string>,
	body: string | undefined,
	timeoutMs: number
): Promise<RawResponse> {
	return new Promise((resolve, reject) => {
		const u = new URL(url);
		const req = https.request(
			{
				host: u.hostname,
				port: u.port || 443,
				path: u.pathname + u.search,
				method,
				headers,
				timeout: timeoutMs
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on('data', (c: Buffer) => chunks.push(c));
				res.on('error', reject);
				res.on('end', () =>
					resolve({
						status: res.statusCode ?? 0,
						location: res.headers.location ?? null,
						setCookies: res.headers['set-cookie'] ?? [],
						body: Buffer.concat(chunks)
					})
				);
			}
		);
		req.on('timeout', () => req.destroy(new Error(`Timeout after ${timeoutMs}ms: ${url}`)));
		req.on('error', reject);
		req.end(body);
	});
}

const isConsentPage = (html: string) =>
	/DoD\)? Warning and Consent|dodwarning\.aspx/i.test(html.slice(0, 4000)) && /butAgree/.test(html);

export class DibbsSession {
	private jar = new Map<string, Map<string, string>>(); // host -> cookie name -> value
	private lastRequestAt = 0;
	readonly requests = { count: 0 };
	private opts: Required<SessionOptions>;

	constructor(opts: SessionOptions = {}) {
		this.opts = {
			delayMs: opts.delayMs ?? 300,
			timeoutMs: opts.timeoutMs ?? 25_000,
			retries: opts.retries ?? 3,
			log: opts.log ?? (() => {})
		};
	}

	/** GET a page; transparently passes the consent banner (once per host) and retries. */
	async get(url: string): Promise<string> {
		let body = await this.request(url);
		if (isConsentPage(body)) {
			await this.consent(url, body);
			body = await this.request(url);
			if (isConsentPage(body)) throw new DibbsError(`Consent banner still shown for ${url}`);
		}
		return body;
	}

	/** POST a WebForms postback (form-urlencoded) to `url`, following redirects. */
	async postForm(url: string, fields: Record<string, string>): Promise<string> {
		const body = await this.request(url, new URLSearchParams(fields).toString());
		if (isConsentPage(body)) {
			await this.consent(url, body);
			return this.request(url, new URLSearchParams(fields).toString());
		}
		return body;
	}

	/** Accept the DoD banner: POST its hidden fields + butAgree=OK to the banner URL. */
	private async consent(originalUrl: string, bannerHtml: string) {
		const origin = new URL(originalUrl).origin;
		const action = /<form\b[^>]*action\s*=\s*["']([^"']+)["']/i.exec(bannerHtml)?.[1];
		// Banner may be served inline (relative action) or after a redirect; resolve both.
		const bannerUrl = action
			? new URL(unescapeHtml(action), `${origin}/dodwarning.aspx`).toString()
			: `${origin}/dodwarning.aspx?goto=${encodeURIComponent(new URL(originalUrl).pathname)}`;
		const fields = { ...hiddenFields(bannerHtml), butAgree: 'OK' };
		this.opts.log(`consent: ${new URL(bannerUrl).host}`);
		await this.request(bannerUrl, new URLSearchParams(fields).toString());
	}

	private async request(url: string, postBody?: string): Promise<string> {
		let attempt = 0;
		for (;;) {
			try {
				return await this.requestOnce(url, postBody);
			} catch (e) {
				attempt++;
				const retryable = !(e instanceof DibbsError) || /HTTP 5\d\d/.test(e.message);
				if (!retryable || attempt > this.opts.retries) throw e;
				const backoff = 500 * 2 ** attempt;
				this.opts.log(
					`retry ${attempt}/${this.opts.retries} after ${backoff}ms: ${(e as Error).message}`
				);
				await sleep(backoff);
			}
		}
	}

	private async requestOnce(url: string, postBody?: string): Promise<string> {
		let current = url;
		let method = postBody === undefined ? 'GET' : 'POST';
		let body = postBody;
		for (let hop = 0; hop < 6; hop++) {
			await this.politeDelay();
			const host = new URL(current).host;
			const headers: Record<string, string> = {
				'User-Agent': UA,
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9',
				// The F5 WAF in front of DIBBS rejects undici's default "gzip, deflate, br".
				'Accept-Encoding': 'identity',
				Referer: current
			};
			const cookie = this.cookieHeader(host);
			if (cookie) headers.Cookie = cookie;
			if (method === 'POST') {
				headers['Content-Type'] = 'application/x-www-form-urlencoded';
				headers['Content-Length'] = String(Buffer.byteLength(body ?? ''));
			}

			this.requests.count++;
			const res = await rawRequest(current, method, headers, body, this.opts.timeoutMs);
			this.storeCookies(host, res.setCookies);

			if (res.status >= 300 && res.status < 400) {
				if (!res.location) throw new DibbsError(`Redirect without location from ${current}`);
				current = new URL(res.location, current).toString();
				method = 'GET';
				body = undefined;
				continue;
			}
			const text = new TextDecoder('latin1').decode(res.body);
			if (res.status >= 400) throw new DibbsError(`HTTP ${res.status} from ${current}`);
			if (/<title>\s*Request Rejected\s*<\/title>/i.test(text)) {
				throw new DibbsError(`DIBBS WAF rejected the request to ${current}`);
			}
			return text;
		}
		throw new DibbsError(`Too many redirects starting at ${url}`);
	}

	private async politeDelay() {
		const wait = this.lastRequestAt + this.opts.delayMs - Date.now();
		if (wait > 0) await sleep(wait);
		this.lastRequestAt = Date.now();
	}

	private cookieHeader(host: string): string {
		const jar = this.jar.get(host);
		return jar ? [...jar].map(([k, v]) => `${k}=${v}`).join('; ') : '';
	}

	private storeCookies(host: string, setCookies: string[]) {
		if (!setCookies.length) return;
		const jar = this.jar.get(host) ?? new Map<string, string>();
		for (const sc of setCookies) {
			const [pair] = sc.split(';');
			const eq = pair.indexOf('=');
			if (eq <= 0) continue;
			jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
		}
		this.jar.set(host, jar);
	}
}
