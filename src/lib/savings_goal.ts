import type { BigDecimal } from '@/core/numeral.ts';
import { AccountType } from '@/core/account.ts';
import { isValidOverviewCoverFileName } from '@/core/overview_layout.ts';

import { ACCOUNT_CURRENCY_NOT_SET_VALUE } from '@/consts/currency.ts';

import { BIG_DECIMAL_ZERO, parseBigDecimal } from '@/lib/numeral.ts';
import { generateRandomUUID } from '@/lib/misc.ts';

export type SavingsGoalMode = 'accounts' | 'manual';

export interface SavingsGoalConfig {
    id: string;
    name: string;
    targetAmount: string;
    currency: string;
    mode: SavingsGoalMode;
    linkedAccountIds: string[];
    manualSavedAmount: string;
    monthlyContribution?: string;
    targetDate?: string;
    coverImage?: string;
    color?: string;
}

export interface SavingsGoalAccountLike {
    id: string;
    type: number;
    currency: string;
    balance: string;
    hidden?: boolean;
    subAccounts?: SavingsGoalAccountLike[];
}

export interface SavingsGoalProgressParams {
    accountsMap?: Record<string, SavingsGoalAccountLike>;
    getExchangedAmount?: (amount: BigDecimal, fromCurrency: string, toCurrency: string) => BigDecimal | null;
    defaultCurrency?: string;
    nowDate?: string | Date;
}

export interface SavingsGoalProgressResult {
    savedAmount: BigDecimal;
    targetAmount: BigDecimal;
    remainingAmount: BigDecimal;
    percent: number;
    rawPercent: number;
    isCompleted: boolean;
    incomplete: boolean;
    estimatedMonthsToGoal: number | null;
    requiredMonthlyToHitTargetDate: BigDecimal | null;
    currency: string;
}

const DATE_YYYY_MM_DD_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const HEX_COLOR_6_REGEX = /^[0-9a-f]{6}$/i;

interface CalendarYearMonthDay {
    year: number;
    month: number;
    day: number;
}

function parseCalendarDate(value: unknown): CalendarYearMonthDay | null {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            return null;
        }
        return {
            year: value.getFullYear(),
            month: value.getMonth() + 1,
            day: value.getDate()
        };
    }

    if (typeof value !== 'string') {
        return null;
    }

    const match = DATE_YYYY_MM_DD_REGEX.exec(value.trim());
    if (!match) {
        return null;
    }

    const year = Number.parseInt(match[1]!, 10);
    const month = Number.parseInt(match[2]!, 10);
    const day = Number.parseInt(match[3]!, 10);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return null;
    }

    const probe = new Date(year, month - 1, day);
    if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) {
        return null;
    }

    return { year, month, day };
}

export function isValidSavingsGoalDate(value: unknown): value is string {
    return typeof value === 'string' && parseCalendarDate(value) !== null;
}

export function normalizeSavingsGoalColor(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const cleaned = value.trim().replace(/^#/, '').toLowerCase();
    if (!HEX_COLOR_6_REGEX.test(cleaned)) {
        return undefined;
    }

    return cleaned;
}

function normalizeBigDecimalString(value: unknown, fallback: string, allowNegative: boolean): string {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return fallback;
        }
        const parsed = parseBigDecimal(value);
        if (!parsed.isFinite() || parsed.isNaN()) {
            return fallback;
        }
        if (!allowNegative && parsed.isNegative()) {
            return fallback;
        }
        return parsed.toString();
    }

    if (typeof value !== 'string') {
        return fallback;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return fallback;
    }

    try {
        const parsed = parseBigDecimal(trimmed);
        if (!parsed.isFinite() || parsed.isNaN()) {
            return fallback;
        }
        if (!allowNegative && parsed.isNegative()) {
            return fallback;
        }
        return parsed.toString();
    } catch {
        return fallback;
    }
}

function normalizeLinkedAccountIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const unique = new Set<string>();
    for (const item of value) {
        if (typeof item === 'string') {
            const trimmed = item.trim();
            if (trimmed.length > 0) {
                unique.add(trimmed);
            }
        }
    }

    return Array.from(unique);
}

export function createSavingsGoalId(): string {
    return generateRandomUUID();
}

