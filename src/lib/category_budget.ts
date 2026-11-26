import { type BigDecimal } from '@/core/numeral.ts';
import { CategoryType } from '@/core/category.ts';

import type { Account } from '@/models/account.ts';
import type { TransactionCategory } from '@/models/transaction_category.ts';
import type { TransactionStatisticResponseItem } from '@/models/transaction.ts';

import { BIG_DECIMAL_ZERO, parseBigDecimal } from '@/lib/numeral.ts';

export interface CategoryBudgetConfig {
    categoryId: string;
    monthlyLimit: string; // BigDecimal string in ezBookkeeping's standard subunit representation (1/100)
}

export type CategoryBudgetStatus = 'normal' | 'warning' | 'exceeded';

export interface CategoryBudgetProgressItem {
    categoryId: string;
    categoryName: string;
    parentCategoryName?: string;
    isPrimaryCategory: boolean;
    icon: string;
    iconType: number;
    color: string;
    spentAmount: BigDecimal;
    limitAmount: BigDecimal;
    remainingAmount: BigDecimal;
    usedPercent: number;
    barPercent: number;
    status: CategoryBudgetStatus;
    pacePercent: number;
    isAheadOfPace: boolean;
    remainingDaysInMonth: number;
    dailySafeToSpend: BigDecimal;
    incomplete: boolean;
}

export interface CategoryBudgetProgressSummary {
    totalSpent: BigDecimal;
    totalLimit: BigDecimal;
    totalRemaining: BigDecimal;
    overallDailySafeToSpend: BigDecimal;
    exceededCount: number;
    warningCount: number;
    incomplete: boolean;
    pacePercent: number;
    remainingDaysInMonth: number;
    dayOfMonth: number;
    daysInMonth: number;
}

export interface CategoryBudgetProgressResult {
    items: CategoryBudgetProgressItem[];
    summary: CategoryBudgetProgressSummary;
}

export interface CalculateCategoryBudgetProgressParams {
    budgets: readonly CategoryBudgetConfig[];
    statisticItems?: readonly TransactionStatisticResponseItem[];
    accountsMap: Record<string, Account>;
    categoriesMap: Record<string, TransactionCategory>;
    defaultCurrency: string;
    excludedAccountIds?: Record<string, boolean>;
    excludedCategoryIds?: Record<string, boolean>;
    getExchangedAmount: (amount: BigDecimal, fromCurrency: string, toCurrency: string) => BigDecimal | null;
    dayOfMonth: number;
    daysInMonth: number;
}

function parsePositiveLimit(rawLimit: unknown): BigDecimal | null {
    let textual: string;

    if (typeof rawLimit === 'string') {
        textual = rawLimit.trim();
    } else if (typeof rawLimit === 'number' && Number.isFinite(rawLimit)) {
        textual = rawLimit.toString();
    } else {
        return null;
    }

    if (!textual) {
        return null;
    }

    try {
        const parsed = parseBigDecimal(textual);

        if (!parsed.isFinite() || !parsed.isPositive()) {
            return null;
        }

        return parsed;
    } catch {
        return null;
    }
}

export function parseCategoryMonthlyBudgets(raw: string): CategoryBudgetConfig[] {
    if (typeof raw !== 'string' || !raw.trim()) {
        return [];
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }

    if (!Array.isArray(parsed)) {
        return [];
    }

    const result: CategoryBudgetConfig[] = [];
    const seenCategoryIds = new Set<string>();

    for (const entry of parsed) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }

        const record = entry as Record<string, unknown>;
        const categoryId = typeof record['categoryId'] === 'string' ? record['categoryId'].trim() : '';

        if (!categoryId || seenCategoryIds.has(categoryId)) {
            continue;
        }

        const limit = parsePositiveLimit(record['monthlyLimit']);

        if (!limit) {
            continue;
        }

        seenCategoryIds.add(categoryId);
        result.push({
            categoryId,
            monthlyLimit: limit.toString()
        });
    }

    return result;
}

