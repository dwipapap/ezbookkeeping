<template>
    <f7-list strong inset dividers class="overview-widget-list upcoming-bills-list no-margin-top margin-bottom"
             :class="{ 'skeleton-text': isLoading }" :media-list="isLoading || !!displayItems.length">
        <f7-list-item group-title v-if="showTitle">
            <small>{{ title || tt('Upcoming Bills & Subscriptions') }}</small>
        </f7-list-item>

        <f7-list-item class="upcoming-bills-summary-item">
            <template #title>
                <div class="display-flex align-items-center upcoming-bills-summary-title">
                    <span>{{ tt('Remaining This Month') }}</span>
                    <f7-badge class="margin-inline-start-half upcoming-bills-count-badge" color="primary" v-if="!isLoading || templatesLoaded">
                        {{ formatNumberToLocalizedNumerals(summary.remainingMonthCount) }}
                    </f7-badge>
                </div>
            </template>
            <template #after>
                <span class="upcoming-bills-summary-amount text-expense" v-if="!isLoading || templatesLoaded">
                    {{ displayRemainingMonthTotal }}
                </span>
                <span class="skeleton-text" v-else>0.00 USD</span>
            </template>
        </f7-list-item>

        <template v-if="isLoading && !displayItems.length">
            <f7-list-item link="#" chevron-center class="upcoming-bill-item" :key="idx" v-for="idx in effectiveItemCount">
                <template #media>
                    <f7-icon f7="app_fill"></f7-icon>
                </template>
                <template #title>
                    <span>Bill Name</span>
                </template>
                <template #footer>
                    <span>Account · MM/DD</span>
                </template>
                <template #after>
                    <div class="upcoming-bill-after">
                        <span class="upcoming-bill-due-badge upcoming-bill-due-badge--future">Today</span>
                        <span>0.00 USD</span>
                    </div>
                </template>
            </f7-list-item>
        </template>

        <template v-else-if="!isLoading && !displayItems.length">
            <f7-list-item :title="tt('No upcoming bills')"></f7-list-item>
            <f7-list-item link="#" chevron-center :title="tt('Manage Scheduled Transactions')" @click="navigateToScheduleList"></f7-list-item>
        </template>

        <template v-else-if="displayItems.length">
            <f7-list-item link="#" chevron-center class="upcoming-bill-item"
                          :key="item.id"
                          v-for="item in displayItems"
                          @click="navigateToScheduleList">
                <template #media>
                    <div class="upcoming-bill-icon display-flex align-items-center">
                        <ItemIcon :icon-type="getCategoryIconType(getItemCategory(item)?.iconType)"
                                  :icon-id="getItemCategory(item)?.icon ?? ''"
                                  :color="getItemCategory(item)?.color"
                                  v-if="getItemCategory(item) && getItemCategory(item)?.color" />
                        <f7-icon f7="calendar_today" v-else />
                    </div>
                </template>
                <template #title>
                    <span class="upcoming-bill-name">{{ item.name }}</span>
                </template>
                <template #footer>
                    <div class="upcoming-bill-footer display-flex align-items-center">
                        <span class="upcoming-bill-caption">{{ getItemCaption(item) }}</span>
                        <span class="upcoming-bill-due-badge" :class="getDueBadgeClass(item.daysUntil)">
                            {{ getDueBadgeText(item.daysUntil) }}
                        </span>
                    </div>
                </template>
                <template #after>
                    <span class="upcoming-bill-amount" :class="getAmountClass(item)">
                        {{ getDisplayItemAmount(item) }}
                    </span>
                </template>
            </f7-list-item>

            <f7-list-item link="#" chevron-center class="upcoming-bills-footer-link"
                          :title="tt('Manage Scheduled Transactions')"
                          @click="navigateToScheduleList"></f7-list-item>
        </template>
    </f7-list>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useI18n } from '@/locales/helpers.ts';

import { useSettingsStore } from '@/stores/setting.ts';
import { useUserStore } from '@/stores/user.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';
import { useTransactionTemplatesStore } from '@/stores/transactionTemplate.ts';
import { useExchangeRatesStore } from '@/stores/exchangeRates.ts';