export function sanitizeSavingsGoal(rawGoal: unknown): SavingsGoalConfig | null {
    if (!rawGoal || typeof rawGoal !== 'object' || Array.isArray(rawGoal)) {
        return null;
    }

    const candidate = rawGoal as Record<string, unknown>;
    const rawName = typeof candidate['name'] === 'string' ? candidate['name'].trim() : '';

    if (!rawName) {
        return null;
    }

    const rawId = typeof candidate['id'] === 'string' ? candidate['id'].trim() : '';
    const id = rawId || createSavingsGoalId();
    const targetAmount = normalizeBigDecimalString(candidate['targetAmount'], '0', false);
    const currency = typeof candidate['currency'] === 'string' ? candidate['currency'].trim().toUpperCase() : '';
    const mode: SavingsGoalMode = candidate['mode'] === 'accounts' || candidate['mode'] === 'manual'
        ? candidate['mode']
        : 'manual';
    const linkedAccountIds = normalizeLinkedAccountIds(candidate['linkedAccountIds']);
    const manualSavedAmount = normalizeBigDecimalString(candidate['manualSavedAmount'], '0', true);

    const goal: SavingsGoalConfig = {
        id,
        name: rawName,
        targetAmount,
        currency,
        mode,
        linkedAccountIds,
        manualSavedAmount
    };

    const monthlyContributionRaw = normalizeBigDecimalString(candidate['monthlyContribution'], '', false);
    if (monthlyContributionRaw) {
        const parsedContribution = parseBigDecimal(monthlyContributionRaw);
        if (parsedContribution.isPositive()) {
            goal.monthlyContribution = monthlyContributionRaw;
        }
    }

    if (typeof candidate['targetDate'] === 'string') {
        const trimmedDate = candidate['targetDate'].trim();
        if (isValidSavingsGoalDate(trimmedDate)) {
            goal.targetDate = trimmedDate;
        }
    }

    if (isValidOverviewCoverFileName(candidate['coverImage'])) {
        goal.coverImage = candidate['coverImage'];
    }

    const normalizedColor = normalizeSavingsGoalColor(candidate['color']);
    if (normalizedColor) {
        goal.color = normalizedColor;
    }

    return goal;
}

export function parseSavingsGoals(raw: string): SavingsGoalConfig[] {
    if (typeof raw !== 'string' || !raw.trim()) {
        return [];
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        const goals: SavingsGoalConfig[] = [];
        for (const item of parsed) {
            const sanitized = sanitizeSavingsGoal(item);
            if (sanitized) {
                goals.push(sanitized);
            }
        }

        return goals;
    } catch {
        return [];
    }
}

export function serializeSavingsGoals(goals: SavingsGoalConfig[]): string {
    if (!Array.isArray(goals)) {
        return '[]';
    }

    const sanitizedGoals: SavingsGoalConfig[] = [];
    for (const goal of goals) {
        const sanitized = sanitizeSavingsGoal(goal);
        if (sanitized) {
            sanitizedGoals.push(sanitized);
        }
    }

    return JSON.stringify(sanitizedGoals);
}

export function addManualSavingsToGoal(goal: SavingsGoalConfig, deltaAmount: string | number): SavingsGoalConfig {
    const current = parseBigDecimal(normalizeBigDecimalString(goal.manualSavedAmount, '0', true));
    const delta = parseBigDecimal(normalizeBigDecimalString(deltaAmount, '0', true));
    const nextSaved = current.add(delta);

    return {
        ...goal,
        manualSavedAmount: nextSaved.toString()
    };
}

function collectLeafAccounts(linkedAccountIds: string[], accountsMap: Record<string, SavingsGoalAccountLike>): SavingsGoalAccountLike[] {
    const explicitIdSet = new Set<string>(linkedAccountIds);
    const leafAccounts = new Map<string, SavingsGoalAccountLike>();

    for (const accountId of linkedAccountIds) {
        const account = accountsMap[accountId];
        if (!account) {
            continue;
        }

        const isMultiSubContainer = account.type === AccountType.MultiSubAccounts.type
            || (Array.isArray(account.subAccounts) && account.subAccounts.length > 0);

        if (isMultiSubContainer) {
            if (Array.isArray(account.subAccounts)) {
                for (const subAccount of account.subAccounts) {
                    if (subAccount.hidden && !explicitIdSet.has(subAccount.id)) {
                        continue;
                    }
                    const resolvedSub = accountsMap[subAccount.id] ?? subAccount;
                    leafAccounts.set(resolvedSub.id, resolvedSub);
                }
            }
        } else {
            leafAccounts.set(account.id, account);
        }
    }

    return Array.from(leafAccounts.values());
}

