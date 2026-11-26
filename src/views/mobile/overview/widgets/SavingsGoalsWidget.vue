<template>
    <div class="savings-goals-mobile-widget">
        <f7-list strong inset dividers class="overview-widget-list no-margin-top margin-bottom" :class="{ 'skeleton-text': loading }">
            <f7-list-item group-title v-if="showTitle">
                <div class="display-flex justify-content-space-between align-items-center width-100">
                    <small>{{ title || tt('Savings Goals') }}</small>
                    <f7-link icon-f7="gear_alt" icon-size="16"
                             :class="{ 'disabled': editing || loading }"
                             :aria-label="tt('Manage Goals')"
                             @click="openManagePopup(false)"></f7-link>
                </div>
            </f7-list-item>

            <template v-if="loading && !goals.length">
                <f7-list-item class="item-title-full-line" :key="idx" v-for="idx in skeletonCount">
                    <template #title>
                        <div class="display-flex justify-content-space-between">
                            <span>Savings Goal</span>
                            <span>50%</span>
                        </div>
                        <div class="margin-top-half">0.00 USD / 0.00 USD</div>
                        <f7-progressbar class="margin-top-half" :progress="50"></f7-progressbar>
                    </template>
                </f7-list-item>
            </template>

            <f7-list-item class="item-title-full-line" v-else-if="!loading && !goals.length">
                <template #title>
                    <div class="display-flex flex-direction-column align-items-center padding-vertical-half text-align-center">
                        <span class="text-color-gray">{{ tt('No savings goals yet') }}</span>
                        <f7-button fill round small class="margin-top-half" :disabled="editing"
                                   @click="openManagePopup(true)">
                            {{ tt('Create Goal') }}
                        </f7-button>
                    </div>
                </template>
            </f7-list-item>

            <template v-else>
                <f7-list-item class="savings-goals-mobile-cards-item item-no-divider">
                    <template #inner>
                        <div class="savings-goals-mobile-cards">
                            <div
                                class="savings-goal-mobile-card"
                                :class="{ 'savings-goal-mobile-card--has-cover': !!coverUrls[item.goal.id] }"
                                :style="getItemStyle(item.goal)"
                                :key="item.goal.id"
                                v-for="item in displayGoalItems"
                            >
                                <div class="savings-goal-mobile-card__overlay" v-if="coverUrls[item.goal.id]"></div>

                                <div class="savings-goal-mobile-card__content">
                                    <div class="savings-goal-mobile-card__header">
                                        <div class="display-flex align-items-center min-width-0">
                                            <span class="savings-goal-mobile-card__dot" :style="getDotStyle(item.goal)"></span>
                                            <span class="savings-goal-mobile-card__name">{{ item.goal.name }}</span>
                                        </div>
                                        <span class="savings-goal-mobile-card__badge savings-goal-mobile-card__badge--completed" v-if="item.progress.isCompleted">
                                            {{ tt('Completed') }}
                                        </span>
                                        <span class="savings-goal-mobile-card__percent" v-else>
                                            {{ formatPercentToLocalizedNumerals(item.progress.rawPercent, 0, '<1') }}
                                        </span>
                                    </div>

                                    <div class="savings-goal-mobile-card__amounts">
                                        <span class="savings-goal-mobile-card__saved">
                                            {{ formatGoalAmount(item.progress.savedAmount, item.currency, item.progress.incomplete) }}
                                        </span>
                                        <span class="savings-goal-mobile-card__target">
                                            / {{ formatGoalAmount(item.progress.targetAmount, item.currency, false) }}
                                        </span>
                                    </div>

                                    <div class="savings-goal-mobile-card__track">
                                        <div
                                            class="savings-goal-mobile-card__fill"
                                            :style="getProgressFillStyle(item)"
                                        ></div>
                                    </div>

                                    <div class="savings-goal-mobile-card__footer" v-if="hasFooterContent(item)">
                                        <small class="savings-goal-mobile-card__meta">
                                            <span v-if="item.estimateText">{{ item.estimateText }}</span>
                                            <span v-else-if="item.goal.mode === 'accounts'">
                                                {{ tt('Linked Accounts') }} ({{ item.goal.linkedAccountIds.length }})
                                            </span>
                                        </small>

                                        <button
                                            type="button"
                                            class="savings-goal-mobile-card__quick-add"
                                            :class="{ 'savings-goal-mobile-card__quick-add--glass': !!coverUrls[item.goal.id] }"
                                            v-if="item.goal.mode === 'manual' && !editing"
                                            @click="openQuickAddSheet(item.goal, item.currency)"
                                        >
                                            {{ tt('+ Add Savings') }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </f7-list-item>

                <f7-list-item link="#" no-chevron :title="tt('Manage Goals')"
                              v-if="!showTitle && !editing"
                              @click="openManagePopup(false)"></f7-list-item>
            </template>
        </f7-list>

        <savings-goal-manage-popup v-model:show="showManagePopup" :start-creating="startCreatingInPopup" />

        <number-pad-sheet
            :min-value="0"
            :max-value="TRANSACTION_MAX_AMOUNT"
            :currency="quickAddCurrency"
            :hint="quickAddGoal?.name"
            v-model:show="showQuickAddSheet"
            v-model="quickAddAmount"
            @update:model-value="onQuickAddConfirmed"
        />
    </div>
</template>

<script setup lang="ts">
import SavingsGoalManagePopup from '../SavingsGoalManagePopup.vue';

import { ref, computed, watch } from 'vue';

import { useI18n } from '@/locales/helpers.ts';

import { useSettingsStore } from '@/stores/setting.ts';
import { useUserStore } from '@/stores/user.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useExchangeRatesStore } from '@/stores/exchangeRates.ts';

import type { BigDecimal } from '@/core/numeral.ts';
import type { TextualYearMonthDay } from '@/core/datetime.ts';
import { AMOUNT_FACTOR, DISPLAY_HIDDEN_AMOUNT, INCOMPLETE_AMOUNT_SUFFIX } from '@/consts/numeral.ts';
import { TRANSACTION_MAX_AMOUNT } from '@/consts/transaction.ts';

import {
    getCachedOverviewCoverObjectUrl,
    getOverviewCoverObjectUrl
} from '@/lib/overview_cover.ts';
import {
    type SavingsGoalConfig,
    type SavingsGoalProgressResult,
    addManualSavingsToGoal,
    calculateSavingsGoalProgress,
    parseSavingsGoals,
    serializeSavingsGoals
} from '@/lib/savings_goal.ts';

interface DisplayGoalItem {
    goal: SavingsGoalConfig;
    currency: string;
    progress: SavingsGoalProgressResult;
    estimateText: string;
}

const props = defineProps<{
    loading: boolean;
    title?: string;
    showTitle: boolean;
    editing?: boolean;
    itemCount: number;
}>();

const {
    tt,
    formatAmountToLocalizedNumeralsWithCurrency,
    formatNumberToLocalizedNumerals,
    formatPercentToLocalizedNumerals,
    formatGregorianTextualYearMonthDayToLongDate
} = useI18n();

const settingsStore = useSettingsStore();
const userStore = useUserStore();
const accountsStore = useAccountsStore();
const exchangeRatesStore = useExchangeRatesStore();

const showManagePopup = ref<boolean>(false);
const startCreatingInPopup = ref<boolean>(false);
const coverUrls = ref<Record<string, string | null>>({});

const showQuickAddSheet = ref<boolean>(false);
const quickAddGoal = ref<SavingsGoalConfig | null>(null);
const quickAddCurrency = ref<string>('');
const quickAddAmount = ref<number>(0);

const showAmountInHomePage = computed<boolean>(() => settingsStore.appSettings.showAmountInHomePage);
const defaultCurrency = computed<string>(() => userStore.currentUserDefaultCurrency);
const goals = computed<SavingsGoalConfig[]>(() => parseSavingsGoals(settingsStore.appSettings.savingsGoals));

const skeletonCount = computed<number>(() => {
    const count = props.itemCount > 0 ? props.itemCount : 3;
    return Math.min(count, 4);
});

const displayGoalItems = computed<DisplayGoalItem[]>(() => {
    const maxItems = props.itemCount > 0 ? props.itemCount : goals.value.length;
    return goals.value.slice(0, maxItems).map(goal => {
        const currency = goal.currency || defaultCurrency.value;
        const progress = calculateSavingsGoalProgress(goal, {
            accountsMap: accountsStore.allAccountsMap,
            getExchangedAmount: exchangeRatesStore.getExchangedAmount,
            defaultCurrency: defaultCurrency.value
        });
        return {
            goal,
            currency,
            progress,
            estimateText: buildEstimateText(goal, progress, currency)
        };
    });
});

function formatGoalAmount(amount: BigDecimal, currency: string, incomplete: boolean): string {
    if (!showAmountInHomePage.value) {
        return formatAmountToLocalizedNumeralsWithCurrency(DISPLAY_HIDDEN_AMOUNT, currency);
    }
    return formatAmountToLocalizedNumeralsWithCurrency(amount, currency) + (incomplete ? INCOMPLETE_AMOUNT_SUFFIX : '');
}

function formatRoundedMonthlyAmount(amount: BigDecimal, currency: string): string {
    const roundedToMajor = amount.divide(AMOUNT_FACTOR).truncate().multiply(AMOUNT_FACTOR);
    return formatGoalAmount(roundedToMajor.isPositive() ? roundedToMajor : amount.truncate(), currency, false);
}

function buildEstimateText(goal: SavingsGoalConfig, progress: SavingsGoalProgressResult, currency: string): string {
    if (!progress.isCompleted && progress.estimatedMonthsToGoal !== null) {
        return tt('~{n} mo left', { n: formatNumberToLocalizedNumerals(progress.estimatedMonthsToGoal) });
    }

    if (goal.targetDate) {
        if (!progress.isCompleted && progress.requiredMonthlyToHitTargetDate) {
            const monthlyStr = formatRoundedMonthlyAmount(progress.requiredMonthlyToHitTargetDate, currency);
            return tt('{amount}/mo needed', { amount: monthlyStr });
        }

        return formatGregorianTextualYearMonthDayToLongDate(goal.targetDate as TextualYearMonthDay);
    }

    return '';
}

function hasFooterContent(item: DisplayGoalItem): boolean {
    return !!item.estimateText || item.goal.mode === 'accounts' || (item.goal.mode === 'manual' && !props.editing);
}

function getItemStyle(goal: SavingsGoalConfig): Record<string, string> {
    const url = coverUrls.value[goal.id];
    if (!url) {
        return {};
    }
    return {
        'background-image': `url("${url}")`,
        'background-size': 'cover',
        'background-position': 'center center'
    };
}

function getDotStyle(goal: SavingsGoalConfig): Record<string, string> {
    if (goal.color) {
        return { 'background-color': `#${goal.color}` };
    }
    return { 'background-color': 'var(--f7-theme-color)' };
}

function getProgressFillStyle(item: DisplayGoalItem): Record<string, string> {
    let color = 'var(--f7-theme-color)';
    if (item.progress.isCompleted) {
        color = 'var(--f7-color-green, #34c759)';
    } else if (item.goal.color) {
        color = `#${item.goal.color}`;
    }

    return {
        width: `${item.progress.percent}%`,
        'background-color': color
    };
}

function openManagePopup(startCreating: boolean): void {
    if (props.editing) {
        return;
    }
    startCreatingInPopup.value = startCreating;
    showManagePopup.value = true;
}

function openQuickAddSheet(goal: SavingsGoalConfig, currency: string): void {
    if (props.editing) {
        return;
    }
    quickAddGoal.value = goal;
    quickAddCurrency.value = currency;
    quickAddAmount.value = 0;
    showQuickAddSheet.value = true;
}

function onQuickAddConfirmed(addedAmount: number): void {
    const targetGoal = quickAddGoal.value;
    if (!targetGoal || !Number.isFinite(addedAmount) || addedAmount <= 0) {
        return;
    }

    const updatedGoals = goals.value.map(item =>
        item.id === targetGoal.id ? addManualSavingsToGoal(item, Math.trunc(addedAmount)) : item
    );
    settingsStore.setSavingsGoals(serializeSavingsGoals(updatedGoals));
}

watch(goals, (newGoals) => {
    for (const goal of newGoals) {
        if (!goal.coverImage) {
            coverUrls.value[goal.id] = null;
            continue;
        }

        coverUrls.value[goal.id] = getCachedOverviewCoverObjectUrl(goal.coverImage);
        const goalId = goal.id;
        const requested = goal.coverImage;
        getOverviewCoverObjectUrl(requested).then(url => {
            const current = goals.value.find(g => g.id === goalId);
            if (current?.coverImage === requested) {
                coverUrls.value[goalId] = url;
            }
        });
    }
}, { immediate: true });
</script>

<style scoped>
.savings-goals-mobile-widget > .list {
    margin-block-start: 0 !important;
    margin-block-end: 0 !important;
}

.savings-goals-mobile-cards-item :deep(.item-content) {
    padding-inline-start: 12px;
}

.savings-goals-mobile-cards-item :deep(.item-inner) {
    padding-inline-end: 12px;
    padding-top: 6px;
    padding-bottom: 12px;
}

.savings-goals-mobile-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
}

