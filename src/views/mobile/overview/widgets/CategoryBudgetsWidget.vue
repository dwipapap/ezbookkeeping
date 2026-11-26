<template>
    <f7-list strong inset dividers class="overview-widget-list category-budgets-widget no-margin-top margin-bottom">
        <f7-list-item group-title v-if="showTitle">
            <div class="display-flex justify-content-space-between align-items-center width-100">
                <small>{{ title || tt('Monthly Category Budgets') }}</small>
                <f7-link icon-f7="slider_horizontal_3" icon-size="16"
                         :class="{ 'disabled': editing }"
                         :aria-label="tt('Manage Budgets')"
                         @click="openManagePopup"></f7-link>
            </div>
        </f7-list-item>

        <template v-if="loading && !displayItems.length">
            <f7-list-item class="category-budget-mobile-item item-no-divider skeleton-text" link="#" :key="idx" v-for="idx in itemCount">
                <template #media>
                    <div class="display-flex align-items-center statistics-icon">
                        <f7-icon f7="app_fill"></f7-icon>
                    </div>
                </template>
                <template #inner>
                    <div class="category-budget-mobile-content width-100">
                        <div class="display-flex justify-content-space-between">
                            <span>Category Name</span>
                            <span>0.00 / 0.00</span>
                        </div>
                        <div class="category-budget-mobile-progress margin-top-half">
                            <div class="category-budget-mobile-progress__track"></div>
                        </div>
                    </div>
                </template>
            </f7-list-item>
        </template>

        <f7-list-item v-else-if="!loading && !budgetProgress.items.length">
            <template #title>
                <div class="padding-vertical-half text-align-center">
                    <div class="text-color-gray margin-bottom-half">{{ tt('No category budgets set') }}</div>
                    <f7-button fill small round class="display-inline-flex" :disabled="editing" @click="openManagePopup">
                        {{ tt('Set Up Budgets') }}
                    </f7-button>
                </div>
            </template>
        </f7-list-item>

        <template v-else>
            <f7-list-item link="#" class="category-budget-mobile-item item-no-divider"
                          :key="item.categoryId"
                          v-for="item in displayItems"
                          @click="onBudgetItemClick(item.categoryId)">
                <template #media>
                    <div class="display-flex align-items-center statistics-icon">
                        <ItemIcon :icon-type="getCategoryIconType(item.iconType)"
                                  :icon-id="item.icon"
                                  :color="item.color"
                                  v-if="item.icon" />
                        <f7-icon f7="pencil_ellipsis_rectangle" v-else></f7-icon>
                    </div>
                </template>

                <template #inner>
                    <div class="category-budget-mobile-content width-100">
                        <div class="category-budget-mobile-header">
                            <div class="category-budget-mobile-title">
                                <span class="text-truncate">{{ item.categoryName }}</span>
                                <span class="category-budget-mobile-dot"
                                      :class="getStatusDotClass(item)"
                                      v-if="item.status !== 'normal' || item.isAheadOfPace"></span>
                            </div>
                            <span class="category-budget-mobile-amounts"
                                  :class="{ 'text-color-red': item.status === 'exceeded', 'text-color-orange': item.status === 'warning' }">
                                {{ getDisplayAmount(item.spentAmount, item.incomplete) }} / {{ getDisplayAmount(item.limitAmount, false) }}
                            </span>
                        </div>

                        <div class="category-budget-mobile-progress">
                            <div class="category-budget-mobile-progress__track">
                                <div class="category-budget-mobile-progress__fill"
                                     :class="`category-budget-mobile-progress__fill--${item.status}`"
                                     :style="{ width: `${item.barPercent}%` }"></div>
                                <div class="category-budget-mobile-progress__pace-marker"
                                     :style="{ left: `${item.pacePercent}%` }"></div>
                            </div>
                            <small class="category-budget-mobile-percent">
                                {{ formatPercentToLocalizedNumerals(item.usedPercent, 0, '<1') }}
                            </small>
                        </div>

                        <div class="category-budget-mobile-caption" v-if="showDailySafeToSpend">
                            <span class="text-color-red" v-if="item.remainingAmount.isNegative()">
                                {{ `${tt('Over budget by')} ${getDisplayAmount(item.remainingAmount.abs(), item.incomplete)}` }}
                            </span>
                            <template v-else>
                                <span class="text-color-gray">
                                    {{ `${tt('Safe')}: ${getDisplayAmount(item.dailySafeToSpend, item.incomplete)}/${tt('day')}` }}
                                </span>
                                <span class="text-color-gray">
                                    {{ `${getDisplayAmount(item.remainingAmount, item.incomplete)} ${tt('left')}` }}
                                </span>
                            </template>
                        </div>
                    </div>
                </template>
            </f7-list-item>

            <f7-list-item link="#" no-chevron v-if="!showTitle" @click="openManagePopup">
                <template #title>
                    <span class="text-color-primary">{{ tt('Manage Budgets') }}</span>
                </template>
            </f7-list-item>
        </template>
    </f7-list>

    <category-budget-manage-popup v-model:show="showManagePopup" />