import { TransactionType } from '@/core/transaction.ts';
import { ScheduledTransactionStatus } from '@/core/template.ts';
import { MobileOverviewWidgetNavigationType } from '@/core/overview_layout.ts';
import { DISPLAY_HIDDEN_AMOUNT, INCOMPLETE_AMOUNT_SUFFIX } from '@/consts/numeral.ts';

import type { TransactionCategory } from '@/models/transaction_category.ts';
import type {
    TransactionTemplate,
    ScheduledTransactionOccurrenceResponse
} from '@/models/transaction_template.ts';

import {
    getCurrentUnixTime,
    getTodayFirstUnixTime,
    getThisMonthLastUnixTime,
    parseDateTimeFromUnixTime
} from '@/lib/datetime.ts';
import { getCategoryIconType } from '@/lib/icon.ts';
import {
    type UpcomingBillItem,
    type UpcomingBillsSummary,
    getUpcomingBillMonths,
    buildUpcomingBillItems
} from '@/lib/upcoming_bills.ts';

const props = defineProps<{
    loading: boolean;
    title?: string;
    showTitle: boolean;
    editing?: boolean;
    daysAhead: number;
    itemCount: number;
}>();

const emit = defineEmits<{
    (e: 'navigate', type: MobileOverviewWidgetNavigationType, path?: string): void;
}>();

const {
    tt,
    formatDateTimeToShortMonthDay,
    formatNumberToLocalizedNumerals,
    formatAmountToLocalizedNumeralsWithCurrency
} = useI18n();

const settingsStore = useSettingsStore();
const userStore = useUserStore();
const accountsStore = useAccountsStore();
const transactionCategoriesStore = useTransactionCategoriesStore();
const transactionTemplatesStore = useTransactionTemplatesStore();
const exchangeRatesStore = useExchangeRatesStore();

const localLoading = ref<boolean>(false);
const templatesLoaded = ref<boolean>(false);
const templates = ref<TransactionTemplate[]>([]);
const occurrences = ref<ScheduledTransactionOccurrenceResponse[]>([]);

let loadSequence = 0;
let reloadPendingAfterParentLoading = false;

const isLoading = computed<boolean>(() => props.loading || localLoading.value);
const showAmountInHomePage = computed<boolean>(() => settingsStore.appSettings.showAmountInHomePage);
const defaultCurrency = computed<string>(() => userStore.currentUserDefaultCurrency);
const effectiveDaysAhead = computed<number>(() => Number.isFinite(props.daysAhead) && props.daysAhead >= 0 ? Math.floor(props.daysAhead) : 14);
const effectiveItemCount = computed<number>(() => Number.isFinite(props.itemCount) && props.itemCount > 0 ? Math.floor(props.itemCount) : 5);

const templatesMap = computed<Record<string, TransactionTemplate>>(() => {
    const map: Record<string, TransactionTemplate> = {};

    for (const template of templates.value) {
        if (!template.hidden) {
            map[template.id] = template;
        }
    }

    return map;
});

const summary = computed<UpcomingBillsSummary>(() => {
    return buildUpcomingBillItems({
        templatesMap: templatesMap.value,
        occurrences: occurrences.value,
        todayStartUnixTime: getTodayFirstUnixTime(),
        daysAhead: effectiveDaysAhead.value,
        currentMonthEndUnixTime: getThisMonthLastUnixTime(),
        accountsMap: accountsStore.allAccountsMap,
        defaultCurrency: defaultCurrency.value,
        getExchangedAmount: exchangeRatesStore.getExchangedAmount
    });
});

const displayItems = computed<UpcomingBillItem[]>(() => summary.value.items.slice(0, effectiveItemCount.value));

const displayRemainingMonthTotal = computed<string>(() => {
    if (!showAmountInHomePage.value) {
        return formatAmountToLocalizedNumeralsWithCurrency(DISPLAY_HIDDEN_AMOUNT, defaultCurrency.value);
    }

    const formatted = formatAmountToLocalizedNumeralsWithCurrency(summary.value.remainingMonthTotalExpense, defaultCurrency.value);
    return summary.value.remainingMonthIncomplete ? formatted + INCOMPLETE_AMOUNT_SUFFIX : formatted;
});

