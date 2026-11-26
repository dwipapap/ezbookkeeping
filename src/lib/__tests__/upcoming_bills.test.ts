import { describe, expect, test } from 'vitest';
import moment from 'moment-timezone';

import { TransactionType } from '@/core/transaction.ts';
import {
    TemplateType,
    ScheduledTransactionStatus,
    ScheduledTemplateFrequencyType
} from '@/core/template.ts';
import { TransactionTemplate } from '@/models/transaction_template.ts';
import { parseBigDecimal } from '@/lib/numeral.ts';

import {
    getUpcomingBillMonths,
    buildUpcomingBillItems
} from '../upcoming_bills.ts';

function createScheduleTemplate(overrides: Partial<{
    id: string;
    templateType: number;
    name: string;
    type: number;
    categoryId: string;
    sourceAccountId: string;
    sourceAmount: number;
    hideAmount: boolean;
    hidden: boolean;
    scheduledStatus: ScheduledTransactionStatus | undefined;
    scheduledFrequencyType: number;
    utcOffset: number;
}> = {}): TransactionTemplate {
    const template = TransactionTemplate.ofTemplate({
        id: overrides.id ?? 'tpl-1',
        timeSequenceId: '',
        type: overrides.type ?? TransactionType.Expense,
        categoryId: overrides.categoryId ?? 'cat-1',
        time: 0,
        utcOffset: overrides.utcOffset ?? 0,
        sourceAccountId: overrides.sourceAccountId ?? 'acc-usd',
        destinationAccountId: '0',
        sourceAmount: overrides.sourceAmount ?? 1500,
        destinationAmount: 0,
        hideAmount: overrides.hideAmount ?? false,
        tagIds: [],
        comment: '',
        editable: true,
        templateType: overrides.templateType ?? TemplateType.Schedule.type,
        name: overrides.name ?? 'Netflix',
        scheduledFrequencyType: overrides.scheduledFrequencyType ?? ScheduledTemplateFrequencyType.Monthly.type,
        scheduledFrequency: '1',
        displayOrder: 1,
        hidden: overrides.hidden ?? false
    });

    if ('scheduledStatus' in overrides) {
        template.scheduledStatus = overrides.scheduledStatus;
    }

    return template;
}

describe('getUpcomingBillMonths', () => {
    test('returns single month when lookahead stays within the same month', () => {
        const now = moment('2026-05-10 09:00:00', 'YYYY-MM-DD HH:mm:ss').unix();
        expect(getUpcomingBillMonths(now, 14)).toEqual([
            { year: 2026, month: 5 }
        ]);
    });

    test('handles month rollover within the same year', () => {
        const now = moment('2026-11-26 09:00:00', 'YYYY-MM-DD HH:mm:ss').unix();
        expect(getUpcomingBillMonths(now, 14)).toEqual([
            { year: 2026, month: 11 },
            { year: 2026, month: 12 }
        ]);
    });

    test('handles December to January year rollover', () => {
        const now = moment('2026-12-25 18:30:00', 'YYYY-MM-DD HH:mm:ss').unix();
        expect(getUpcomingBillMonths(now, 14)).toEqual([
            { year: 2026, month: 12 },
            { year: 2027, month: 1 }
        ]);
    });

    test('handles Jan 31 + 30 days without skipping February', () => {
        const now = moment('2026-01-31 12:00:00', 'YYYY-MM-DD HH:mm:ss').unix();
        expect(getUpcomingBillMonths(now, 30)).toEqual([
            { year: 2026, month: 1 },
            { year: 2026, month: 2 },
            { year: 2026, month: 3 }
        ]);
    });

    test('handles zero and negative daysAhead safely', () => {
        const now = moment('2026-03-31 23:59:00', 'YYYY-MM-DD HH:mm:ss').unix();
        expect(getUpcomingBillMonths(now, 0)).toEqual([
            { year: 2026, month: 3 }
        ]);
        expect(getUpcomingBillMonths(now, -5)).toEqual([
            { year: 2026, month: 3 }
        ]);
    });
});