.savings-goal-mobile-card {
    position: relative;
    overflow: hidden;
    border-radius: 18px;
    padding: 14px 16px;
    background-color: rgba(128, 128, 128, 0.08);
}

:root.dark .savings-goal-mobile-card:not(.savings-goal-mobile-card--has-cover) {
    background-color: rgba(255, 255, 255, 0.06);
}

.savings-goal-mobile-card--has-cover {
    color: #ffffff;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}

.savings-goal-mobile-card__overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(12, 10, 24, 0.34) 0%, rgba(12, 10, 24, 0.82) 100%);
    pointer-events: none;
    z-index: 0;
}

.savings-goal-mobile-card__content {
    position: relative;
    z-index: 1;
    width: 100%;
}

.savings-goal-mobile-card--has-cover .savings-goal-mobile-card__content {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.savings-goal-mobile-card__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.savings-goal-mobile-card__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-inline-end: 8px;
    flex-shrink: 0;
}

.savings-goal-mobile-card__name {
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.savings-goal-mobile-card__percent {
    font-size: 0.82rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    padding: 2px 8px;
    border-radius: 999px;
    background-color: rgba(128, 128, 128, 0.14);
    flex-shrink: 0;
}

.savings-goal-mobile-card--has-cover .savings-goal-mobile-card__percent {
    background-color: rgba(255, 255, 255, 0.22);
    color: #ffffff;
}

.savings-goal-mobile-card__badge--completed {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background-color: var(--f7-color-green, #34c759);
    color: #ffffff;
    flex-shrink: 0;
}

.savings-goal-mobile-card__amounts {
    margin-top: 6px;
    font-size: 0.88rem;
    font-variant-numeric: tabular-nums;
}

.savings-goal-mobile-card__saved {
    font-weight: 600;
}

.savings-goal-mobile-card__target {
    opacity: 0.7;
    font-size: 0.8rem;
}

.savings-goal-mobile-card__track {
    width: 100%;
    height: 7px;
    margin-top: 10px;
    border-radius: 999px;
    background-color: rgba(128, 128, 128, 0.18);
    overflow: hidden;
}

.savings-goal-mobile-card--has-cover .savings-goal-mobile-card__track {
    background-color: rgba(255, 255, 255, 0.26);
}

.savings-goal-mobile-card__fill {
    height: 100%;
    border-radius: 999px;
}

.savings-goal-mobile-card__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
}

.savings-goal-mobile-card__meta {
    font-size: 0.78rem;
    opacity: 0.78;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
}

.savings-goal-mobile-card__quick-add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: auto !important;
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background-color: rgba(var(--f7-theme-color-rgb), 0.14);
    color: var(--f7-theme-color);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    touch-action: manipulation;
    transition: opacity 0.12s ease, transform 0.1s ease;
}

.savings-goal-mobile-card__quick-add:active {
    transform: scale(0.96);
    opacity: 0.82;
}

.savings-goal-mobile-card__quick-add--glass {
    background-color: rgba(255, 255, 255, 0.22);
    color: #ffffff;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.30);
}

.min-width-0 {
    min-width: 0;
}
</style>