export function calculateSavingsGoalProgress(goal: SavingsGoalConfig, params: SavingsGoalProgressParams = {}): SavingsGoalProgressResult {
    const targetCurrency = (goal.currency || params.defaultCurrency || '').trim().toUpperCase();
    const targetAmount = parseBigDecimal(normalizeBigDecimalString(goal.targetAmount, '0', false));

    let savedAmount: BigDecimal = BIG_DECIMAL_ZERO;
    let incomplete = false;

    if (goal.mode === 'accounts') {
        const accountsMap = params.accountsMap ?? {};
        const leafAccounts = collectLeafAccounts(goal.linkedAccountIds ?? [], accountsMap);

        for (const leaf of leafAccounts) {
            const balance = parseBigDecimal(normalizeBigDecimalString(leaf.balance, '0', true));
            const accountCurrency = (leaf.currency || '').trim().toUpperCase();

            if (!accountCurrency || accountCurrency === ACCOUNT_CURRENCY_NOT_SET_VALUE) {
                if (!balance.isZero()) {
                    incomplete = true;
                }
                continue;
            }

            if (!targetCurrency || accountCurrency === targetCurrency) {
                savedAmount = savedAmount.add(balance);
                continue;
            }

            if (balance.isZero()) {
                continue;
            }

            if (params.getExchangedAmount) {
                const converted = params.getExchangedAmount(balance, accountCurrency, targetCurrency);
                if (converted === null || !converted.isFinite() || converted.isNaN()) {
                    incomplete = true;
                } else {
                    savedAmount = savedAmount.add(converted);
                }
            } else {
                incomplete = true;
            }
        }
    } else {
        savedAmount = parseBigDecimal(normalizeBigDecimalString(goal.manualSavedAmount, '0', true));
    }

    const remainingAmount = targetAmount.greaterThan(savedAmount)
        ? targetAmount.subtract(savedAmount)
        : BIG_DECIMAL_ZERO;

    const isCompleted = targetAmount.isPositive() && savedAmount.greaterThanOrEqual(targetAmount);

    let rawPercent = 0;
    let percent = 0;

    if (targetAmount.isPositive()) {
        const clampedSavedForPercent = savedAmount.isPositive() ? savedAmount : BIG_DECIMAL_ZERO;
        rawPercent = clampedSavedForPercent.divide(targetAmount).multiply(100).toDoubleNumber();
        percent = Math.min(100, Math.max(0, rawPercent));
    }

    let estimatedMonthsToGoal: number | null = null;
    if (!isCompleted && targetAmount.isPositive() && remainingAmount.isPositive() && goal.monthlyContribution) {
        const monthlyContribution = parseBigDecimal(normalizeBigDecimalString(goal.monthlyContribution, '0', false));
        if (monthlyContribution.isPositive()) {
            const quotient = remainingAmount.divide(monthlyContribution);
            const truncated = quotient.truncate();
            estimatedMonthsToGoal = quotient.equals(truncated)
                ? truncated.toDoubleNumber()
                : truncated.toDoubleNumber() + 1;
        }
    }

    let requiredMonthlyToHitTargetDate: BigDecimal | null = null;
    if (!isCompleted && targetAmount.isPositive() && remainingAmount.isPositive() && goal.targetDate) {
        const parsedTargetDate = parseCalendarDate(goal.targetDate);
        const parsedNowDate = parseCalendarDate(params.nowDate ?? new Date());

        if (parsedTargetDate && parsedNowDate) {
            const isTargetInFuture = parsedTargetDate.year > parsedNowDate.year
                || (parsedTargetDate.year === parsedNowDate.year && (
                    parsedTargetDate.month > parsedNowDate.month
                    || (parsedTargetDate.month === parsedNowDate.month && parsedTargetDate.day > parsedNowDate.day)
                ));

            if (isTargetInFuture) {
                const monthDiff = (parsedTargetDate.year - parsedNowDate.year) * 12 + (parsedTargetDate.month - parsedNowDate.month);
                const remainingMonths = Math.max(1, monthDiff);
                requiredMonthlyToHitTargetDate = remainingAmount.divide(remainingMonths);
            }
        }
    }

    return {
        savedAmount,
        targetAmount,
        remainingAmount,
        percent,
        rawPercent,
        isCompleted,
        incomplete,
        estimatedMonthsToGoal,
        requiredMonthlyToHitTargetDate,
        currency: targetCurrency
    };
}
