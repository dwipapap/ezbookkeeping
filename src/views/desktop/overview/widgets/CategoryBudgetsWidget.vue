<template>
    <v-card class="overview-widget category-budgets-widget h-100" :class="{ disabled: loading }">
        <template #title>
            <overview-widget-header :title="title || tt('Monthly Category Budgets')" :icon="mdiChartBoxOutline">
                <v-btn density="compact" color="default" variant="text" size="small" :icon="true"
                       :aria-label="tt('Manage Budgets')" :disabled="editing"
                       @click="openManageDialog">
                    <v-icon :icon="mdiTune" size="18" />
                    <v-tooltip activator="parent">{{ tt('Manage Budgets') }}</v-tooltip>
                </v-btn>
            </overview-widget-header>
        </template>

        <v-card-text class="overview-widget__body d-flex flex-column">
            <div v-if="loading && !displayItems.length">
                <v-skeleton-loader class="skeleton-no-margin py-4 mb-1" type="text"
                                   :key="idx" :loading="true" v-for="idx in props.itemCount"></v-skeleton-loader>
            </div>

            <div class="overview-widget__empty" v-else-if="!loading && !budgetProgress.items.length">
                <v-icon :icon="mdiWalletOutline" size="32" />
                <span>{{ tt('No category budgets set') }}</span>
                <v-btn color="primary" variant="tonal" size="small" :disabled="editing" @click="openManageDialog">
                    {{ tt('Set Up Budgets') }}
                </v-btn>
            </div>

            <template v-else>
                <v-list class="py-0" density="compact">
                    <v-list-item class="px-0 py-1 mb-1 no-min-height" density="compact"
                                 :key="item.categoryId"
                                 v-for="item in displayItems">
                        <template #prepend>
                            <router-link class="overview-widget__item-icon"
                                         :class="{ 'pointer-events-none': editing }"
                                         :to="getTransactionItemLinkUrl(item.categoryId)">
                                <ItemIcon size="26px" :icon-type="getCategoryIconType(item.iconType)"
                                          :icon-id="item.icon" :color="item.color" />
                            </router-link>
                        </template>

                        <router-link class="category-budget-row link-no-color"
                                     :class="{ 'pointer-events-none': editing }"
                                     :to="getTransactionItemLinkUrl(item.categoryId)">
                            <div class="d-flex flex-column">
                                <div class="category-budget-row__header">
                                    <div class="category-budget-row__title text-truncate">
                                        <span class="text-truncate" :title="item.parentCategoryName ? `${item.parentCategoryName} - ${item.categoryName}` : item.categoryName">
                                            {{ item.categoryName }}
                                        </span>
                                        <span class="category-budget-status-dot"
                                              :class="getStatusDotClass(item)"
                                              :title="getStatusTooltip(item)"
                                              v-if="item.status !== 'normal' || item.isAheadOfPace"></span>
                                    </div>
                                    <span class="overview-widget__amount category-budget-row__amounts"
                                          :class="{ 'text-error': item.status === 'exceeded', 'text-warning': item.status === 'warning' }">
                                        {{ getDisplayAmount(item.spentAmount, item.incomplete) }} / {{ getDisplayAmount(item.limitAmount, false) }}
                                    </span>
                                </div>

                                <div class="category-budget-progress mt-1">
                                    <div class="category-budget-progress__track">
                                        <div class="category-budget-progress__fill"
                                             :class="`category-budget-progress__fill--${item.status}`"
                                             :style="{ width: `${item.barPercent}%` }"></div>
                                        <div class="category-budget-progress__pace-marker"
                                             :style="{ left: `${item.pacePercent}%` }">
                                            <v-tooltip activator="parent">
                                                {{ `${tt('Pace')}: ${tt('Day')} ${budgetProgress.summary.dayOfMonth}/${budgetProgress.summary.daysInMonth}` }}
                                            </v-tooltip>
                                        </div>
                                    </div>
                                    <small class="category-budget-progress__percent">
                                        {{ formatPercentToLocalizedNumerals(item.usedPercent, 0, '<1') }}
                                    </small>
                                </div>

                                <div class="category-budget-row__caption mt-1" v-if="showDailySafeToSpend">
                                    <span class="text-error font-weight-medium" v-if="item.remainingAmount.isNegative()">
                                        {{ `${tt('Over budget by')} ${getDisplayAmount(item.remainingAmount.abs(), item.incomplete)}` }}
                                    </span>
                                    <template v-else>
                                        <span class="overview-widget__caption">
                                            {{ `${tt('Safe')}: ${getDisplayAmount(item.dailySafeToSpend, item.incomplete)}/${tt('day')}` }}
                                        </span>
                                        <span class="overview-widget__caption">
                                            {{ `${getDisplayAmount(item.remainingAmount, item.incomplete)} ${tt('left')}` }}
                                        </span>
                                    </template>
                                </div>
                            </div>
                        </router-link>
                    </v-list-item>
                </v-list>

                <div class="overview-widget__footer d-flex justify-space-between align-center pt-2"
                     v-if="showDailySafeToSpend && budgetProgress.items.length > 0">
                    <span>
                        {{ `${getDisplayAmount(budgetProgress.summary.totalSpent, budgetProgress.summary.incomplete)} / ${getDisplayAmount(budgetProgress.summary.totalLimit, false)}` }}
                    </span>
                    <span class="text-error font-weight-medium" v-if="budgetProgress.summary.totalRemaining.isNegative()">
                        {{ `${tt('Over budget by')} ${getDisplayAmount(budgetProgress.summary.totalRemaining.abs(), budgetProgress.summary.incomplete)}` }}
                    </span>
                    <span v-else>
                        {{ `${tt('Safe')}: ${getDisplayAmount(budgetProgress.summary.overallDailySafeToSpend, budgetProgress.summary.incomplete)}/${tt('day')}` }}
                    </span>
                </div>
            </template>
        </v-card-text>

        <category-budget-manage-dialog ref="manageDialog" />
    </v-card>
