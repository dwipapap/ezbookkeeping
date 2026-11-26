import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TransactionType } from '@/core/transaction.ts';
import {
    TRANSACTION_SUGGESTIONS_STORAGE_KEY,
    MAX_TRANSACTION_SUGGESTIONS,
    type TransactionSuggestion,
    loadTransactionSuggestions,
    recordTransactionSuggestion,
    collectSuggestionsFromTransactions,
    searchTransactionSuggestions
} from '@/lib/transaction_suggestions.ts';

function createMemoryStorage(): Storage {
    const store = new Map<string, string>();

    return {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key: string) {
            return store.get(key) ?? null;
        },
        key(index: number) {
            return Array.from(store.keys())[index] ?? null;
        },
        removeItem(key: string) {
            store.delete(key);
        },
        setItem(key: string, value: string) {
            store.set(key, value);
        }
    };
}

describe('transaction_suggestions', () => {
    describe('node / SSR safety without window or localStorage', () => {
        it('returns empty list safely when window and localStorage are unavailable', () => {
            expect(loadTransactionSuggestions()).toEqual([]);

            const result = recordTransactionSuggestion({
                comment: 'Morning Coffee',
                type: TransactionType.Expense,
                categoryId: 'cat-1',
                sourceAccountId: 'acc-1',
                lastAmount: '2500'
            });

            expect(result).toEqual([]);
        });

        it('still collects from in-memory transactions when localStorage is unavailable', () => {
            const suggestions = collectSuggestionsFromTransactions([
                {
                    type: TransactionType.Expense,
                    categoryId: 'cat-food',
                    sourceAccountId: 'acc-cash',
                    sourceAmount: 1500,
                    tagIds: ['tag-1'],
                    comment: 'Lunch Bento',
                    time: 1700000000
                }
            ]);

            expect(suggestions).toHaveLength(1);
            expect(suggestions[0]).toMatchObject({
                comment: 'Lunch Bento',
                type: TransactionType.Expense,
                categoryId: 'cat-food',
                sourceAccountId: 'acc-cash',
                lastAmount: '1500',
                updatedAt: 1700000000 * 1000,
                count: 1
            });
        });
    });

    describe('with localStorage mocked', () => {
        let storage: Storage;

        beforeEach(() => {
            storage = createMemoryStorage();
            vi.stubGlobal('window', {});
            vi.stubGlobal('localStorage', storage);
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('ignores empty/whitespace comments and ModifyBalance transactions', () => {
            recordTransactionSuggestion({
                comment: '   ',
                type: TransactionType.Expense,
                categoryId: 'cat-1'
            });

            recordTransactionSuggestion({
                comment: 'Initial Balance',
                type: TransactionType.ModifyBalance,
                sourceAccountId: 'acc-1'
            });

            expect(loadTransactionSuggestions()).toEqual([]);
        });

        it('upserts normalized trimmed comments, increments count, and updates metadata', () => {
            recordTransactionSuggestion({
                comment: '  Kopi Kenangan  ',
                type: TransactionType.Expense,
                categoryId: 'cat-coffee',
                sourceAccountId: 'acc-wallet',
                tagIds: ['tag-work'],
                lastAmount: '2200000',
                updatedAt: 1000
            });

            const updated = recordTransactionSuggestion({
                comment: 'kopi kenangan',
                type: TransactionType.Expense,
                categoryId: 'cat-drinks',
                sourceAccountId: 'acc-card',
                tagIds: ['tag-work', 'tag-treat'],
                lastAmount: '2500000',
                updatedAt: 2000
            });

            expect(updated).toHaveLength(1);
            expect(updated[0]).toEqual({
                comment: 'kopi kenangan',
                type: TransactionType.Expense,
                categoryId: 'cat-drinks',
                sourceAccountId: 'acc-card',
                destinationAccountId: '',
                tagIds: ['tag-work', 'tag-treat'],
                lastAmount: '2500000',
                updatedAt: 2000,
                count: 2
            });
        });

        it('keeps transfer destinationAccountId and clears it for non-transfer types', () => {
            recordTransactionSuggestion({
                comment: 'Top up e-wallet',
                type: TransactionType.Transfer,
                categoryId: 'cat-transfer',
                sourceAccountId: 'acc-bank',
                destinationAccountId: 'acc-ewallet',
                lastAmount: '5000000',
                updatedAt: 5000
            });

            recordTransactionSuggestion({
                comment: 'Salary',
                type: TransactionType.Income,
                categoryId: 'cat-salary',
                sourceAccountId: 'acc-bank',
                destinationAccountId: 'acc-should-ignore',
                lastAmount: '100000000',
                updatedAt: 6000
            });

            const stored = loadTransactionSuggestions();
            expect(stored[0]?.destinationAccountId).toBe('');
            expect(stored[1]?.destinationAccountId).toBe('acc-ewallet');
        });

        it('trims ring buffer to MAX_TRANSACTION_SUGGESTIONS (80) keeping newest entries', () => {
            for (let i = 1; i <= MAX_TRANSACTION_SUGGESTIONS + 15; i++) {
                recordTransactionSuggestion({
                    comment: `Item ${i}`,
                    type: TransactionType.Expense,
                    categoryId: 'cat-1',
                    sourceAccountId: 'acc-1',
                    updatedAt: i * 1000
                });
            }

            const stored = loadTransactionSuggestions();
            expect(stored).toHaveLength(MAX_TRANSACTION_SUGGESTIONS);
            expect(stored[0]?.comment).toBe(`Item ${MAX_TRANSACTION_SUGGESTIONS + 15}`);
            expect(stored[MAX_TRANSACTION_SUGGESTIONS - 1]?.comment).toBe('Item 16');
        });

        it('handles corrupted localStorage JSON gracefully', () => {
            storage.setItem(TRANSACTION_SUGGESTIONS_STORAGE_KEY, '{not-valid-json');
            expect(loadTransactionSuggestions()).toEqual([]);
        });

        it('collects and merges suggestions from month lists and localStorage', () => {
            recordTransactionSuggestion({
                comment: 'Grab Ride',
                type: TransactionType.Expense,
                categoryId: 'cat-transport',
                sourceAccountId: 'acc-old',
                lastAmount: '1500000',
                updatedAt: 1700000000 * 1000
            });

            const monthLists = [
                {
                    items: [
                        {
                            type: TransactionType.Expense,
                            categoryId: 'cat-transport',
                            sourceAccountId: 'acc-new',
                            sourceAmount: 2000000,
                            tagIds: ['tag-commute'],
                            comment: 'Grab Ride',
                            time: 1700005000
                        },
                        {
                            type: TransactionType.Expense,
                            categoryId: 'cat-food',
                            sourceAccountId: 'acc-cash',
                            sourceAmount: 3500000,
                            tagIds: [],
                            comment: 'Nasi Goreng',
                            time: 1700004000
                        },
                        {
                            type: TransactionType.Expense,
                            categoryId: 'cat-food',
                            sourceAccountId: 'acc-cash',
                            sourceAmount: 3000000,
                            tagIds: [],
                            comment: 'Nasi Goreng',
                            time: 1700001000
                        },
                        {
                            type: TransactionType.ModifyBalance,
                            categoryId: '0',
                            sourceAccountId: 'acc-cash',
                            sourceAmount: 100000,
                            comment: 'Balance adj',
                            time: 1700006000
                        }
                    ]
                }
            ];

            const collected = collectSuggestionsFromTransactions(monthLists);
            expect(collected).toHaveLength(2);

            const grab = collected.find(c => c.comment === 'Grab Ride');
            expect(grab).toMatchObject({
                sourceAccountId: 'acc-new',
                lastAmount: '2000000',
                tagIds: ['tag-commute'],
                updatedAt: 1700005000 * 1000,
                count: 1
            });

            const nasi = collected.find(c => c.comment === 'Nasi Goreng');
            expect(nasi).toMatchObject({
                lastAmount: '3500000',
                updatedAt: 1700004000 * 1000,
                count: 2
            });
        });

        it('ranks prefix matches before substring matches, then by frequency and recency', () => {
            const now = 1_750_000_000_000;
            const candidates: TransactionSuggestion[] = [
                {
                    comment: 'Iced Coffee Latte',
                    type: TransactionType.Expense,
                    categoryId: 'c1',
                    sourceAccountId: 'a1',
                    destinationAccountId: '',
                    tagIds: [],
                    lastAmount: '3000',
                    updatedAt: now,
                    count: 10
                },
                {
                    comment: 'Coffee Shop',
                    type: TransactionType.Expense,
                    categoryId: 'c1',
                    sourceAccountId: 'a1',
                    destinationAccountId: '',
                    tagIds: [],
                    lastAmount: '2500',
                    updatedAt: now - 3600_000,
                    count: 1
                },
                {
                    comment: 'Coffee Beans',
                    type: TransactionType.Expense,
                    categoryId: 'c1',
                    sourceAccountId: 'a1',
                    destinationAccountId: '',
                    tagIds: [],
                    lastAmount: '12000',
                    updatedAt: now - 7200_000,
                    count: 4
                },
                {
                    comment: 'Coffee Refund',
                    type: TransactionType.Income,
                    categoryId: 'c2',
                    sourceAccountId: 'a1',
                    destinationAccountId: '',
                    tagIds: [],
                    lastAmount: '2500',
                    updatedAt: now,
                    count: 5
                }
            ];

            const results = searchTransactionSuggestions('cof', candidates, {
                type: TransactionType.Expense,
                limit: 5
            });

            expect(results.map(r => r.comment)).toEqual([
                'Coffee Beans',
                'Coffee Shop',
                'Iced Coffee Latte'
            ]);
        });

        it('respects limit option and returns empty array for empty queries', () => {
            const candidates: TransactionSuggestion[] = Array.from({ length: 8 }, (_, idx) => ({
                comment: `Grocery ${idx + 1}`,
                type: TransactionType.Expense,
                categoryId: 'c1',
                sourceAccountId: 'a1',
                destinationAccountId: '',
                tagIds: [],
                lastAmount: '1000',
                updatedAt: (idx + 1) * 1000,
                count: 1
            }));

            expect(searchTransactionSuggestions('   ', candidates)).toEqual([]);
            expect(searchTransactionSuggestions('groc', candidates)).toHaveLength(5);
            expect(searchTransactionSuggestions('groc', candidates, { limit: 2 })).toHaveLength(2);
        });
    });
});
