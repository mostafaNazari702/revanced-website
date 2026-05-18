import { RV_API_URL } from '$env/static/public';
import type {
	About,
	TeamMember,
	ManagerRelease,
	Contributable,
	Announcement,
	TaggedLatestAnnouncements
} from './types';
import {
	AboutSchema,
	TeamMembersSchema,
	ManagerReleaseSchema,
	ContributablesSchema,
	AnnouncementsSchema,
	LatestAnnouncementsSchema
} from './schemas';
import type { z } from 'zod';

const API_VERSION = 'v5';
const DEFAULT_CACHE_TTL_SECONDS = 300;
const CACHE_STORED_AT_HEADER = 'x-rv-cache-stored-at';
const CACHE_TTL_HEADER = 'x-rv-cache-ttl';
const STALE_CACHE_CONTROL = 'public, max-age=604800';

function buildServerUrl(endpoint: string): string {
	endpoint = endpoint.replace(/^\/+/, '');
	return `${RV_API_URL}/${API_VERSION}/${endpoint}`;
}

function getEdgeCache(): Cache | null {
	const c = (globalThis as { caches?: { default?: Cache } }).caches?.default;
	return c ?? null;
}

function parseCacheControl(response: Response): {
	maxAge: number | null;
	noStore: boolean;
	noCache: boolean;
} {
	const cc = response.headers.get('Cache-Control')?.toLowerCase() ?? '';
	const noStore = /\bno-store\b/.test(cc);
	const noCache = /\bno-cache\b/.test(cc);
	const m = cc.match(/\bmax-age\s*=\s*(\d+)/);
	return { maxAge: m ? parseInt(m[1], 10) : null, noStore, noCache };
}

function isFresh(response: Response): boolean {
	const storedAt = response.headers.get(CACHE_STORED_AT_HEADER);
	const ttl = response.headers.get(CACHE_TTL_HEADER);
	if (!storedAt || !ttl) return false;
	return Date.now() - parseInt(storedAt, 10) < parseInt(ttl, 10) * 1000;
}

async function storeInEdgeCache(
	cache: Cache,
	cacheKey: Request,
	response: Response,
	ttlSeconds: number
): Promise<void> {
	const body = await response.clone().arrayBuffer();
	const headers = new Headers(response.headers);
	headers.set(CACHE_STORED_AT_HEADER, Date.now().toString());
	headers.set(CACHE_TTL_HEADER, ttlSeconds.toString());
	headers.set('Cache-Control', STALE_CACHE_CONTROL);
	const cacheable = new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers
	});
	await cache.put(cacheKey, cacheable);
}

async function fetchWithEdgeCache(url: string, fetchFn: typeof fetch): Promise<Response> {
	const cache = getEdgeCache();
	if (!cache) return fetchFn(url);

	const cacheKey = new Request(url);
	const cached = await cache.match(cacheKey);
	if (cached && isFresh(cached)) {
		return cached;
	}

	try {
		const fresh = await fetchFn(url);
		if (fresh.ok) {
			const { maxAge, noStore, noCache } = parseCacheControl(fresh);
			if (!noStore) {
				const ttl = noCache ? 0 : (maxAge ?? DEFAULT_CACHE_TTL_SECONDS);
				await storeInEdgeCache(cache, cacheKey, fresh, ttl);
			}
			return fresh;
		}
		if (fresh.status >= 500 && cached) {
			return cached;
		}
		return fresh;
	} catch (err) {
		if (cached) return cached;
		throw err;
	}
}

async function fetchJsonServer<T>(
	endpoint: string,
	schema: z.ZodType<T>,
	fetchFn: typeof fetch = fetch
): Promise<T> {
	const url = buildServerUrl(endpoint);
	const response = await fetchWithEdgeCache(url, fetchFn);

	if (!response.ok) {
		throw new Error(`API error: ${response.status} ${response.statusText}`);
	}

	const data = await response.json();
	const result = schema.safeParse(data);
	if (!result.success) {
		console.error(`Validation failed for ${endpoint}:`, result.error.issues);
		throw new Error(`Invalid response from ${endpoint}`);
	}
	return result.data;
}

export async function fetchAbout(fetchFn?: typeof fetch): Promise<About> {
	return fetchJsonServer('about', AboutSchema, fetchFn);
}

export async function fetchTeam(fetchFn?: typeof fetch): Promise<TeamMember[]> {
	return fetchJsonServer('team', TeamMembersSchema, fetchFn);
}

export async function fetchManager(fetchFn?: typeof fetch): Promise<ManagerRelease> {
	return fetchJsonServer('manager', ManagerReleaseSchema, fetchFn);
}

export async function fetchContributors(fetchFn?: typeof fetch): Promise<Contributable[]> {
	return fetchJsonServer('contributors', ContributablesSchema, fetchFn);
}

export async function fetchAnnouncements(fetchFn?: typeof fetch): Promise<Announcement[]> {
	return fetchJsonServer('announcements', AnnouncementsSchema, fetchFn);
}

export async function fetchLatestAnnouncements(
	fetchFn?: typeof fetch
): Promise<TaggedLatestAnnouncements[]> {
	return fetchJsonServer('announcements/latest', LatestAnnouncementsSchema, fetchFn);
}
