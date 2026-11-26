import { describe, expect, it } from 'vitest';

import { CategoryType } from '@/core/category.ts';
import type { BigDecimal } from '@/core/numeral.ts';
import { AccountType } from '@/core/account.ts';
import { Account } from '@/models/account.ts';
import { TransactionCategory } from '@/models/transaction_category.ts';
import type { TransactionStatisticResponseItem } from '@/models/transaction.ts';

import { parseBigDecimal } from '@/lib/numeral.ts';
import {
    type CategoryBudgetConfig,
    parseCategoryMonthlyBudgets,
    serializeCategoryMonthlyBudgets,
    calculateCategoryBudgetProgress
} from '@/lib/category_budget.ts';

function makeAccount(id: string, currency: string = 'USD', parentId: string = '0'): Account {
    return Account.of({
        id,
        name: `Account ${id}`,
        parentId,
        category: 1,
        type: AccountType.SingleAccount.type,
        icon: '1',
        iconType: 1,
        color: '000000',
        currency,
        balance: '0',
        comment: '',
        displayOrder: 1,
        hidden: false
    });
}

function makeCategory(id: string, name: string, parentId: string = '0', type: CategoryType = CategoryType.Expense): TransactionCategory {
    return TransactionCategory.of({
        id,
        name,
        parentId,
        type,
        icon: '1',
        iconType: 1,
        color: '000000',
        comment: '',
        displayOrder: 1,
        hidden: false
    });
}

const noExchange = (): BigDecimal | null => null;

describe('parseCategoryMonthlyBudgets & serializeCategoryMonthlyBudgets', () => {
    it('returns empty array for empty, whitespace, invalid JSON, or non-array JSON', () => {
        expect(parseCategoryMonthlyBudgets('')).toEqual([]);
        expect(parseCategoryMonthlyBudgets('   ')).toEqual([]);
        expect(parseCategoryMonthlyBudgets('not-json')).toEqual([]);
        expect(parseCategoryMonthlyBudgets('{"categoryId":"1","monthlyLimit":"100"}')).toEqual([]);
        expect(parseCategoryMonthlyBudgets('null')).toEqual([]);
        expect(parseCategoryMonthlyBudgets(undefined as unknown as string)).toEqual([]);
    });

    it('filters malformed entries, <=0 limits, and deduplicates by categoryId', () => {
        const raw = JSON.stringify([
            null,
            'bad',
            { categoryId: '', monthlyLimit: '50000' },
            { categoryId: '10', monthlyLimit: '0' },
            { categoryId: '11', monthlyLimit: '-100' },
            { categoryId: '12', monthlyLimit: 'NaN' },
            { categoryId: '13', monthlyLimit: 'Infinity' },
            { categoryId: '14', monthlyLimit: 'abc' },
            { categoryId: '1', monthlyLimit: '50000' },
            { categoryId: '1', monthlyLimit: '99999' },
            { categoryId: ' 2 ', monthlyLimit: 25000 }
        ]);

        expect(parseCategoryMonthlyBudgets(raw)).toEqual([
            { categoryId: '1', monthlyLimit: '50000' },
            { categoryId: '2', monthlyLimit: '25000' }
        ]);
    });

    it('serializes valid items and normalizes invalid or duplicate entries', () => {
        const items: CategoryBudgetConfig[] = [
            { categoryId: '1', monthlyLimit: '50000' },
            { categoryId: '1', monthlyLimit: '80000' },
            { categoryId: '2', monthlyLimit: '0' },
            { categoryId: '3', monthlyLimit: '120000' }
        ];

        const serialized = serializeCategoryMonthlyBudgets(items);
        expect(parseCategoryMonthlyBudgets(serialized)).toEqual([
            { categoryId: '1', monthlyLimit: '50000' },
            { categoryId: '3', monthlyLimit: '120000' }
        ]);
        expect(serializeCategoryMonthlyBudgets([])).toBe('[]');
    });
});