async function loadUpcomingBills(): Promise<void> {
    const currentSeq = ++loadSequence;
    localLoading.value = true;

    try {
        const nowUnixTime = getCurrentUnixTime();
        const months = getUpcomingBillMonths(nowUnixTime, effectiveDaysAhead.value);

        const [loadedTemplates, ...monthOccurrences] = await Promise.all([
            transactionTemplatesStore.loadAllScheduledTransactions({
                status: ScheduledTransactionStatus.Active
            }),
            ...months.map(({ year, month }) =>
                transactionTemplatesStore.loadScheduledTransactionsInMonth({
                    year,
                    month
                })
            )
        ]);

        if (currentSeq !== loadSequence) {
            return;
        }

        templates.value = loadedTemplates;
        occurrences.value = monthOccurrences.flat();
        templatesLoaded.value = true;
    } catch {
        // Keep current state on failure; store logs errors
    } finally {
        if (currentSeq === loadSequence) {
            localLoading.value = false;
        }
    }
}

watch(() => props.daysAhead, () => {
    loadUpcomingBills();
}, { immediate: true });

watch(() => props.loading, (newLoading, oldLoading) => {
    if (oldLoading === false && newLoading === true) {
        reloadPendingAfterParentLoading = true;
    } else if (oldLoading === true && newLoading === false && reloadPendingAfterParentLoading) {
        reloadPendingAfterParentLoading = false;
        loadUpcomingBills();
    }
});

function navigateToScheduleList(): void {
    if (props.editing) {
        return;
    }

    emit('navigate', MobileOverviewWidgetNavigationType.Url, '/schedule/list');
}

function getItemCategory(item: UpcomingBillItem): TransactionCategory | undefined {
    if (item.type === TransactionType.ModifyBalance) {
        return undefined;
    }

    return transactionCategoriesStore.allTransactionCategoriesMap[item.categoryId];
}

function getItemCaption(item: UpcomingBillItem): string {
    const formattedDate = formatDateTimeToShortMonthDay(parseDateTimeFromUnixTime(item.scheduledTime));
    return item.sourceAccountName ? `${item.sourceAccountName} · ${formattedDate}` : formattedDate;
}

function getDisplayItemAmount(item: UpcomingBillItem): string {
    const amount = !showAmountInHomePage.value || item.hideAmount ? DISPLAY_HIDDEN_AMOUNT : item.amount;
    return formatAmountToLocalizedNumeralsWithCurrency(amount, item.currency);
}

function getAmountClass(item: UpcomingBillItem): Record<string, boolean> {
    return {
        'text-expense': item.type === TransactionType.Expense,
        'text-income': item.type === TransactionType.Income
    };
}

function getDueBadgeText(daysUntil: number): string {
    if (daysUntil === 0) {
        return tt('Today');
    } else if (daysUntil === 1) {
        return tt('Tomorrow');
    } else {
        return tt('In {days} days', {
            days: formatNumberToLocalizedNumerals(daysUntil)
        });
    }
}

function getDueBadgeClass(daysUntil: number): string {
    if (daysUntil === 0) {
        return 'upcoming-bill-due-badge--today';
    } else if (daysUntil === 1) {
        return 'upcoming-bill-due-badge--tomorrow';
    } else {
        return 'upcoming-bill-due-badge--future';
    }
}
</script>

<style scoped>
.upcoming-bills-summary-title {
    font-size: 0.9em;
    opacity: 0.8;
}

.upcoming-bills-summary-amount {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.upcoming-bill-after {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
}

.upcoming-bill-footer {
    gap: 6px;
    flex-wrap: wrap;
}

.upcoming-bill-amount {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.upcoming-bill-due-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 0.75em;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
}

.upcoming-bill-due-badge--today {
    color: #d43f3f;
    background-color: rgba(212, 63, 63, 0.14);
}

.upcoming-bill-due-badge--tomorrow {
    color: #d97706;
    background-color: rgba(217, 119, 6, 0.14);
}

.upcoming-bill-due-badge--future {
    color: var(--f7-list-item-footer-text-color);
    background-color: var(--ebk-transaction-tag-chip-bg-color);
}

:root.dark .upcoming-bill-due-badge--today {
    color: #ff6b6b;
    background-color: rgba(255, 107, 107, 0.18);
}

:root.dark .upcoming-bill-due-badge--tomorrow {
    color: #fbbf24;
    background-color: rgba(251, 191, 36, 0.18);
}

.upcoming-bills-footer-link {
    font-size: 0.9em;
}
</style>
