import { describe, expect, test } from 'vitest';

import { AccountType } from '@/core/account.ts';
import type { BigDecimal } from '@/core/numeral.ts';
import {
    type SavingsGoalAccountLike,
    type SavingsGoalConfig,
    addManualSavingsToGoal,
    calculateSavingsGoalProgress,
    createSavingsGoalId,
    parseSavingsGoals,
    serializeSavingsGoals
} from '../savings_goal.ts';

function createExchangeRateConverter(rates: Record<string, number>) {
    return (amount: BigDecimal, fromCurrency: string, toCurrency: string): BigDecimal | null => {
        const fromRate = rates[fromCurrency];
        const toRate = rates[toCurrency];
        if (!fromRate || !toRate) {
            return null;
        }
        return amount.multiply(toRate).divide(fromRate);
    };
}

describe('savings goal helpers', () => {
    test('parseSavingsGoals handles empty and malformed inputs', () => {
        expect(parseSavingsGoals('')).toEqual([]);
        expect(parseSavingsGoals('   ')).toEqual([]);
        expect(parseSavingsGoals('not valid json')).toEqual([]);
        expect(parseSavingsGoals('{"id":"1"}')).toEqual([]);
        expect(parseSavingsGoals('[{"id":"1","name":"   "}]')).toEqual([]);
    });

    test('parseSavingsGoals and serializeSavingsGoals sanitize coverImage, color, date, and duplicate account IDs', () => {
        const validCover = '0123456789abcdef0123456789abcdef.webp';
        const raw = JSON.stringify([
            {
                id: 'goal-1',
                name: '  Emergency Fund  ',
                targetAmount: '1000000',
                currency: 'usd',
                mode: 'accounts',
                linkedAccountIds: ['acc-1', 'acc-1', '  acc-2  ', ''],
                manualSavedAmount: '5000',
                monthlyContribution: '25000',
                targetDate: '2027-06-15',
                coverImage: validCover,
                color: '#4CD964'
            },
            {
                id: 'goal-2',
                name: 'Bad Metadata Goal',
                targetAmount: -100,
                currency: 'IDR',
                mode: 'invalid-mode',
                linkedAccountIds: 'not-an-array',
                manualSavedAmount: 'invalid',
                monthlyContribution: '0',
                targetDate: '2026-02-30',
                coverImage: '../evil.png',
                color: 'zzzzzz'
            }
        ]);

        const parsed = parseSavingsGoals(raw);
        expect(parsed).toHaveLength(2);

        expect(parsed[0]).toEqual({
            id: 'goal-1',
            name: 'Emergency Fund',
            targetAmount: '1000000',
            currency: 'USD',
            mode: 'accounts',
            linkedAccountIds: ['acc-1', 'acc-2'],
            manualSavedAmount: '5000',
            monthlyContribution: '25000',
            targetDate: '2027-06-15',
            coverImage: validCover,
            color: '4cd964'
        });

        expect(parsed[1]).toEqual({
            id: 'goal-2',
            name: 'Bad Metadata Goal',
            targetAmount: '0',
            currency: 'IDR',
            mode: 'manual',
            linkedAccountIds: [],
            manualSavedAmount: '0'
        });
        expect(parsed[1]?.coverImage).toBeUndefined();
        expect(parsed[1]?.color).toBeUndefined();
        expect(parsed[1]?.targetDate).toBeUndefined();
        expect(parsed[1]?.monthlyContribution).toBeUndefined();

        const roundTrip = parseSavingsGoals(serializeSavingsGoals(parsed));
        expect(roundTrip).toEqual(parsed);
    });

    test('createSavingsGoalId produces unique non-empty ids', () => {
        const id1 = createSavingsGoalId();
        const id2 = createSavingsGoalId();
        expect(id1.length).toBeGreaterThan(0);
        expect(id2.length).toBeGreaterThan(0);
        expect(id1).not.toBe(id2);
    });

    test('manual mode calculates partial, completed, overfunded, and negative progress accurately', () => {
        const baseGoal: SavingsGoalConfig = {
            id: 'g-manual',
            name: 'Laptop',
            targetAmount: '200000', // 2,000.00
            currency: 'USD',
            mode: 'manual',
            linkedAccountIds: [],
            manualSavedAmount: '50000' // 500.00
        };

        const partial = calculateSavingsGoalProgress(baseGoal);
        expect(partial.savedAmount.toString()).toBe('50000');
        expect(partial.targetAmount.toString()).toBe('200000');
        expect(partial.remainingAmount.toString()).toBe('150000');
        expect(partial.percent).toBe(25);
        expect(partial.rawPercent).toBe(25);
        expect(partial.isCompleted).toBe(false);
        expect(partial.incomplete).toBe(false);

        const completed = calculateSavingsGoalProgress({
            ...baseGoal,
            manualSavedAmount: '200000'
        });
        expect(completed.percent).toBe(100);
        expect(completed.rawPercent).toBe(100);
        expect(completed.remainingAmount.toString()).toBe('0');
        expect(completed.isCompleted).toBe(true);

        const overfunded = calculateSavingsGoalProgress({
            ...baseGoal,
            manualSavedAmount: '300000'
        });
        expect(overfunded.percent).toBe(100);
        expect(overfunded.rawPercent).toBe(150);
        expect(overfunded.remainingAmount.toString()).toBe('0');
        expect(overfunded.isCompleted).toBe(true);

        const negative = calculateSavingsGoalProgress({
            ...baseGoal,
            manualSavedAmount: '-10000'
        });
        expect(negative.savedAmount.toString()).toBe('-10000');
        expect(negative.percent).toBe(0);
        expect(negative.rawPercent).toBe(0);
        expect(negative.remainingAmount.toString()).toBe('210000');
        expect(negative.isCompleted).toBe(false);
    });

    test('addManualSavingsToGoal adds delta cleanly with BigDecimal precision', () => {
        const goal: SavingsGoalConfig = {
            id: 'g-add',
            name: 'Trip',
            targetAmount: '100000',
            currency: 'USD',
            mode: 'manual',
            linkedAccountIds: [],
            manualSavedAmount: '25000'
        };

        const updated = addManualSavingsToGoal(goal, 15000);
        expect(updated.manualSavedAmount).toBe('40000');
    });

    test('accounts mode aggregates multi-currency balances and avoids double counting multi-subaccounts', () => {
        const sub1: SavingsGoalAccountLike = {
            id: 'sub-1',
            type: AccountType.SingleAccount.type,
            currency: 'USD',
            balance: '100000' // 1,000.00 USD
        };
        const sub2: SavingsGoalAccountLike = {
            id: 'sub-2',
            type: AccountType.SingleAccount.type,
            currency: 'EUR',
            balance: '50000' // 500.00 EUR -> 600.00 USD (with rate USD=1, EUR=0.833333? let's use exact rates USD=1.2, EUR=1.0 -> 500 * 1.2 / 1.0 = 600 USD)
        };
        const hiddenSub: SavingsGoalAccountLike = {
            id: 'sub-hidden',
            type: AccountType.SingleAccount.type,
            currency: 'USD',
            balance: '99900',
            hidden: true
        };
        const parentAccount: SavingsGoalAccountLike = {
            id: 'parent-1',
            type: AccountType.MultiSubAccounts.type,
            currency: '---',
            balance: '249900', // container balance must not be double counted
            subAccounts: [sub1, sub2, hiddenSub]
        };
        const singleSavings: SavingsGoalAccountLike = {
            id: 'single-1',
            type: AccountType.SingleAccount.type,
            currency: 'USD',
            balance: '40000' // 400.00 USD
        };
        const unconvertibleAccount: SavingsGoalAccountLike = {
            id: 'foreign-missing',
            type: AccountType.SingleAccount.type,
            currency: 'JPY',
            balance: '100000'
        };
        const zeroForeignAccount: SavingsGoalAccountLike = {
            id: 'foreign-zero',
            type: AccountType.SingleAccount.type,
            currency: 'JPY',
            balance: '0'
        };

        const accountsMap: Record<string, SavingsGoalAccountLike> = {
            'parent-1': parentAccount,
            'sub-1': sub1,
            'sub-2': sub2,
            'sub-hidden': hiddenSub,
            'single-1': singleSavings,
            'foreign-missing': unconvertibleAccount,
            'foreign-zero': zeroForeignAccount
        };

        const getExchangedAmount = createExchangeRateConverter({
            USD: 1.2,
            EUR: 1.0
        });

        // Both parent-1 AND sub-1/sub-2 are passed (mimicking AccountFilterSettingsDialog output)
        const goalWithParentAndSubs: SavingsGoalConfig = {
            id: 'g-acc-1',
            name: 'House Down Payment',
            targetAmount: '400000', // 4,000.00 USD
            currency: 'USD',
            mode: 'accounts',
            linkedAccountIds: ['parent-1', 'sub-1', 'sub-2', 'single-1', 'missing-id'],
            manualSavedAmount: '0'
        };

        const progress = calculateSavingsGoalProgress(goalWithParentAndSubs, {
            accountsMap,
            getExchangedAmount
        });

        // 1000 USD + 600 USD + 400 USD = 2000 USD (200000), hidden sub-account excluded
        expect(progress.savedAmount.toString()).toBe('200000');
        expect(progress.percent).toBe(50);
        expect(progress.incomplete).toBe(false);

        // Selecting only a single subaccount works without including siblings
        const subOnlyProgress = calculateSavingsGoalProgress({
            ...goalWithParentAndSubs,
            linkedAccountIds: ['sub-1']
        }, { accountsMap, getExchangedAmount });
        expect(subOnlyProgress.savedAmount.toString()).toBe('100000');

        // Missing exchange rate marks incomplete: true
        const missingRateProgress = calculateSavingsGoalProgress({
            ...goalWithParentAndSubs,
            linkedAccountIds: ['single-1', 'foreign-missing']
        }, { accountsMap, getExchangedAmount });
        expect(missingRateProgress.savedAmount.toString()).toBe('40000');
        expect(missingRateProgress.incomplete).toBe(true);

        // Zero-balance foreign account without rate does not flag incomplete
        const zeroForeignProgress = calculateSavingsGoalProgress({
            ...goalWithParentAndSubs,
            linkedAccountIds: ['single-1', 'foreign-zero']
        }, { accountsMap, getExchangedAmount });
        expect(zeroForeignProgress.savedAmount.toString()).toBe('40000');
        expect(zeroForeignProgress.incomplete).toBe(false);
    });

    test('accounts mode keeps true negative sum while clamping percent to 0', () => {
        const accountsMap: Record<string, SavingsGoalAccountLike> = {
            'neg-1': {
                id: 'neg-1',
                type: AccountType.SingleAccount.type,
                currency: 'USD',
                balance: '-25000'
            }
        };

        const progress = calculateSavingsGoalProgress({
            id: 'g-neg',
            name: 'Emergency',
            targetAmount: '100000',
            currency: 'USD',
            mode: 'accounts',
            linkedAccountIds: ['neg-1'],
            manualSavedAmount: '0'
        }, { accountsMap });

        expect(progress.savedAmount.toString()).toBe('-25000');
        expect(progress.percent).toBe(0);
        expect(progress.rawPercent).toBe(0);
        expect(progress.remainingAmount.toString()).toBe('125000');
        expect(progress.isCompleted).toBe(false);
    });

    test('calculates estimatedMonthsToGoal and requiredMonthlyToHitTargetDate accurately', () => {
        const goal: SavingsGoalConfig = {
            id: 'g-plan',
            name: 'Vacation',
            targetAmount: '100000', // 1,000.00
            currency: 'USD',
            mode: 'manual',
            linkedAccountIds: [],
            manualSavedAmount: '25000', // 250.00 -> remaining 750.00 (75000)
            monthlyContribution: '20000', // 200.00 -> ceil(750/200) = 4
            targetDate: '2027-02-15'
        };

        const progress = calculateSavingsGoalProgress(goal, {
            nowDate: '2026-11-26' // 3 months to 2027-02-15
        });

        expect(progress.estimatedMonthsToGoal).toBe(4);
        expect(progress.requiredMonthlyToHitTargetDate?.toString()).toBe('25000'); // 75000 / 3 = 25000

        // Same-month future date clamps remaining months to min 1
        const sameMonthProgress = calculateSavingsGoalProgress({
            ...goal,
            monthlyContribution: '25000', // exact division 75000 / 25000 = 3
            targetDate: '2026-11-30'
        }, {
            nowDate: '2026-11-26'
        });
        expect(sameMonthProgress.estimatedMonthsToGoal).toBe(3);
        expect(sameMonthProgress.requiredMonthlyToHitTargetDate?.toString()).toBe('75000');

        // Past or today targetDate returns null for requiredMonthlyToHitTargetDate
        const pastDateProgress = calculateSavingsGoalProgress({
            ...goal,
            targetDate: '2026-11-26'
        }, {
            nowDate: '2026-11-26'
        });
        expect(pastDateProgress.requiredMonthlyToHitTargetDate).toBeNull();

        // Completed goal returns null for both estimates
        const completedProgress = calculateSavingsGoalProgress({
            ...goal,
            manualSavedAmount: '100000'
        }, {
            nowDate: '2026-11-26'
        });
        expect(completedProgress.isCompleted).toBe(true);
        expect(completedProgress.estimatedMonthsToGoal).toBeNull();
        expect(completedProgress.requiredMonthlyToHitTargetDate).toBeNull();
    });

    test('handles zero targetAmount without division errors', () => {
        const progress = calculateSavingsGoalProgress({
            id: 'g-zero',
            name: 'Empty Target',
            targetAmount: '0',
            currency: 'USD',
            mode: 'manual',
            linkedAccountIds: [],
            manualSavedAmount: '5000',
            monthlyContribution: '1000',
            targetDate: '2027-01-01'
        }, {
            nowDate: '2026-11-26'
        });

        expect(progress.percent).toBe(0);
        expect(progress.rawPercent).toBe(0);
        expect(progress.isCompleted).toBe(false);
        expect(progress.estimatedMonthsToGoal).toBeNull();
        expect(progress.requiredMonthlyToHitTargetDate).toBeNull();
    });
});