</template>

<script setup lang="ts">
import CategoryBudgetManagePopup from '@/views/mobile/overview/CategoryBudgetManagePopup.vue';

import { ref, computed } from 'vue';

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
import { MobileOverviewWidgetNavigationType } from '@/core/overview_layout.ts';
import { DISPLAY_HIDDEN_AMOUNT, INCOMPLETE_AMOUNT_SUFFIX } from '@/consts/numeral.ts';

import { getCategoryIconType } from '@/lib/icon.ts';
import { getCurrentDateTime } from '@/lib/datetime.ts';
import {
    type CategoryBudgetProgressItem,
    type CategoryBudgetProgressResult,
    parseCategoryMonthlyBudgets,
    calculateCategoryBudgetProgress
} from '@/lib/category_budget.ts';

const props = defineProps<{
    loading: boolean;
    title?: string;
    showTitle: boolean;
    editing?: boolean;
    itemCount: number;
    showDailySafeToSpend: boolean;
}>();

const emit = defineEmits<{
    (e: 'navigate', type: MobileOverviewWidgetNavigationType, path?: string): void;
}>();

const { tt, formatAmountToLocalizedNumeralsWithCurrency, formatPercentToLocalizedNumerals } = useI18n();

const settingsStore = useSettingsStore();
const userStore = useUserStore();
const accountsStore = useAccountsStore();
const categoriesStore = useTransactionCategoriesStore();
const overviewStore = useOverviewStore();
const exchangeRatesStore = useExchangeRatesStore();

const showManagePopup = ref<boolean>(false);

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
        return 'category-budget-mobile-dot--error';
    }

    if (item.status === 'warning' || item.isAheadOfPace) {
        return 'category-budget-mobile-dot--warning';
    }

    return '';
}

function openManagePopup(): void {
    if (props.editing) {
        return;
    }

    showManagePopup.value = true;
}

function onBudgetItemClick(categoryId: string): void {
    if (props.editing) {
        return;
    }

    emit('navigate', MobileOverviewWidgetNavigationType.Url, getTransactionItemLinkUrl(categoryId));
}
</script>

<style scoped>
.category-budget-mobile-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 0;
    min-width: 0;
}

.category-budget-mobile-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
}

.category-budget-mobile-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-weight: 500;
}

.category-budget-mobile-dot {
    display: inline-block;
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 50%;
}

.category-budget-mobile-dot--warning {
    background-color: var(--f7-color-orange, #ff9500);
}

.category-budget-mobile-dot--error {
    background-color: var(--f7-color-red, #ff3b30);
}

.category-budget-mobile-amounts {
    flex: 0 0 auto;
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;
}

.category-budget-mobile-progress {
    display: flex;
    align-items: center;
    gap: 8px;
}

.category-budget-mobile-progress__track {
    position: relative;
    flex: 1 1 auto;
    height: 8px;
    border-radius: 999px;
    background-color: rgba(128, 128, 128, 0.2);
    overflow: visible;
}

.category-budget-mobile-progress__fill {
    height: 100%;
    border-radius: 999px;
}

.category-budget-mobile-progress__fill--normal {
    background-color: var(--f7-color-green, #34c759);
}

.category-budget-mobile-progress__fill--warning {
    background-color: var(--f7-color-orange, #ff9500);
}

.category-budget-mobile-progress__fill--exceeded {
    background-color: var(--f7-color-red, #ff3b30);
}

.category-budget-mobile-progress__pace-marker {
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    border-radius: 1px;
    transform: translateX(-50%);
    background-color: var(--f7-text-color, #000000);
    opacity: 0.75;
    z-index: 1;
}

.category-budget-mobile-percent {
    flex: 0 0 auto;
    font-size: 0.75em;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
}

.category-budget-mobile-caption {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 0.78em;
}
</style>