</template>

<script setup lang="ts">
import OverviewWidgetHeader from './OverviewWidgetHeader.vue';
import CategoryBudgetManageDialog from '@/views/desktop/overview/dialogs/CategoryBudgetManageDialog.vue';

import { computed, useTemplateRef } from 'vue';

import { useI18n } from '@/locales/helpers.ts';

import { useSettingsStore } from '@/stores/setting.ts';
import { useUserStore } from '@/stores/user.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';
import { useOverviewStore } from '@/stores/overview.ts';
import { useExchangeRatesStore } from '@/stores/exchangeRates.ts';

import type { BigDecimal } from '@/core/numeral.ts';
import { DateRange } from '@/core/datetime.ts';
import { TransactionType } from '@/core/transaction.ts';
import { DISPLAY_HIDDEN_AMOUNT, INCOMPLETE_AMOUNT_SUFFIX } from '@/consts/numeral.ts';

import { getCategoryIconType } from '@/lib/icon.ts';
import { getCurrentDateTime } from '@/lib/datetime.ts';
import {
    type CategoryBudgetProgressItem,
    type CategoryBudgetProgressResult,
    parseCategoryMonthlyBudgets,
    calculateCategoryBudgetProgress
} from '@/lib/category_budget.ts';

import {
    mdiChartBoxOutline,
    mdiTune,
    mdiWalletOutline
} from '@mdi/js';

type CategoryBudgetManageDialogType = InstanceType<typeof CategoryBudgetManageDialog>;

const props = defineProps<{
    loading: boolean;
    title?: string;
    editing?: boolean;
    itemCount: number;
    showDailySafeToSpend: boolean;
}>();

const { tt, formatAmountToLocalizedNumeralsWithCurrency, formatPercentToLocalizedNumerals } = useI18n();

const settingsStore = useSettingsStore();
const userStore = useUserStore();
const accountsStore = useAccountsStore();
const categoriesStore = useTransactionCategoriesStore();
const overviewStore = useOverviewStore();
const exchangeRatesStore = useExchangeRatesStore();

const manageDialog = useTemplateRef<CategoryBudgetManageDialogType>('manageDialog');

const showAmountInHomePage = computed<boolean>(() => settingsStore.appSettings.showAmountInHomePage);
const defaultCurrency = computed<string>(() => userStore.currentUserDefaultCurrency);

const budgetConfigs = computed(() => parseCategoryMonthlyBudgets(settingsStore.appSettings.categoryMonthlyBudgets));

