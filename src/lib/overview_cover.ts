import { isValidOverviewCoverFileName } from '@/core/overview_layout.ts';
import services from './services.ts';
import logger from './logger.ts';

export { isValidOverviewCoverFileName };

export const OVERVIEW_COVER_CACHE_NAME: string = 'ezbookkeeping-overview-cover-cache';
export const DEFAULT_OVERVIEW_COVER_POSITION_Y: number = 50;
export const DEFAULT_OVERVIEW_COVER_OVERLAY_OPACITY: number = 35;
export const DEFAULT_OVERVIEW_COVER_TEXT_COLOR: 'light' | 'dark' = 'light';
export const MAX_OVERVIEW_COVER_UPLOAD_BYTES: number = 5 * 1024 * 1024;
export const MAX_OVERVIEW_COVER_DIMENSION: number = 1600;

const memoryObjectUrlCache = new Map<string, string>();
const inFlightFetches = new Map<string, Promise<string | null>>();

export function getCachedOverviewCoverObjectUrl(fileName: string | undefined): string | null {
    if (!fileName || !isValidOverviewCoverFileName(fileName)) {
        return null;
    }

    return memoryObjectUrlCache.get(fileName) ?? null;
}

function getOverviewCoverCacheKey(fileName: string): string {
    return new URL(`./overview-cover-cache/${encodeURIComponent(fileName)}`, window.location.origin).href;
}

function storeBlobInMemory(fileName: string, blob: Blob): string {
    const existing = memoryObjectUrlCache.get(fileName);
    if (existing) {
        return existing;
    }

    const objectUrl = URL.createObjectURL(blob);
    memoryObjectUrlCache.set(fileName, objectUrl);
    return objectUrl;
}

async function readBlobFromCacheStorage(fileName: string): Promise<Blob | null> {
    if (!window.caches) {
        return null;
    }

    try {
        const cache = await window.caches.open(OVERVIEW_COVER_CACHE_NAME);
        const response = await cache.match(getOverviewCoverCacheKey(fileName));

        if (!response) {
            return null;
        }

        return await response.blob();
    } catch (error) {
        logger.warn(`failed to read overview cover "${fileName}" from cache storage`, error);
        return null;
    }
}

async function writeBlobToCacheStorage(fileName: string, blob: Blob): Promise<void> {
    if (!window.caches) {
        return;
    }

    try {
        const cache = await window.caches.open(OVERVIEW_COVER_CACHE_NAME);
        const response = new Response(blob, {
            headers: {
                'Content-Type': blob.type || 'image/webp'
            }
        });
        await cache.put(getOverviewCoverCacheKey(fileName), response);
    } catch (error) {
        logger.warn(`failed to write overview cover "${fileName}" to cache storage`, error);
    }
}

async function deleteBlobFromCacheStorage(fileName: string): Promise<void> {
    if (!window.caches) {
        return;
    }

    try {
        const cache = await window.caches.open(OVERVIEW_COVER_CACHE_NAME);
        await cache.delete(getOverviewCoverCacheKey(fileName));
    } catch (error) {
        logger.warn(`failed to delete overview cover "${fileName}" from cache storage`, error);
    }
}

export function getOverviewCoverObjectUrl(fileName: string | undefined): Promise<string | null> {
    if (!fileName || !isValidOverviewCoverFileName(fileName)) {
        return Promise.resolve(null);
    }

    const cached = memoryObjectUrlCache.get(fileName);
    if (cached) {
        return Promise.resolve(cached);
    }

    const pending = inFlightFetches.get(fileName);
    if (pending) {
        return pending;
    }

    const fetchPromise = (async (): Promise<string | null> => {
        const cachedBlob = await readBlobFromCacheStorage(fileName);
        if (cachedBlob && cachedBlob.size > 0) {
            return storeBlobInMemory(fileName, cachedBlob);
        }

        try {
            const response = await services.getOverviewCoverBlob({ fileName });
            const blob = response.data;

            if (!blob || blob.size < 1 || !blob.type.startsWith('image/')) {
                return null;
            }

            await writeBlobToCacheStorage(fileName, blob);
            return storeBlobInMemory(fileName, blob);
        } catch (error) {
            logger.warn(`failed to fetch overview cover "${fileName}"`, error);
            return null;
        }
    })().finally(() => {
        inFlightFetches.delete(fileName);
    });

    inFlightFetches.set(fileName, fetchPromise);
    return fetchPromise;
}