export function serializeCategoryMonthlyBudgets(items: readonly CategoryBudgetConfig[]): string {
    if (!Array.isArray(items) || items.length === 0) {
        return '[]';
    }

    const normalized: CategoryBudgetConfig[] = [];
    const seenCategoryIds = new Set<string>();

    for (const item of items) {
        if (!item || typeof item.categoryId !== 'string') {
            continue;
        }

        const categoryId = item.categoryId.trim();

        if (!categoryId || seenCategoryIds.has(categoryId)) {
            continue;
        }

        const limit = parsePositiveLimit(item.monthlyLimit);

        if (!limit) {
            continue;
        }

        seenCategoryIds.add(categoryId);
        normalized.push({
            categoryId,
            monthlyLimit: limit.toString()
        });
    }

    return JSON.stringify(normalized);
}

function isAccountExcluded(account: Account, excludedAccounts: Record<string, boolean>): boolean {
    return !!excludedAccounts[account.id] || (account.parentId !== '0' && !!excludedAccounts[account.parentId]);
}

function isCategoryExcluded(category: TransactionCategory, excludedCategories: Record<string, boolean>): boolean {
    return !!excludedCategories[category.id] || (category.parentId !== '0' && !!excludedCategories[category.parentId]);
}

function getBudgetStatus(usedPercent: number): CategoryBudgetStatus {
    if (usedPercent >= 100) {
        return 'exceeded';
    }

    if (usedPercent >= 75) {
        return 'warning';
    }

    return 'normal';
}