const budgetProgress = computed<CategoryBudgetProgressResult>(() => {
    const now = getCurrentDateTime();
    const response = overviewStore.transactionCategoryStatisticsData[DateRange.ThisMonth.type];

    return calculateCategoryBudgetProgress({
        budgets: budgetConfigs.value,
        statisticItems: response?.items ?? [],
        accountsMap: accountsStore.allAccountsMap,
        categoriesMap: categoriesStore.allTransactionCategoriesMap,
        defaultCurrency: defaultCurrency.value,
        excludedAccountIds: settingsStore.appSettings.overviewAccountFilterInHomePage,
        excludedCategoryIds: settingsStore.appSettings.overviewTransactionCategoryFilterInHomePage,
        getExchangedAmount: (amount, fromCurrency, toCurrency) => exchangeRatesStore.getExchangedAmount(amount, fromCurrency, toCurrency),
        dayOfMonth: now.getGregorianCalendarDay(),
        daysInMonth: now.getMaxDayOfGregorianCalendarMonth()
    });
});

const displayItems = computed<CategoryBudgetProgressItem[]>(() => {
    return budgetProgress.value.items.slice(0, props.itemCount);
});

function getDisplayAmount(amount: BigDecimal, incomplete: boolean): string {
    if (!showAmountInHomePage.value) {
        return formatAmountToLocalizedNumeralsWithCurrency(DISPLAY_HIDDEN_AMOUNT, defaultCurrency.value);
    }

    return formatAmountToLocalizedNumeralsWithCurrency(amount, defaultCurrency.value) + (incomplete ? INCOMPLETE_AMOUNT_SUFFIX : '');
}

function getTransactionItemLinkUrl(categoryId: string): string {
    return `/transaction/list?${overviewStore.getTransactionListPageParams({ type: TransactionType.Expense, dateType: DateRange.ThisMonth.type, categoryIds: [categoryId] })}`;
}

function getStatusDotClass(item: CategoryBudgetProgressItem): string {
    if (item.status === 'exceeded') {
        return 'category-budget-status-dot--error';
    }

    if (item.status === 'warning' || item.isAheadOfPace) {
        return 'category-budget-status-dot--warning';
    }

    return '';
}

function getStatusTooltip(item: CategoryBudgetProgressItem): string {
    if (item.status === 'exceeded') {
        return tt('Over budget');
    }

    if (item.status === 'warning') {
        return tt('Approaching budget limit');
    }

    if (item.isAheadOfPace) {
        return tt('Ahead of monthly pace');
    }

    return '';
}

function openManageDialog(): void {
    if (props.editing) {
        return;
    }

    manageDialog.value?.open();
}
</script>

<style scoped>
.category-budget-row {
    display: block;
    width: 100%;
    overflow: hidden;
    text-decoration: none;
}

.category-budget-row__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}

.category-budget-row__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 0.875rem;
    font-weight: 500;
}

.category-budget-row__amounts {
    flex: 0 0 auto;
    font-size: 0.8125rem;
    opacity: 0.85;
}

.category-budget-status-dot {
    display: inline-block;
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 50%;
}

.category-budget-status-dot--warning {
    background-color: rgb(var(--v-theme-warning));
}

.category-budget-status-dot--error {
    background-color: rgb(var(--v-theme-error));
}

.category-budget-progress {
    display: flex;
    align-items: center;
    gap: 8px;
}

.category-budget-progress__track {
    position: relative;
    flex: 1 1 auto;
    height: 8px;
    border-radius: 999px;
    background-color: rgba(var(--v-theme-on-surface), 0.12);
    overflow: visible;
}

.category-budget-progress__fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.25s ease;
}

.category-budget-progress__fill--normal {
    background-color: rgb(var(--v-theme-success));
}

.category-budget-progress__fill--warning {
    background-color: rgb(var(--v-theme-warning));
}

.category-budget-progress__fill--exceeded {
    background-color: rgb(var(--v-theme-error));
}

.category-budget-progress__pace-marker {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    border-radius: 1px;
    transform: translateX(-50%);
    background-color: rgba(var(--v-theme-on-surface), 0.78);
    box-shadow: 0 0 0 1px rgb(var(--v-theme-surface));
    z-index: 1;
}

.category-budget-progress__percent {
    flex: 0 0 auto;
    font-size: 0.75rem;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
}

.category-budget-row__caption {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    line-height: 1.3;
}
</style>
