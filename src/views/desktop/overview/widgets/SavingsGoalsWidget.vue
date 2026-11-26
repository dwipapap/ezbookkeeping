<template>
    <v-card class="overview-widget savings-goals-widget h-100" :class="{ disabled: loading }">
        <template #title>
            <overview-widget-header :title="title || tt('Savings Goals')" :icon="mdiPiggyBankOutline">
                <v-btn density="compact" color="default" variant="text" class="ms-auto"
                       :aria-label="tt('Manage Goals')" :disabled="editing || loading" :icon="true"
                       @click="openManageDialog(false)">
                    <v-icon :icon="mdiCogOutline" size="18" />
                    <v-tooltip activator="parent">{{ tt('Manage Goals') }}</v-tooltip>
                </v-btn>
            </overview-widget-header>
        </template>

        <v-card-text class="overview-widget__body">
            <div v-if="loading && !goals.length">
                <v-skeleton-loader class="skeleton-no-margin my-2" type="list-item-two-line"
                                   :key="idx" :loading="true" v-for="idx in skeletonCount"></v-skeleton-loader>
            </div>

            <div class="overview-widget__empty" v-else-if="!loading && !goals.length">
                <v-icon :icon="mdiPiggyBankOutline" size="36" />
                <span class="text-body-medium">{{ tt('No savings goals yet') }}</span>
                <v-btn color="primary" variant="tonal" size="small" :disabled="editing"
                       @click="openManageDialog(true)">
                    {{ tt('Create Goal') }}
                </v-btn>
            </div>

            <div class="savings-goals-widget__list" v-else>
                <div class="savings-goal-card"
                     :class="{ 'savings-goal-card--has-cover': !!coverUrls[item.goal.id] }"
                     :style="getCardStyle(item.goal)"
                     :key="item.goal.id"
                     v-for="item in displayGoalItems">
                    <div class="savings-goal-card__overlay" v-if="coverUrls[item.goal.id]"></div>

                    <div class="savings-goal-card__inner">
                        <div class="d-flex align-center justify-space-between ga-2">
                            <div class="d-flex align-center ga-2 min-width-0">
                                <span class="savings-goal-card__dot" :style="getDotStyle(item.goal)"></span>
                                <span class="text-body-medium font-weight-semibold text-truncate" :title="item.goal.name">
                                    {{ item.goal.name }}
                                </span>
                            </div>

                            <v-chip color="success" size="x-small" variant="flat" label v-if="item.progress.isCompleted">
                                {{ tt('Completed') }}
                            </v-chip>
                            <span class="text-body-small font-weight-bold text-no-wrap" v-else>
                                {{ formatPercentToLocalizedNumerals(item.progress.rawPercent, 0, '<1') }}
                            </span>
                        </div>

                        <div class="savings-goal-card__amounts overview-widget__amount mt-1">
                            <span class="font-weight-semibold">
                                {{ formatGoalAmount(item.progress.savedAmount, item.currency, item.progress.incomplete) }}
                            </span>
                            <span class="savings-goal-card__muted mx-1">/</span>
                            <span class="savings-goal-card__muted text-body-small">
                                {{ formatGoalAmount(item.progress.targetAmount, item.currency, false) }}
                            </span>
                        </div>

                        <v-progress-linear
                            class="mt-2"
                            rounded
                            height="6"
                            :model-value="item.progress.percent"
                            :color="getProgressBarColor(item)"
                            :bg-color="coverUrls[item.goal.id] ? 'rgba(255, 255, 255, 0.25)' : undefined"
                        />

                        <div class="savings-goal-card__footer mt-2"
                             v-if="hasFooterContent(item)">
                            <div class="savings-goal-card__meta text-body-small text-truncate">
                                <span v-if="item.estimateText">{{ item.estimateText }}</span>
                                <span v-else-if="item.goal.mode === 'accounts'">
                                    {{ tt('Linked Accounts') }} ({{ item.goal.linkedAccountIds.length }})
                                </span>
                            </div>

                            <v-btn
                                size="x-small"
                                color="primary"
                                :variant="coverUrls[item.goal.id] ? 'flat' : 'tonal'"
                                class="savings-goal-card__quick-add"
                                v-if="item.goal.mode === 'manual' && !editing"
                                @click="openQuickAddSavings(item.goal, item.currency)"
                            >
                                {{ tt('+ Add Savings') }}
                            </v-btn>
                        </div>
                    </div>
                </div>
            </div>
        </v-card-text>

        <savings-goal-manage-dialog v-model:show="showManageDialog" :start-creating="startCreatingInDialog" />
        <amount-input-dialog ref="quickAddAmountDialog" />
    </v-card>
</template>

<script setup lang="ts">
import OverviewWidgetHeader from './OverviewWidgetHeader.vue';
import SavingsGoalManageDialog from '../dialogs/SavingsGoalManageDialog.vue';

import { ref, computed, watch, useTemplateRef } from 'vue';
import type AmountInputDialog from '@/components/desktop/AmountInputDialog.vue';

import { useI18n } from '@/locales/helpers.ts';

import { useSettingsStore } from '@/stores/setting.ts';
import { useUserStore } from '@/stores/user.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useExchangeRatesStore } from '@/stores/exchangeRates.ts';

