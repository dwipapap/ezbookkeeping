import { TransactionType } from '@/core/transaction.ts';

export const TRANSACTION_SUGGESTIONS_STORAGE_KEY = 'ebk_txn_comment_suggestions_v1';
export const MAX_TRANSACTION_SUGGESTIONS = 80;
export const DEFAULT_SUGGESTION_LIMIT = 5;

const MS_PER_DAY = 86_400_000;
const RECENCY_DECAY_PER_DAY = 0.2;
const UNIX_SECONDS_THRESHOLD = 10_000_000_000;

export interface TransactionSuggestion {
    comment: string;
    type: number;
    categoryId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    tagIds: string[];
    lastAmount: string;
    updatedAt: number;
    count: number;
}

export interface RecordTransactionSuggestionInput {
    comment: string;
    type: number;
    categoryId?: string;
    sourceAccountId?: string;
    destinationAccountId?: string;
    tagIds?: readonly string[];
    lastAmount?: string | number;
    updatedAt?: number;
    count?: number;
}

export interface TransactionSuggestionSourceItem {
    type: number;
    categoryId?: string;
    getCategoryId?: () => string;
    sourceAccountId?: string;
    destinationAccountId?: string;
    sourceAmount?: number | string;
    tagIds?: readonly string[];
    comment?: string;
    time?: number;
}

export interface TransactionMonthListLike {
    readonly items: readonly TransactionSuggestionSourceItem[];
}

export interface SearchTransactionSuggestionsOptions {
    type?: number;
    limit?: number;
}

function canUseLocalStorage(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function isSupportedTransactionType(type: number): boolean {
    return type === TransactionType.Income
        || type === TransactionType.Expense
        || type === TransactionType.Transfer;
}

function getSuggestionKey(type: number, trimmedComment: string): string {
    return `${type}:${trimmedComment.toLowerCase()}`;
}

function normalizeTimestampMs(time?: number): number {
    if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) {
        return 0;
    }

    return time < UNIX_SECONDS_THRESHOLD ? time * 1000 : time;
}

function normalizeStoredEntry(raw: unknown): TransactionSuggestion | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const item = raw as Record<string, unknown>;
    const comment = typeof item['comment'] === 'string' ? item['comment'].trim() : '';
    const type = typeof item['type'] === 'number' ? item['type'] : 0;

    if (!comment || !isSupportedTransactionType(type)) {
        return null;
    }

    const categoryId = typeof item['categoryId'] === 'string' ? item['categoryId'] : '';
    const sourceAccountId = typeof item['sourceAccountId'] === 'string' ? item['sourceAccountId'] : '';
    const destinationAccountId = type === TransactionType.Transfer && typeof item['destinationAccountId'] === 'string'
        ? item['destinationAccountId']
        : '';
    const tagIds = Array.isArray(item['tagIds'])
        ? item['tagIds'].filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [];
    const lastAmount = typeof item['lastAmount'] === 'string'
        ? item['lastAmount']
        : typeof item['lastAmount'] === 'number' && Number.isFinite(item['lastAmount'])
            ? String(item['lastAmount'])
            : '0';
    const updatedAt = typeof item['updatedAt'] === 'number' && Number.isFinite(item['updatedAt'])
        ? item['updatedAt']
        : 0;
    const count = typeof item['count'] === 'number' && Number.isFinite(item['count']) && item['count'] > 0
        ? Math.floor(item['count'])
        : 1;

    return {
        comment,
        type,
        categoryId,
        sourceAccountId,
        destinationAccountId,
        tagIds,
        lastAmount,
        updatedAt,
        count
    };
}

/**
 * Load stored transaction comment suggestions from localStorage (newest first).
 */
export function loadTransactionSuggestions(): TransactionSuggestion[] {
    if (!canUseLocalStorage()) {
        return [];
    }

    try {
        const raw = localStorage.getItem(TRANSACTION_SUGGESTIONS_STORAGE_KEY);

        if (!raw) {
            return [];
        }

        const parsed: unknown = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            return [];
        }

        const entries: TransactionSuggestion[] = [];

        for (const item of parsed) {
            const normalized = normalizeStoredEntry(item);

            if (normalized) {
                entries.push(normalized);
            }
        }

        entries.sort((a, b) => b.updatedAt - a.updatedAt);
        return entries.slice(0, MAX_TRANSACTION_SUGGESTIONS);
    } catch {
        return [];
    }
}

function saveTransactionSuggestions(entries: TransactionSuggestion[]): void {
    if (!canUseLocalStorage()) {
        return;
    }

    try {
        localStorage.setItem(TRANSACTION_SUGGESTIONS_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_TRANSACTION_SUGGESTIONS)));
    } catch {
        // Ignore storage quota or private-mode access errors
    }
}

/**
 * Record or update a transaction description suggestion in the client-side ring buffer.
 */