describe('buildUpcomingBillItems', () => {
    const DAY = 86400;
    const todayStart = 1700000000; // arbitrary aligned start-of-day unix timestamp
    const currentMonthEnd = todayStart + 10 * DAY - 1; // 10 days remaining in current month
    const accountsMap = {
        'acc-usd': { currency: 'USD', name: 'Main Checking' },
        'acc-eur': { currency: 'EUR', name: 'Euro Card' },
        'acc-jpy': { currency: 'JPY', name: 'Tokyo Bank' }
    };

    test('filters occurrences to [todayStart, todayStart + (daysAhead + 1) * 86400 - 1] and computes daysUntil', () => {
        const tplToday = createScheduleTemplate({ id: 'tpl-today', name: 'Rent' });
        const tplTomorrow = createScheduleTemplate({ id: 'tpl-tomorrow', name: 'Spotify' });
        const tplFuture = createScheduleTemplate({ id: 'tpl-future', name: 'Gym' });
        const tplBoundaryEnd = createScheduleTemplate({ id: 'tpl-boundary-end', name: 'Boundary End' });
        const tplPast = createScheduleTemplate({ id: 'tpl-past', name: 'Past Bill' });
        const tplTooFar = createScheduleTemplate({ id: 'tpl-far', name: 'Too Far' });

        const templatesMap = {
            [tplToday.id]: tplToday,
            [tplTomorrow.id]: tplTomorrow,
            [tplFuture.id]: tplFuture,
            [tplBoundaryEnd.id]: tplBoundaryEnd,
            [tplPast.id]: tplPast,
            [tplTooFar.id]: tplTooFar
        };

        const daysAhead = 7;
        const result = buildUpcomingBillItems({
            templatesMap,
            occurrences: [
                { templateId: 'tpl-past', scheduledTime: todayStart - 1 },
                { templateId: 'tpl-today', scheduledTime: todayStart + 3600 },
                { templateId: 'tpl-tomorrow', scheduledTime: todayStart + DAY + 7200 },
                { templateId: 'tpl-future', scheduledTime: todayStart + 5 * DAY },
                { templateId: 'tpl-boundary-end', scheduledTime: todayStart + (daysAhead + 1) * DAY - 1 },
                { templateId: 'tpl-far', scheduledTime: todayStart + (daysAhead + 1) * DAY }
            ],
            todayStartUnixTime: todayStart,
            daysAhead,
            currentMonthEndUnixTime: currentMonthEnd,
            accountsMap,
            defaultCurrency: 'USD',
            getExchangedAmount: () => null
        });

        expect(result.items.map(item => ({ id: item.templateId, daysUntil: item.daysUntil }))).toEqual([
            { id: 'tpl-today', daysUntil: 0 },
            { id: 'tpl-tomorrow', daysUntil: 1 },
            { id: 'tpl-future', daysUntil: 5 },
            { id: 'tpl-boundary-end', daysUntil: 7 }
        ]);
    });

    test('sorts chronologically by scheduledTime ascending and tie-breaks by template name', () => {
        const tplZeta = createScheduleTemplate({ id: 'tpl-z', name: 'Zeta Cloud' });
        const tplAlpha = createScheduleTemplate({ id: 'tpl-a', name: 'Alpha Water' });
        const tplEarly = createScheduleTemplate({ id: 'tpl-e', name: 'Early Gas' });

        const result = buildUpcomingBillItems({
            templatesMap: {
                [tplZeta.id]: tplZeta,
                [tplAlpha.id]: tplAlpha,
                [tplEarly.id]: tplEarly
            },
            occurrences: [
                { templateId: 'tpl-z', scheduledTime: todayStart + 2 * DAY },
                { templateId: 'tpl-a', scheduledTime: todayStart + 2 * DAY },
                { templateId: 'tpl-e', scheduledTime: todayStart + DAY }
            ],
            todayStartUnixTime: todayStart,
            daysAhead: 14,
            currentMonthEndUnixTime: currentMonthEnd,
            accountsMap,
            defaultCurrency: 'USD',
            getExchangedAmount: () => null
        });

        expect(result.items.map(item => item.name)).toEqual([
            'Early Gas',
            'Alpha Water',
            'Zeta Cloud'
        ]);
    });

    test('deduplicates occurrences by templateId and scheduledTime', () => {
        const tpl = createScheduleTemplate({ id: 'tpl-1', name: 'Internet', sourceAmount: 5000 });

        const result = buildUpcomingBillItems({
            templatesMap: { [tpl.id]: tpl },
            occurrences: [
                { templateId: 'tpl-1', scheduledTime: todayStart + DAY },
                { templateId: 'tpl-1', scheduledTime: todayStart + DAY },
                { templateId: 'tpl-1', scheduledTime: todayStart + 2 * DAY }
            ],
            todayStartUnixTime: todayStart,
            daysAhead: 14,
            currentMonthEndUnixTime: currentMonthEnd,
            accountsMap,
            defaultCurrency: 'USD',
            getExchangedAmount: () => null
        });

        expect(result.items).toHaveLength(2);
        expect(result.remainingMonthCount).toBe(2);
        expect(result.remainingMonthTotalExpense.toString()).toBe('10000');
    });

    test('ignores hidden, inactive, disabled-frequency, normal, and missing templates', () => {
        const activeTpl = createScheduleTemplate({ id: 'tpl-active', name: 'Active Bill', sourceAmount: 2000 });
        const hiddenTpl = createScheduleTemplate({ id: 'tpl-hidden', name: 'Hidden Bill', hidden: true, sourceAmount: 3000 });
        const disabledTpl = createScheduleTemplate({ id: 'tpl-disabled', name: 'Disabled Bill', scheduledStatus: ScheduledTransactionStatus.Disabled, sourceAmount: 4000 });
        const expiredTpl = createScheduleTemplate({ id: 'tpl-expired', name: 'Expired Bill', scheduledStatus: ScheduledTransactionStatus.Expired, sourceAmount: 5000 });
        const freqDisabledTpl = createScheduleTemplate({ id: 'tpl-freq-disabled', name: 'Freq Disabled', scheduledFrequencyType: ScheduledTemplateFrequencyType.Disabled.type, sourceAmount: 6000 });
        const normalTpl = createScheduleTemplate({ id: 'tpl-normal', name: 'Normal Template', templateType: TemplateType.Normal.type, sourceAmount: 7000 });

        const result = buildUpcomingBillItems({
            templatesMap: {
                [activeTpl.id]: activeTpl,
                [hiddenTpl.id]: hiddenTpl,
                [disabledTpl.id]: disabledTpl,
                [expiredTpl.id]: expiredTpl,
                [freqDisabledTpl.id]: freqDisabledTpl,
                [normalTpl.id]: normalTpl
            },
            occurrences: [
                { templateId: 'tpl-active', scheduledTime: todayStart + DAY },
                { templateId: 'tpl-hidden', scheduledTime: todayStart + DAY },
                { templateId: 'tpl-disabled', scheduledTime: todayStart + DAY },
                { templateId: 'tpl-expired', scheduledTime: todayStart + DAY },
                { templateId: 'tpl-freq-disabled', scheduledTime: todayStart + DAY },
                { templateId: 'tpl-normal', scheduledTime: todayStart + DAY },
                { templateId: 'tpl-missing', scheduledTime: todayStart + DAY }
            ],
            todayStartUnixTime: todayStart,
            daysAhead: 14,
            currentMonthEndUnixTime: currentMonthEnd,
            accountsMap,
            defaultCurrency: 'USD',
            getExchangedAmount: () => null
        });

        expect(result.items).toHaveLength(1);
        expect(result.items[0]?.templateId).toBe('tpl-active');
        expect(result.remainingMonthCount).toBe(1);
        expect(result.remainingMonthTotalExpense.toString()).toBe('2000');
    });

    test('computes multi-currency remaining-month expense total, count, and incomplete flag', () => {
        const usdBill = createScheduleTemplate({
            id: 'tpl-usd',
            name: 'USD Electric',
            type: TransactionType.Expense,
            sourceAccountId: 'acc-usd',
            sourceAmount: 2500
        });
        const eurBill = createScheduleTemplate({
            id: 'tpl-eur',
            name: 'EUR Hosting',
            type: TransactionType.Expense,
            sourceAccountId: 'acc-eur',
            sourceAmount: 1000
        });
        const jpyBill = createScheduleTemplate({
            id: 'tpl-jpy',
            name: 'JPY Train Pass',
            type: TransactionType.Expense,
            sourceAccountId: 'acc-jpy',
            sourceAmount: 5000
        });
        const salaryIncome = createScheduleTemplate({
            id: 'tpl-salary',
            name: 'Paycheck',
            type: TransactionType.Income,
            sourceAccountId: 'acc-usd',
            sourceAmount: 100000
        });
        const transferTpl = createScheduleTemplate({
            id: 'tpl-transfer',
            name: 'Savings Transfer',
            type: TransactionType.Transfer,
            sourceAccountId: 'acc-usd',
            sourceAmount: 30000
        });
        const nextMonthBill = createScheduleTemplate({
            id: 'tpl-next-month',
            name: 'Next Month Rent',
            type: TransactionType.Expense,
            sourceAccountId: 'acc-usd',
            sourceAmount: 90000
        });

        const templatesMap = {
            [usdBill.id]: usdBill,
            [eurBill.id]: eurBill,
            [jpyBill.id]: jpyBill,
            [salaryIncome.id]: salaryIncome,
            [transferTpl.id]: transferTpl,
            [nextMonthBill.id]: nextMonthBill
        };

        // Case 1: all foreign currencies convert cleanly
        const completeResult = buildUpcomingBillItems({
            templatesMap,
            occurrences: [
                { templateId: 'tpl-usd', scheduledTime: todayStart + DAY },
                { templateId: 'tpl-eur', scheduledTime: todayStart + 2 * DAY },
                { templateId: 'tpl-salary', scheduledTime: todayStart + 3 * DAY },
                { templateId: 'tpl-transfer', scheduledTime: todayStart + 4 * DAY },
                { templateId: 'tpl-next-month', scheduledTime: currentMonthEnd + 1 }
            ],
            todayStartUnixTime: todayStart,
            daysAhead: 14,
            currentMonthEndUnixTime: currentMonthEnd,
            accountsMap,
            defaultCurrency: 'USD',
            getExchangedAmount: (amount, fromCurrency, toCurrency) => {
                if (fromCurrency === 'EUR' && toCurrency === 'USD') {
                    return amount.multiply(parseBigDecimal('1.1'));
                }
                return null;
            }
        });

        // 2500 USD + (1000 EUR * 1.1 = 1100 USD) = 3600 USD; income, transfer, and next-month bill excluded from remainingMonthTotalExpense
        expect(completeResult.remainingMonthTotalExpense.toString()).toBe('3600');
        expect(completeResult.remainingMonthIncomplete).toBe(false);
        expect(completeResult.remainingMonthCount).toBe(2);
        // All 5 occurrences fall within 14-day lookahead window
        expect(completeResult.items).toHaveLength(5);

        // Case 2: JPY conversion returns null -> incomplete flag true while still counting remainingMonthCount & convertible amounts
        const incompleteResult = buildUpcomingBillItems({
            templatesMap,
            occurrences: [
                { templateId: 'tpl-usd', scheduledTime: todayStart + DAY },
                { templateId: 'tpl-eur', scheduledTime: todayStart + 2 * DAY },
                { templateId: 'tpl-jpy', scheduledTime: todayStart + 3 * DAY }
            ],
            todayStartUnixTime: todayStart,
            daysAhead: 14,
            currentMonthEndUnixTime: currentMonthEnd,
            accountsMap,
            defaultCurrency: 'USD',
            getExchangedAmount: (amount, fromCurrency, toCurrency) => {
                if (fromCurrency === 'EUR' && toCurrency === 'USD') {
                    return amount.multiply(parseBigDecimal('1.1'));
                }
                return null;
            }
        });

        expect(incompleteResult.remainingMonthTotalExpense.toString()).toBe('3600');
        expect(incompleteResult.remainingMonthIncomplete).toBe(true);
        expect(incompleteResult.remainingMonthCount).toBe(3);
    });
});