import type { BigDecimal } from '@/core/numeral.ts';
import type { TextualYearMonthDay } from '@/core/datetime.ts';
import { DISPLAY_HIDDEN_AMOUNT, INCOMPLETE_AMOUNT_SUFFIX } from '@/consts/numeral.ts';

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

import {
    mdiCogOutline,
    mdiPiggyBankOutline
} from '@mdi/js';

interface DisplayGoalItem {
    goal: SavingsGoalConfig;
    currency: string;
    progress: SavingsGoalProgressResult;
    estimateText: string;
}

const props = defineProps<{
    loading: boolean;
    title?: string;
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

const quickAddAmountDialog = useTemplateRef<InstanceType<typeof AmountInputDialog>>('quickAddAmountDialog');

const showManageDialog = ref<boolean>(false);
const startCreatingInDialog = ref<boolean>(false);
const coverUrls = ref<Record<string, string | null>>({});

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

function buildEstimateText(goal: SavingsGoalConfig, progress: SavingsGoalProgressResult, currency: string): string {
    const parts: string[] = [];

    if (!progress.isCompleted && progress.estimatedMonthsToGoal !== null) {
        parts.push(tt('~{n} mo left', { n: formatNumberToLocalizedNumerals(progress.estimatedMonthsToGoal) }));
    }

    if (goal.targetDate) {
        const dateStr = formatGregorianTextualYearMonthDayToLongDate(goal.targetDate as TextualYearMonthDay);
        if (!progress.isCompleted && progress.requiredMonthlyToHitTargetDate) {
            const monthlyStr = formatGoalAmount(progress.requiredMonthlyToHitTargetDate, currency, false);
            parts.push(`${dateStr} · ${tt('{amount}/mo needed', { amount: monthlyStr })}`);
        } else {
            parts.push(dateStr);
        }
    }

    return parts.join(' · ');
}

function hasFooterContent(item: DisplayGoalItem): boolean {
    return !!item.estimateText || item.goal.mode === 'accounts' || (item.goal.mode === 'manual' && !props.editing);
}

function getCardStyle(goal: SavingsGoalConfig): Record<string, string> {
    const url = coverUrls.value[goal.id];
    if (!url) {
        return {};
    }
    return {
        backgroundImage: `url("${url}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center'
    };
}

function getDotStyle(goal: SavingsGoalConfig): Record<string, string> {
    if (goal.color) {
        return { backgroundColor: `#${goal.color}` };
    }
    return { backgroundColor: 'rgb(var(--v-theme-primary))' };
}

function getProgressBarColor(item: DisplayGoalItem): string {
    if (item.progress.isCompleted) {
        return 'success';
    }
    if (item.goal.color) {
        return `#${item.goal.color}`;
    }
    return 'primary';
}

function openManageDialog(startCreating: boolean): void {
    if (props.editing) {
        return;
    }
    startCreatingInDialog.value = startCreating;
    showManageDialog.value = true;
}

function openQuickAddSavings(goal: SavingsGoalConfig, currency: string): void {
    if (props.editing) {
        return;
    }
    quickAddAmountDialog.value?.open({
        title: 'Add Savings',
        text: goal.name,
        inputLabel: 'Amount',
        currency: currency,
        initAmount: 0
    }).then((addedAmount: number) => {
        if (!Number.isFinite(addedAmount) || addedAmount <= 0) {
            return;
        }
        const updatedGoals = goals.value.map(item =>
            item.id === goal.id ? addManualSavingsToGoal(item, Math.trunc(addedAmount)) : item
        );
        settingsStore.setSavingsGoals(serializeSavingsGoals(updatedGoals));
    }).catch(() => {
        // cancelled
    });
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
.savings-goals-widget__list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.savings-goal-card {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    padding: 12px 14px;
    border: 1px solid rgba(var(--ebk-border), 0.08);
    background: rgba(var(--v-theme-on-surface), 0.025);
}

.savings-goal-card--has-cover {
    color: #ffffff;
    border-color: transparent;
}

.savings-goal-card__overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(12, 10, 24, 0.42) 0%, rgba(12, 10, 24, 0.80) 100%);
    pointer-events: none;
    z-index: 0;
}

.savings-goal-card__inner {
    position: relative;
    z-index: 1;
    min-width: 0;
}

.savings-goal-card--has-cover .savings-goal-card__inner {
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.savings-goal-card__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
}

.savings-goal-card__amounts {
    font-size: 0.9rem;
    line-height: 1.35;
}

.savings-goal-card__muted {
    color: rgba(var(--v-theme-on-surface), 0.62);
}

.savings-goal-card--has-cover .savings-goal-card__muted {
    color: rgba(255, 255, 255, 0.78);
}

.savings-goal-card__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
}

.savings-goal-card__meta {
    min-width: 0;
    color: rgba(var(--v-theme-on-surface), 0.62);
}

.savings-goal-card--has-cover .savings-goal-card__meta {
    color: rgba(255, 255, 255, 0.84);
}

.savings-goal-card__quick-add {
    flex: 0 0 auto;
}

.min-width-0 {
    min-width: 0;
}
</style>
