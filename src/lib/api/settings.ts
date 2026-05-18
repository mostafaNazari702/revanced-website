import { browser } from '$app/environment';
import {
	RV_API_URL,
	RV_API_URL_FALLBACK,
	RV_STATUS_URL,
	RV_EMAIL,
	RV_DMCA_GUID,
	RV_GOOGLE_TAG_MANAGER_ID
} from '$env/static/public';

const STATUS_KEY = 'revanced_status_url';
const EMAIL_KEY = 'revanced_email';
const FALLBACK_API_URL_KEY = 'revanced_api_url_fallback';

export const DEFAULT_API_URL = RV_API_URL;
export const DEFAULT_API_URL_FALLBACK = RV_API_URL_FALLBACK;
export const DEFAULT_STATUS_URL = RV_STATUS_URL;
export const DEFAULT_EMAIL = RV_EMAIL;
export const DMCA_GUID = RV_DMCA_GUID;
export const GOOGLE_TAG_MANAGER_ID = RV_GOOGLE_TAG_MANAGER_ID;

const API_VERSION = 'v5';

function readLocal(key: string): string | null {
	if (!browser) return null;
	return localStorage.getItem(key);
}

function syncLocal(key: string, value: string | null | undefined): void {
	if (!browser) return;
	if (value) {
		localStorage.setItem(key, value);
	} else {
		localStorage.removeItem(key);
	}
}

export function populateDynamicSettings(
	aboutData: {
		status?: string;
		contact?: { email?: string };
		fallback_api_url?: string | null;
	} | null
): void {
	if (!browser || !aboutData) return;
	syncLocal(STATUS_KEY, aboutData.status);
	syncLocal(EMAIL_KEY, aboutData.contact?.email);
	syncLocal(FALLBACK_API_URL_KEY, aboutData.fallback_api_url);
}

export function getApiUrl(): string {
	return DEFAULT_API_URL;
}

export function getFallbackApiUrl(): string | null {
	const stored = readLocal(FALLBACK_API_URL_KEY);
	if (stored) return stored;
	return DEFAULT_API_URL_FALLBACK || null;
}

export function getStatusUrl(): string {
	return readLocal(STATUS_KEY) ?? DEFAULT_STATUS_URL;
}

export function getContactEmail(): string {
	return readLocal(EMAIL_KEY) ?? DEFAULT_EMAIL;
}

export function clearCacheAndReload(): void {
	if (!browser) return;

	localStorage.clear();
	sessionStorage.clear();

	sessionStorage.setItem('revanced_intentional_logout', 'true');
	location.reload();
}

export function buildUrl(endpoint: string): string {
	endpoint = endpoint.replace(/^\/+/, '');
	if (endpoint.startsWith(API_VERSION)) {
		endpoint = endpoint.split('/').slice(1).join('/');
	}

	return `${getApiUrl()}/${API_VERSION}/${endpoint}`;
}