export async function compressOverviewCoverImage(file: File, maxDimension: number = MAX_OVERVIEW_COVER_DIMENSION): Promise<File> {
    if (file.type === 'image/gif' && file.size <= MAX_OVERVIEW_COVER_UPLOAD_BYTES) {
        return file;
    }

    return new Promise<File>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;

            if (width <= 0 || height <= 0) {
                reject(new Error('Invalid image dimensions'));
                return;
            }

            if (width > maxDimension || height > maxDimension) {
                const ratio = Math.min(maxDimension / width, maxDimension / height);
                width = Math.max(1, Math.round(width * ratio));
                height = Math.max(1, Math.round(height * ratio));
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(file);
                return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            const tryEncode = (mimeType: string, extension: string, quality: number, fallback?: () => void) => {
                canvas.toBlob(blob => {
                    if (blob && blob.size > 0 && blob.type === mimeType) {
                        resolve(new File([blob], `cover.${extension}`, { type: mimeType }));
                    } else if (fallback) {
                        fallback();
                    } else {
                        resolve(file);
                    }
                }, mimeType, quality);
            };

            tryEncode('image/webp', 'webp', 0.84, () => {
                tryEncode('image/jpeg', 'jpg', 0.86);
            });
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to load image file'));
        };

        img.src = objectUrl;
    });
}

export async function uploadOverviewCoverImage(file: File): Promise<{ fileName: string, objectUrl: string }> {
    const processedFile = await compressOverviewCoverImage(file);

    if (processedFile.size > MAX_OVERVIEW_COVER_UPLOAD_BYTES) {
        throw new Error('Image file is too large');
    }

    const response = await services.uploadOverviewCover({ coverFile: processedFile });
    const data = response.data;

    if (!data || !data.success || !data.result || !data.result.fileName) {
        throw new Error('Failed to upload cover image');
    }

    const fileName = data.result.fileName;
    await writeBlobToCacheStorage(fileName, processedFile);
    const objectUrl = storeBlobInMemory(fileName, processedFile);

    return { fileName, objectUrl };
}

export async function deleteOverviewCoverImage(fileName: string | undefined): Promise<void> {
    if (!fileName || !isValidOverviewCoverFileName(fileName)) {
        return;
    }

    const existingUrl = memoryObjectUrlCache.get(fileName);
    if (existingUrl) {
        URL.revokeObjectURL(existingUrl);
        memoryObjectUrlCache.delete(fileName);
    }

    await deleteBlobFromCacheStorage(fileName);

    try {
        await services.deleteOverviewCover({ fileName });
    } catch (error) {
        logger.warn(`failed to delete overview cover "${fileName}" from server`, error);
    }
}

export async function clearOverviewCoverCache(): Promise<void> {
    for (const objectUrl of memoryObjectUrlCache.values()) {
        URL.revokeObjectURL(objectUrl);
    }
    memoryObjectUrlCache.clear();
    inFlightFetches.clear();

    if (window.caches) {
        try {
            await window.caches.delete(OVERVIEW_COVER_CACHE_NAME);
        } catch (error) {
            logger.warn('failed to clear overview cover cache storage', error);
        }
    }
}

export function buildOverviewCoverOverlayGradient(overlayOpacityPercent: number | undefined, textColor: string | undefined): string {
    const rawOpacity = typeof overlayOpacityPercent === 'number' && Number.isFinite(overlayOpacityPercent)
        ? Math.min(70, Math.max(0, overlayOpacityPercent))
        : DEFAULT_OVERVIEW_COVER_OVERLAY_OPACITY;
    const base = rawOpacity / 100;

    if (textColor === 'dark') {
        const strong = Math.min(0.88, base + 0.14);
        const soft = Math.max(0, base * 0.65);
        return `linear-gradient(135deg, rgba(255, 255, 255, ${strong.toFixed(3)}) 0%, rgba(255, 255, 255, ${soft.toFixed(3)}) 100%)`;
    }

    const strong = Math.min(0.85, base + 0.14);
    const soft = Math.max(0, base * 0.55);
    return `linear-gradient(180deg, rgba(12, 10, 24, ${soft.toFixed(3)}) 0%, rgba(12, 10, 24, ${strong.toFixed(3)}) 100%)`;
}
