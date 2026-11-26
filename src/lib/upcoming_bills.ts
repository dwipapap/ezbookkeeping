import type { BigDecimal } from '@/core/numeral.ts';
import { TransactionType } from '@/core/transaction.ts';
import {
    TemplateType,
    ScheduledTransactionStatus,
    ScheduledTemplateFrequencyType
} from '@/core/template.ts';

import type {
    TransactionTemplate,
    ScheduledTransactionOccurrenceResponse
} from '@/models/transaction_template.ts';

import { BIG_DECIMAL_ZERO, parseBigDecimal } from '@/lib/numeral.ts';
import { parseDateTimeFromUnixTime } from '@/lib/datetime.ts';

const SECONDS_PER_DAY = 86400;

export interface UpcomingBillMonth {
    year: number;
    month: number;
}

export interface UpcomingBillAccountInfo {
    currency: string;
    name: string;
}

export interface BuildUpcomingBillItemsParams {
    templatesMap: Record<string, TransactionTemplate>;
    occurrences: ScheduledTransactionOccurrenceResponse[];
    todayStartUnixTime: number;
    daysAhead: number;
    currentMonthEndUnixTime: number;
    accountsMap: Record<string, UpcomingBillAccountInfo>;
    defaultCurrency: string;
    getExchangedAmount: (amount: BigDecimal, fromCurrency: string, toCurrency: string) => BigDecimal | null;
}

export interface UpcomingBillItem {
    id: string;
    templateId: string;
    name: string;
    type: number;
    categoryId: string;
    sourceAccountId: string;
    sourceAccountName: string;
    currency: string;
    amount: BigDecimal;
    hideAmount: boolean;
    scheduledTime: number;
    daysUntil: number;
    utcOffset: number;
}

export interface UpcomingBillsSummary {
    items: UpcomingBillItem[];
    remainingMonthTotalExpense: BigDecimal;
    remainingMonthIncomplete: boolean;
    remainingMonthCount: number;
}

function normalizeDaysAhead(daysAhead: number): number {
    if (!Number.isFinite(daysAhead)) {
        return 0;
    }

    return Math.max(0, Math.floor(daysAhead));
}

function isActiveVisibleScheduleTemplate(template: TransactionTemplate | undefined): template is TransactionTemplate {
    if (!template || template.hidden) {
        return false;
    }

    if (template.templateType !== TemplateType.Schedule.type) {
        return false;
    }

    if (template.scheduledStatus !== undefined && template.scheduledStatus !== ScheduledTransactionStatus.Active) {
        return false;
    }

    if (template.scheduledFrequencyType === ScheduledTemplateFrequencyType.Disabled.type) {
        return false;
    }

    return true;
}

/**
 * Returns the unique 1-indexed { year, month } pairs covered from today through today + daysAhead days.
 */
export function getUpcomingBillMonths(nowUnixTime: number, daysAhead: number): UpcomingBillMonth[] {
    const clampedDaysAhead = normalizeDaysAhead(daysAhead);
    const startDate = parseDateTimeFromUnixTime(nowUnixTime);
    const endDate = startDate.add(clampedDaysAhead, 'days');

    const startYear = startDate.getGregorianCalendarYear();
    const startMonth = startDate.getGregorianCalendarMonth();
    const endYear = endDate.getGregorianCalendarYear();
    const endMonth = endDate.getGregorianCalendarMonth();

    const months: UpcomingBillMonth[] = [];
    let currentYear = startYear;
    let currentMonth = startMonth;

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
        months.push({
            year: currentYear,
            month: currentMonth
        });

        if (currentMonth === 12) {
            currentYear += 1;
            currentMonth = 1;
        } else {
            currentMonth += 1;
        }
    }

    return months;
}

/**
 * Builds sorted upcoming bill items within the lookahead window and computes remaining current-month expense totals.
 */
export function buildUpcomingBillItems(params: BuildUpcomingBillItemsParams): UpcomingBillsSummary {
    const {
        templatesMap,
        occurrences,
        todayStartUnixTime,
        daysAhead,
        currentMonthEndUnixTime,
        accountsMap,
        defaultCurrency,
        getExchangedAmount
    } = params;

    const clampedDaysAhead = normalizeDaysAhead(daysAhead);
    const windowEndUnixTime = todayStartUnixTime + (clampedDaysAhead + 1) * SECONDS_PER_DAY - 1;
    const seenOccurrenceKeys = new Set<string>();
    const items: UpcomingBillItem[] = [];

    let remainingMonthTotalExpense: BigDecimal = BIG_DECIMAL_ZERO;
    let remainingMonthIncomplete = false;
    let remainingMonthCount = 0;

    for (const occurrence of occurrences) {
        const dedupeKey = `${occurrence.templateId}:${occurrence.scheduledTime}`;

        if (seenOccurrenceKeys.has(dedupeKey)) {
            continue;
        }

        seenOccurrenceKeys.add(dedupeKey);

        const template = templatesMap[occurrence.templateId];

        if (!isActiveVisibleScheduleTemplate(template)) {
            continue;
        }

        const account = accountsMap[template.sourceAccountId];
        const currency = account?.currency ?? '';
        const sourceAmount = parseBigDecimal(template.sourceAmount);

        if (template.type === TransactionType.Expense &&
            occurrence.scheduledTime >= todayStartUnixTime &&
            occurrence.scheduledTime <= currentMonthEndUnixTime) {
            remainingMonthCount += 1;

            if (currency === defaultCurrency) {
                remainingMonthTotalExpense = remainingMonthTotalExpense.add(sourceAmount);
            } else {
                const exchangedAmount = getExchangedAmount(sourceAmount, currency, defaultCurrency);

                if (exchangedAmount) {
                    remainingMonthTotalExpense = remainingMonthTotalExpense.add(exchangedAmount.truncate());
                } else {
                    remainingMonthIncomplete = true;
                }
            }
        }

        if (occurrence.scheduledTime >= todayStartUnixTime && occurrence.scheduledTime <= windowEndUnixTime) {
            const daysUntil = Math.max(0, Math.floor((occurrence.scheduledTime - todayStartUnixTime) / SECONDS_PER_DAY));

            items.push({
                id: dedupeKey,
                templateId: template.id,
                name: template.name,
                type: template.type,
                categoryId: template.categoryId,
                sourceAccountId: template.sourceAccountId,
                sourceAccountName: account?.name ?? '',
                currency: currency,
                amount: sourceAmount,
                hideAmount: template.hideAmount,
                scheduledTime: occurrence.scheduledTime,
                daysUntil: daysUntil,
                utcOffset: template.utcOffset
            });
        }
    }

    items.sort((a, b) => {
        if (a.scheduledTime !== b.scheduledTime) {
            return a.scheduledTime - b.scheduledTime;
        }

        return a.name.localeCompare(b.name);
    });

    return {
        items,
        remainingMonthTotalExpense,
        remainingMonthIncomplete,
        remainingMonthCount
    };
}