describe('calculateCategoryBudgetProgress', () => {
    const accountsMap: Record<string, Account> = {
        accUsd: makeAccount('accUsd', 'USD'),
        accEur: makeAccount('accEur', 'EUR'),
        accExcluded: makeAccount('accExcluded', 'USD'),
        accParentExcluded: makeAccount('accParentExcluded', 'USD'),
        accChildOfExcluded: makeAccount('accChildOfExcluded', 'USD', 'accParentExcluded')
    };

    const categoriesMap: Record<string, TransactionCategory> = {
        catFood: makeCategory('catFood', 'Food & Drink', '0', CategoryType.Expense),
        catGroceries: makeCategory('catGroceries', 'Groceries', 'catFood', CategoryType.Expense),
        catDining: makeCategory('catDining', 'Dining Out', 'catFood', CategoryType.Expense),
        catTransport: makeCategory('catTransport', 'Transport', '0', CategoryType.Expense),
        catTaxi: makeCategory('catTaxi', 'Taxi', 'catTransport', CategoryType.Expense),
        catIncome: makeCategory('catIncome', 'Salary', '0', CategoryType.Income)
    };

    it('sums parent category spending across direct spending and all subcategories while isolating secondary categories', () => {
        const statisticItems: TransactionStatisticResponseItem[] = [
            { accountId: 'accUsd', categoryId: 'catFood', amount: '1000' },
            { accountId: 'accUsd', categoryId: 'catGroceries', amount: '4000' },
            { accountId: 'accUsd', categoryId: 'catDining', amount: '2500' },
            { accountId: 'accUsd', categoryId: 'catIncome', amount: '99999' }
        ];

        const parentResult = calculateCategoryBudgetProgress({
            budgets: [{ categoryId: 'catFood', monthlyLimit: '10000' }],
            statisticItems,
            accountsMap,
            categoriesMap,
            defaultCurrency: 'USD',
            getExchangedAmount: noExchange,
            dayOfMonth: 15,
            daysInMonth: 30
        });

        expect(parentResult.items).toHaveLength(1);
        expect(parentResult.items[0]!.spentAmount.toString()).toBe('7500');
        expect(parentResult.items[0]!.remainingAmount.toString()).toBe('2500');
        expect(parentResult.items[0]!.usedPercent).toBe(75);
        expect(parentResult.items[0]!.status).toBe('warning');

        const childResult = calculateCategoryBudgetProgress({
            budgets: [{ categoryId: 'catDining', monthlyLimit: '5000' }],
            statisticItems,
            accountsMap,
            categoriesMap,
            defaultCurrency: 'USD',
            getExchangedAmount: noExchange,
            dayOfMonth: 15,
            daysInMonth: 30
        });

        expect(childResult.items).toHaveLength(1);
        expect(childResult.items[0]!.spentAmount.toString()).toBe('2500');
        expect(childResult.items[0]!.parentCategoryName).toBe('Food & Drink');
        expect(childResult.items[0]!.isPrimaryCategory).toBe(false);
        expect(childResult.items[0]!.usedPercent).toBe(50);
        expect(childResult.items[0]!.status).toBe('normal');
    });

    it('skips deleted or non-expense categories cleanly', () => {
        const result = calculateCategoryBudgetProgress({
            budgets: [
                { categoryId: 'catDeleted', monthlyLimit: '10000' },
                { categoryId: 'catIncome', monthlyLimit: '10000' },
                { categoryId: 'catTransport', monthlyLimit: '10000' }
            ],
            statisticItems: [],
            accountsMap,
            categoriesMap,
            defaultCurrency: 'USD',
            getExchangedAmount: noExchange,
            dayOfMonth: 10,
            daysInMonth: 30
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]!.categoryId).toBe('catTransport');
    });

    it('respects excluded accounts and excluded categories (including parents)', () => {
        const statisticItems: TransactionStatisticResponseItem[] = [
            { accountId: 'accUsd', categoryId: 'catGroceries', amount: '2000' },
            { accountId: 'accExcluded', categoryId: 'catGroceries', amount: '5000' },
            { accountId: 'accChildOfExcluded', categoryId: 'catGroceries', amount: '6000' },
            { accountId: 'accUsd', categoryId: 'catDining', amount: '3000' },
            { accountId: 'accUsd', categoryId: 'catTaxi', amount: '1500' }
        ];

        const result = calculateCategoryBudgetProgress({
            budgets: [
                { categoryId: 'catFood', monthlyLimit: '10000' },
                { categoryId: 'catTransport', monthlyLimit: '10000' }
            ],
            statisticItems,
            accountsMap,
            categoriesMap,
            defaultCurrency: 'USD',
            excludedAccountIds: { accExcluded: true, accParentExcluded: true },
            excludedCategoryIds: { catDining: true, catTransport: true },
            getExchangedAmount: noExchange,
            dayOfMonth: 10,
            daysInMonth: 30
        });

        expect(result.items).toHaveLength(2);
        const food = result.items.find(i => i.categoryId === 'catFood')!;
        const transport = result.items.find(i => i.categoryId === 'catTransport')!;
        expect(food.spentAmount.toString()).toBe('2000');
        expect(transport.spentAmount.toString()).toBe('0');
    });

    it('computes pace marker, daily safe-to-spend, status thresholds, over-budget clamping, and sorting', () => {
        const statisticItems: TransactionStatisticResponseItem[] = [
            { accountId: 'accUsd', categoryId: 'catGroceries', amount: '6000' }, // 60% of 10000 (normal, ahead of pace 50%)
            { accountId: 'accUsd', categoryId: 'catDining', amount: '8000' }, // 80% of 10000 (warning, ahead of pace 50%)
            { accountId: 'accUsd', categoryId: 'catTaxi', amount: '12500' } // 125% of 10000 (exceeded, not ahead-of-pace since >=100%)
        ];

        const result = calculateCategoryBudgetProgress({
            budgets: [
                { categoryId: 'catGroceries', monthlyLimit: '10000' },
                { categoryId: 'catDining', monthlyLimit: '10000' },
                { categoryId: 'catTaxi', monthlyLimit: '10000' }
            ],
            statisticItems,
            accountsMap,
            categoriesMap,
            defaultCurrency: 'USD',
            getExchangedAmount: noExchange,
            dayOfMonth: 15,
            daysInMonth: 30
        });

        // Sorted by usedPercent descending
        expect(result.items.map(i => i.categoryId)).toEqual(['catTaxi', 'catDining', 'catGroceries']);

        // Pace: day 15 / 30 = 50%, remainingDaysInMonth = 30 - 15 + 1 = 16
        expect(result.summary.pacePercent).toBe(50);
        expect(result.summary.remainingDaysInMonth).toBe(16);

        const taxi = result.items[0]!;
        expect(taxi.usedPercent).toBe(125);
        expect(taxi.barPercent).toBe(100);
        expect(taxi.status).toBe('exceeded');
        expect(taxi.isAheadOfPace).toBe(false);
        expect(taxi.remainingAmount.toString()).toBe('-2500');
        expect(taxi.dailySafeToSpend.toString()).toBe('0');

        const dining = result.items[1]!;
        expect(dining.usedPercent).toBe(80);
        expect(dining.barPercent).toBe(80);
        expect(dining.status).toBe('warning');
        expect(dining.isAheadOfPace).toBe(true);
        expect(dining.remainingAmount.toString()).toBe('2000');
        expect(dining.dailySafeToSpend.toString()).toBe('125'); // 2000 / 16 = 125

        const groceries = result.items[2]!;
        expect(groceries.usedPercent).toBe(60);
        expect(groceries.status).toBe('normal');
        expect(groceries.isAheadOfPace).toBe(true);
        expect(groceries.remainingAmount.toString()).toBe('4000');
        expect(groceries.dailySafeToSpend.toString()).toBe('250'); // 4000 / 16 = 250

        // Summary: totalSpent = 26500, totalLimit = 30000, totalRemaining = 3500
        // 3500 / 16 = 218.75 -> truncated = 218
        expect(result.summary.totalSpent.toString()).toBe('26500');
        expect(result.summary.totalLimit.toString()).toBe('30000');
        expect(result.summary.totalRemaining.toString()).toBe('3500');
        expect(result.summary.overallDailySafeToSpend.toString()).toBe('218');
        expect(result.summary.exceededCount).toBe(1);
        expect(result.summary.warningCount).toBe(1);
    });

    it('handles status boundary at 74.99%, 75%, 99.99%, 100%, and last day of month', () => {
        const result = calculateCategoryBudgetProgress({
            budgets: [
                { categoryId: 'catGroceries', monthlyLimit: '10000' },
                { categoryId: 'catDining', monthlyLimit: '10000' },
                { categoryId: 'catTaxi', monthlyLimit: '10000' }
            ],
            statisticItems: [
                { accountId: 'accUsd', categoryId: 'catGroceries', amount: '7499' },
                { accountId: 'accUsd', categoryId: 'catDining', amount: '9999' },
                { accountId: 'accUsd', categoryId: 'catTaxi', amount: '10000' }
            ],
            accountsMap,
            categoriesMap,
            defaultCurrency: 'USD',
            getExchangedAmount: noExchange,
            dayOfMonth: 31,
            daysInMonth: 31
        });

        expect(result.summary.pacePercent).toBe(100);
        expect(result.summary.remainingDaysInMonth).toBe(1);
        expect(result.items.find(i => i.categoryId === 'catGroceries')!.status).toBe('normal');
        expect(result.items.find(i => i.categoryId === 'catGroceries')!.isAheadOfPace).toBe(false);
        expect(result.items.find(i => i.categoryId === 'catDining')!.status).toBe('warning');
        expect(result.items.find(i => i.categoryId === 'catDining')!.dailySafeToSpend.toString()).toBe('1');
        expect(result.items.find(i => i.categoryId === 'catTaxi')!.status).toBe('exceeded');
        expect(result.items.find(i => i.categoryId === 'catTaxi')!.dailySafeToSpend.toString()).toBe('0');
    });

    it('converts foreign currencies and flags incomplete when exchange rate is missing', () => {
        const statisticItems: TransactionStatisticResponseItem[] = [
            { accountId: 'accUsd', categoryId: 'catGroceries', amount: '1000' },
            { accountId: 'accEur', categoryId: 'catDining', amount: '2000' },
            { accountId: 'accEur', categoryId: 'catTaxi', amount: '3000' }
        ];

        const partialRates = (amount: BigDecimal, from: string, to: string): BigDecimal | null => {
            if (from === 'EUR' && to === 'USD') {
                return amount.multiply(parseBigDecimal('1.1'));
            }
            return null;
        };

        const converted = calculateCategoryBudgetProgress({
            budgets: [{ categoryId: 'catFood', monthlyLimit: '10000' }],
            statisticItems,
            accountsMap,
            categoriesMap,
            defaultCurrency: 'USD',
            getExchangedAmount: partialRates,
            dayOfMonth: 10,
            daysInMonth: 30
        });

        expect(converted.items[0]!.spentAmount.toString()).toBe('3200'); // 1000 + 2000*1.1
        expect(converted.items[0]!.incomplete).toBe(false);
        expect(converted.summary.incomplete).toBe(false);

        const missingRates = calculateCategoryBudgetProgress({
            budgets: [
                { categoryId: 'catFood', monthlyLimit: '10000' },
                { categoryId: 'catTransport', monthlyLimit: '10000' }
            ],
            statisticItems,
            accountsMap,
            categoriesMap,
            defaultCurrency: 'USD',
            getExchangedAmount: noExchange,
            dayOfMonth: 10,
            daysInMonth: 30
        });

        const food = missingRates.items.find(i => i.categoryId === 'catFood')!;
        expect(food.spentAmount.toString()).toBe('1000');
        expect(food.incomplete).toBe(true);
        expect(missingRates.summary.incomplete).toBe(true);
    });
});