export function calculateCategoryBudgetProgress(params: CalculateCategoryBudgetProgressParams): CategoryBudgetProgressResult {
    const {
        budgets,
        statisticItems = [],
        accountsMap,
        categoriesMap,
        defaultCurrency,
        excludedAccountIds = {},
        excludedCategoryIds = {},
        getExchangedAmount,
        dayOfMonth,
        daysInMonth
    } = params;

    const safeDaysInMonth = Math.max(1, Number.isFinite(daysInMonth) ? Math.trunc(daysInMonth) : 30);
    const safeDayOfMonth = Math.min(safeDaysInMonth, Math.max(1, Number.isFinite(dayOfMonth) ? Math.trunc(dayOfMonth) : 1));
    const pacePercent = Math.min(100, Math.max(0, (safeDayOfMonth / safeDaysInMonth) * 100));
    const remainingDaysInMonth = Math.max(1, safeDaysInMonth - safeDayOfMonth + 1);

    const directSpentByCategoryId: Record<string, BigDecimal> = {};
    const incompleteByCategoryId: Record<string, boolean> = {};

    for (const statItem of statisticItems) {
        const account = accountsMap[statItem.accountId];
        const category = categoriesMap[statItem.categoryId];

        if (!account || !category || category.type !== CategoryType.Expense || isAccountExcluded(account, excludedAccountIds) || isCategoryExcluded(category, excludedCategoryIds)) {
            continue;
        }

        let amount: BigDecimal;

        try {
            amount = parseBigDecimal(statItem.amount);

            if (!amount.isFinite()) {
                continue;
            }
        } catch {
            continue;
        }

        if (account.currency !== defaultCurrency) {
            const exchangedAmount = getExchangedAmount(amount, account.currency, defaultCurrency);

            if (!exchangedAmount) {
                incompleteByCategoryId[category.id] = true;
                continue;
            }

            amount = exchangedAmount.truncate();
        }

        const existingSpent = directSpentByCategoryId[category.id];
        directSpentByCategoryId[category.id] = existingSpent ? existingSpent.add(amount) : amount;
    }

    const childCategoryIdsByParentId: Record<string, string[]> = {};

    for (const category of Object.values(categoriesMap)) {
        if (category && category.type === CategoryType.Expense && category.parentId && category.parentId !== '0') {
            if (!childCategoryIdsByParentId[category.parentId]) {
                childCategoryIdsByParentId[category.parentId] = [];
            }

            childCategoryIdsByParentId[category.parentId]!.push(category.id);
        }
    }

    const items: CategoryBudgetProgressItem[] = [];
    const seenBudgetCategoryIds = new Set<string>();

    for (const budget of budgets) {
        if (!budget || typeof budget.categoryId !== 'string') {
            continue;
        }

        const categoryId = budget.categoryId.trim();

        if (!categoryId || seenBudgetCategoryIds.has(categoryId)) {
            continue;
        }

        const category = categoriesMap[categoryId];

        if (!category || category.type !== CategoryType.Expense) {
            continue;
        }

        const limitAmount = parsePositiveLimit(budget.monthlyLimit);

        if (!limitAmount) {
            continue;
        }

        seenBudgetCategoryIds.add(categoryId);

        const isPrimaryCategory = !category.parentId || category.parentId === '0';
        let spentAmount: BigDecimal = directSpentByCategoryId[category.id] ?? BIG_DECIMAL_ZERO;
        let incomplete = !!incompleteByCategoryId[category.id];

        if (isPrimaryCategory) {
            const childIds = childCategoryIdsByParentId[category.id] ?? [];

            for (const childId of childIds) {
                const childSpent = directSpentByCategoryId[childId];

                if (childSpent) {
                    spentAmount = spentAmount.add(childSpent);
                }

                if (incompleteByCategoryId[childId]) {
                    incomplete = true;
                }
            }
        }

        const remainingAmount = limitAmount.subtract(spentAmount);
        const usedPercent = limitAmount.isPositive()
            ? spentAmount.divide(limitAmount).multiply(100).toDoubleNumber()
            : 0;
        const barPercent = Math.min(100, Math.max(0, usedPercent));
        const status = getBudgetStatus(usedPercent);
        const isAheadOfPace = usedPercent > pacePercent && usedPercent < 100;
        const dailySafeToSpend = remainingAmount.isPositive()
            ? remainingAmount.divide(remainingDaysInMonth).truncate()
            : BIG_DECIMAL_ZERO;

        const parentCategoryName = !isPrimaryCategory
            ? categoriesMap[category.parentId]?.name
            : undefined;

        items.push({
            categoryId: category.id,
            categoryName: category.name,
            parentCategoryName,
            isPrimaryCategory,
            icon: category.icon,
            iconType: category.iconType,
            color: category.color,
            spentAmount,
            limitAmount,
            remainingAmount,
            usedPercent,
            barPercent,
            status,
            pacePercent,
            isAheadOfPace,
            remainingDaysInMonth,
            dailySafeToSpend,
            incomplete
        });
    }

    items.sort((a, b) => {
        if (b.usedPercent !== a.usedPercent) {
            return b.usedPercent - a.usedPercent;
        }

        return b.spentAmount.compareTo(a.spentAmount);
    });

    let totalSpent: BigDecimal = BIG_DECIMAL_ZERO;
    let totalLimit: BigDecimal = BIG_DECIMAL_ZERO;
    let exceededCount = 0;
    let warningCount = 0;
    let anyIncomplete = false;

    for (const item of items) {
        totalSpent = totalSpent.add(item.spentAmount);
        totalLimit = totalLimit.add(item.limitAmount);

        if (item.status === 'exceeded') {
            exceededCount++;
        } else if (item.status === 'warning') {
            warningCount++;
        }

        if (item.incomplete) {
            anyIncomplete = true;
        }
    }

    const totalRemaining = totalLimit.subtract(totalSpent);
    const overallDailySafeToSpend = totalRemaining.isPositive()
        ? totalRemaining.divide(remainingDaysInMonth).truncate()
        : BIG_DECIMAL_ZERO;

    return {
        items,
        summary: {
            totalSpent,
            totalLimit,
            totalRemaining,
            overallDailySafeToSpend,
            exceededCount,
            warningCount,
            incomplete: anyIncomplete,
            pacePercent,
            remainingDaysInMonth,
            dayOfMonth: safeDayOfMonth,
            daysInMonth: safeDaysInMonth
        }
    };
}