export function recordTransactionSuggestion(entry: RecordTransactionSuggestionInput): TransactionSuggestion[] {
    if (!canUseLocalStorage()) {
        return [];
    }

    const existing = loadTransactionSuggestions();

    if (!entry || !isSupportedTransactionType(entry.type)) {
        return existing;
    }

    const trimmedComment = (entry.comment ?? '').trim();

    if (!trimmedComment) {
        return existing;
    }

    const key = getSuggestionKey(entry.type, trimmedComment);
    const now = typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
        ? entry.updatedAt
        : Date.now();
    const increment = typeof entry.count === 'number' && Number.isFinite(entry.count) && entry.count > 0
        ? Math.floor(entry.count)
        : 1;

    const map = new Map<string, TransactionSuggestion>();

    for (const item of existing) {
        map.set(getSuggestionKey(item.type, item.comment), item);
    }

    const prev = map.get(key);
    const nextEntry: TransactionSuggestion = {
        comment: trimmedComment,
        type: entry.type,
        categoryId: entry.categoryId ?? prev?.categoryId ?? '',
        sourceAccountId: entry.sourceAccountId ?? prev?.sourceAccountId ?? '',
        destinationAccountId: entry.type === TransactionType.Transfer
            ? (entry.destinationAccountId ?? prev?.destinationAccountId ?? '')
            : '',
        tagIds: entry.tagIds
            ? entry.tagIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
            : (prev?.tagIds ? [...prev.tagIds] : []),
        lastAmount: entry.lastAmount !== undefined && entry.lastAmount !== null
            ? String(entry.lastAmount)
            : (prev?.lastAmount ?? '0'),
        updatedAt: prev ? Math.max(prev.updatedAt, now) : now,
        count: (prev?.count ?? 0) + increment
    };

    map.set(key, nextEntry);

    const updated = Array.from(map.values())
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_TRANSACTION_SUGGESTIONS);

    saveTransactionSuggestions(updated);
    return updated;
}

function isMonthListLike(item: TransactionSuggestionSourceItem | TransactionMonthListLike): item is TransactionMonthListLike {
    return typeof item === 'object' && item !== null && 'items' in item && Array.isArray((item as TransactionMonthListLike).items);
}

function flattenTransactions(transactions: readonly (TransactionSuggestionSourceItem | TransactionMonthListLike)[]): TransactionSuggestionSourceItem[] {
    const result: TransactionSuggestionSourceItem[] = [];

    for (const item of transactions) {
        if (!item) {
            continue;
        }

        if (isMonthListLike(item)) {
            for (const subItem of item.items) {
                if (subItem) {
                    result.push(subItem);
                }
            }
        } else {
            result.push(item);
        }
    }

    return result;
}

/**
 * Extract suggestion candidates from loaded store transactions merged with localStorage history.
 */
