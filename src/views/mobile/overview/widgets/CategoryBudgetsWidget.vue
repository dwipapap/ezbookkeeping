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
            <f7-list-item link="#" class="category-budget-mobile-item"
                          :key="item.categoryId"
                          v-for="item in displayItems"
                          @click="onBudgetItemClick(item.categoryId)">
                <template #media>
                    <div class="category-budget-mobile-icon" :style="getCategoryIconBgStyle(item)">
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
                            <span class="category-budget-mobile-title text-truncate">{{ item.categoryName }}</span>
                            <span class="category-budget-mobile-percent-pill" :class="getPercentPillClass(item)">
                                {{ formatPercentToLocalizedNumerals(item.usedPercent, 0, '<1') }}
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
                        </div>

                        <div class="category-budget-mobile-meta">
                            <span class="category-budget-mobile-amounts"
                                  :class="{ 'text-color-red': item.status === 'exceeded', 'text-color-orange': item.status === 'warning' }">
                                {{ getDisplayAmount(item.spentAmount, item.incomplete) }}
                                <span class="category-budget-mobile-limit">/ {{ getDisplayAmount(item.limitAmount, false) }}</span>
                            </span>
                            <template v-if="showDailySafeToSpend">
                                <span class="category-budget-mobile-safe text-color-red" v-if="item.remainingAmount.isNegative()">
                                    +{{ getDisplayAmount(item.remainingAmount.abs(), item.incomplete) }}
                                </span>
                                <span class="category-budget-mobile-safe text-color-gray" v-else>
                                    {{ `${tt('Safe')}: ${getDisplayAmount(item.dailySafeToSpend, item.incomplete)}/${tt('day')}` }}
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

function getCategoryIconBgStyle(item: CategoryBudgetProgressItem): Record<string, string> {
    if (item.color && /^[0-9a-f]{6}$/i.test(item.color)) {
        return { 'background-color': `#${item.color}1f` };
    }

    return {};
}

function getPercentPillClass(item: CategoryBudgetProgressItem): string {
    if (item.status === 'exceeded') {
        return 'category-budget-mobile-percent-pill--exceeded';
    }

    if (item.status === 'warning' || item.isAheadOfPace) {
        return 'category-budget-mobile-percent-pill--warning';
    }

    return 'category-budget-mobile-percent-pill--normal';
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
.category-budget-mobile-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background-color: rgba(128, 128, 128, 0.1);
}

.category-budget-mobile-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 0;
    min-width: 0;
}

.category-budget-mobile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.category-budget-mobile-title {
    font-size: 0.94rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    min-width: 0;
}

.category-budget-mobile-percent-pill {
    flex: 0 0 auto;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1.35;
}

.category-budget-mobile-percent-pill--normal {
    color: var(--f7-color-green, #34c759);
    background-color: rgba(52, 199, 89, 0.14);
}

.category-budget-mobile-percent-pill--warning {
    color: var(--f7-color-orange, #ff9500);
    background-color: rgba(255, 149, 0, 0.16);
}

.category-budget-mobile-percent-pill--exceeded {
    color: var(--f7-color-red, #ff3b30);
    background-color: rgba(255, 59, 48, 0.16);
}

.category-budget-mobile-progress {
    display: flex;
    align-items: center;
}

.category-budget-mobile-progress__track {
    position: relative;
    flex: 1 1 auto;
    height: 7px;
    border-radius: 999px;
    background-color: rgba(128, 128, 128, 0.18);
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
    width: 2.5px;
    border-radius: 999px;
    transform: translateX(-50%);
    background-color: var(--f7-text-color, #000000);
    opacity: 0.65;
    z-index: 1;
}

.category-budget-mobile-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 2px 10px;
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
}

.category-budget-mobile-amounts {
    font-weight: 500;
}

.category-budget-mobile-limit {
    opacity: 0.65;
    font-weight: 400;
}

.category-budget-mobile-safe {
    white-space: nowrap;
}
</style>