export function collectSuggestionsFromTransactions(
    transactions: readonly (TransactionSuggestionSourceItem | TransactionMonthListLike)[]
): TransactionSuggestion[] {
    const mergedMap = new Map<string, TransactionSuggestion>();

    for (const stored of loadTransactionSuggestions()) {
        mergedMap.set(getSuggestionKey(stored.type, stored.comment), {
            ...stored,
            tagIds: [...stored.tagIds]
        });
    }

    const txnMap = new Map<string, TransactionSuggestion>();

    for (const txn of flattenTransactions(transactions)) {
        if (!isSupportedTransactionType(txn.type)) {
            continue;
        }

        const trimmedComment = (txn.comment ?? '').trim();

        if (!trimmedComment) {
            continue;
        }

        const key = getSuggestionKey(txn.type, trimmedComment);
        const categoryId = txn.categoryId || (typeof txn.getCategoryId === 'function' ? txn.getCategoryId() : '') || '';
        const sourceAccountId = txn.sourceAccountId ?? '';
        const destinationAccountId = txn.type === TransactionType.Transfer ? (txn.destinationAccountId ?? '') : '';
        const tagIds = Array.isArray(txn.tagIds)
            ? txn.tagIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
            : [];
        const lastAmount = txn.sourceAmount !== undefined && txn.sourceAmount !== null
            ? String(txn.sourceAmount)
            : '0';
        const updatedAt = normalizeTimestampMs(txn.time);

        const existing = txnMap.get(key);

        if (!existing) {
            txnMap.set(key, {
                comment: trimmedComment,
                type: txn.type,
                categoryId,
                sourceAccountId,
                destinationAccountId,
                tagIds,
                lastAmount,
                updatedAt,
                count: 1
            });
        } else {
            const useIncoming = updatedAt >= existing.updatedAt;
            txnMap.set(key, {
                comment: useIncoming ? trimmedComment : existing.comment,
                type: txn.type,
                categoryId: useIncoming ? (categoryId || existing.categoryId) : (existing.categoryId || categoryId),
                sourceAccountId: useIncoming ? (sourceAccountId || existing.sourceAccountId) : (existing.sourceAccountId || sourceAccountId),
                destinationAccountId: useIncoming ? (destinationAccountId || existing.destinationAccountId) : (existing.destinationAccountId || destinationAccountId),
                tagIds: useIncoming ? tagIds : existing.tagIds,
                lastAmount: useIncoming ? lastAmount : existing.lastAmount,
                updatedAt: Math.max(existing.updatedAt, updatedAt),
                count: existing.count + 1
            });
        }
    }

    for (const [key, fromTxn] of txnMap.entries()) {
        const stored = mergedMap.get(key);

        if (!stored) {
            mergedMap.set(key, fromTxn);
        } else {
            const useTxn = fromTxn.updatedAt > stored.updatedAt;
            mergedMap.set(key, {
                comment: useTxn ? fromTxn.comment : stored.comment,
                type: stored.type,
                categoryId: useTxn ? (fromTxn.categoryId || stored.categoryId) : (stored.categoryId || fromTxn.categoryId),
                sourceAccountId: useTxn ? (fromTxn.sourceAccountId || stored.sourceAccountId) : (stored.sourceAccountId || fromTxn.sourceAccountId),
                destinationAccountId: useTxn ? (fromTxn.destinationAccountId || stored.destinationAccountId) : (stored.destinationAccountId || fromTxn.destinationAccountId),
                tagIds: useTxn ? (fromTxn.tagIds.length ? fromTxn.tagIds : stored.tagIds) : (stored.tagIds.length ? stored.tagIds : fromTxn.tagIds),
                lastAmount: useTxn ? fromTxn.lastAmount : stored.lastAmount,
                updatedAt: Math.max(stored.updatedAt, fromTxn.updatedAt),
                count: Math.max(stored.count, fromTxn.count)
            });
        }
    }

    return Array.from(mergedMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Search and rank transaction comment suggestions by prefix match, recency, and frequency.
 */
export function searchTransactionSuggestions(
    query: string,
    candidates: readonly TransactionSuggestion[],
    options?: SearchTransactionSuggestionsOptions
): TransactionSuggestion[] {
    const normalizedQuery = (query ?? '').trim().toLowerCase();

    if (!normalizedQuery) {
        return [];
    }

    const limit = options?.limit ?? DEFAULT_SUGGESTION_LIMIT;

    if (limit <= 0) {
        return [];
    }

    const filterType = options?.type;
    const deduped = new Map<string, { entry: TransactionSuggestion; isPrefix: boolean }>();

    for (const candidate of candidates) {
        if (!candidate || !isSupportedTransactionType(candidate.type)) {
            continue;
        }

        if (filterType !== undefined && filterType !== 0 && candidate.type !== filterType) {
            continue;
        }

        const trimmedComment = (candidate.comment ?? '').trim();

        if (!trimmedComment) {
            continue;
        }

        const normalizedComment = trimmedComment.toLowerCase();
        const isPrefix = normalizedComment.startsWith(normalizedQuery);
        const isSubstring = !isPrefix && normalizedComment.includes(normalizedQuery);

        if (!isPrefix && !isSubstring) {
            continue;
        }

        const key = getSuggestionKey(candidate.type, trimmedComment);
        const existing = deduped.get(key);

        if (!existing || candidate.updatedAt > existing.entry.updatedAt || candidate.count > existing.entry.count) {
            deduped.set(key, {
                entry: {
                    ...candidate,
                    comment: trimmedComment,
                    tagIds: [...(candidate.tagIds ?? [])]
                },
                isPrefix
            });
        }
    }

    const matched = Array.from(deduped.values());

    if (matched.length === 0) {
        return [];
    }

    let maxUpdatedAt = 0;

    for (const item of matched) {
        if (item.entry.updatedAt > maxUpdatedAt) {
            maxUpdatedAt = item.entry.updatedAt;
        }
    }

    matched.sort((a, b) => {
        if (a.isPrefix !== b.isPrefix) {
            return a.isPrefix ? -1 : 1;
        }

        const aAgeDays = Math.max(0, (maxUpdatedAt - a.entry.updatedAt) / MS_PER_DAY);
        const bAgeDays = Math.max(0, (maxUpdatedAt - b.entry.updatedAt) / MS_PER_DAY);
        const aScore = Math.max(1, a.entry.count || 1) / (1 + aAgeDays * RECENCY_DECAY_PER_DAY);
        const bScore = Math.max(1, b.entry.count || 1) / (1 + bAgeDays * RECENCY_DECAY_PER_DAY);

        if (Math.abs(aScore - bScore) > 1e-9) {
            return bScore - aScore;
        }

        if (a.entry.updatedAt !== b.entry.updatedAt) {
            return b.entry.updatedAt - a.entry.updatedAt;
        }

        if (a.entry.count !== b.entry.count) {
            return b.entry.count - a.entry.count;
        }

        return a.entry.comment.localeCompare(b.entry.comment);
    });

    return matched.slice(0, limit).map(item => item.entry);
}
