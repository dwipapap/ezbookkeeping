<template>
    <v-card class="overview-widget overview-widget--list upcoming-bills-widget h-100" :class="{ disabled: isLoading }">
        <template #title>
            <overview-widget-header :title="title || tt('Upcoming Bills & Subscriptions')" :icon="mdiCalendarClockOutline">
                <v-btn density="compact" color="default" variant="text"
                       :aria-label="tt('Scheduled Transactions')" :icon="true"
                       to="/schedule/list" v-if="!editing">
                    <v-icon :icon="mdiChevronRight" size="20" />
                    <v-tooltip activator="parent">{{ tt('Scheduled Transactions') }}</v-tooltip>
                </v-btn>
            </overview-widget-header>
        </template>

        <v-card-text class="overview-widget__body overview-widget__list-body d-flex flex-column">
            <div class="upcoming-bills-widget__summary-strip mb-2">
                <div class="d-flex align-center gap-2 min-width-0">
                    <span class="upcoming-bills-widget__summary-label text-truncate">{{ tt('Remaining This Month') }}</span>
                    <v-chip class="upcoming-bills-widget__count-badge" size="x-small" color="primary" variant="tonal"
                            v-if="!isLoading">{{ formatNumberToLocalizedNumerals(summary.remainingMonthCount) }}</v-chip>
                </div>
                <v-skeleton-loader class="skeleton-no-margin" type="text" width="90px" :loading="true" v-if="isLoading && !templatesLoaded"></v-skeleton-loader>
                <span class="overview-widget__amount font-weight-semibold text-expense" v-else>{{ displayRemainingMonthTotal }}</span>
            </div>

            <v-list class="py-0" density="compact" v-if="displayItems.length">
                <v-list-item class="overview-widget__list-item upcoming-bills-widget__item"
                             :key="item.id"
                             :to="editing ? undefined : '/schedule/list'"
                             v-for="item in displayItems">
                    <template #prepend>
                        <span class="overview-widget__item-icon">
                            <ItemIcon size="24px" :icon-type="getCategoryIconType(getItemCategory(item)?.iconType)"
                                      :icon-id="getItemCategory(item)?.icon ?? ''"
                                      :color="getItemCategory(item)?.color"
                                      v-if="getItemCategory(item) && getItemCategory(item)?.color" />
                            <v-icon size="24" :icon="mdiCalendarClockOutline" v-else />
                        </span>
                    </template>

                    <v-list-item-title class="text-truncate">{{ item.name }}</v-list-item-title>
                    <div class="text-truncate overview-widget__caption text-body-small mt-h1" :title="getItemCaption(item)">
                        {{ getItemCaption(item) }}
                    </div>

                    <template #append>
                        <div class="upcoming-bills-widget__append">
                            <span class="upcoming-bills-widget__due-badge" :class="getDueBadgeClass(item.daysUntil)">
                                {{ getDueBadgeText(item.daysUntil) }}
                            </span>
                            <div class="overview-widget__list-amount overview-widget__amount" :class="getAmountClass(item)">
                                {{ getDisplayItemAmount(item) }}
                            </div>
                        </div>
                    </template>
                </v-list-item>
            </v-list>

            <div v-else-if="isLoading && !displayItems.length">
                <v-skeleton-loader class="skeleton-no-margin mx-2 py-4 my-1" type="text" :key="idx" :loading="true" v-for="idx in effectiveItemCount"></v-skeleton-loader>
            </div>

            <div class="overview-widget__empty" v-else>
                <v-icon :icon="mdiCalendarClockOutline" size="32" />
                <span>{{ tt('No upcoming bills') }}</span>
                <v-btn size="small" variant="tonal" color="primary" :to="editing ? undefined : '/schedule/list'">
                    {{ tt('Manage Scheduled Transactions') }}
                </v-btn>
            </div>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import OverviewWidgetHeader from './OverviewWidgetHeader.vue';

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

import {
    mdiCalendarClockOutline,
    mdiChevronRight
} from '@mdi/js';

const props = defineProps<{
    loading: boolean;
    title?: string;
    editing?: boolean;
    daysAhead: number;
    itemCount: number;
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

function getAmountClass(item: UpcomingBillItem): string {
    if (item.type === TransactionType.Income) {
        return 'text-income';
    } else if (item.type === TransactionType.Expense) {
        return 'text-expense';
    } else {
        return '';
    }
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
        return 'upcoming-bills-widget__due-badge--today';
    } else if (daysUntil === 1) {
        return 'upcoming-bills-widget__due-badge--tomorrow';
    } else {
        return 'upcoming-bills-widget__due-badge--future';
    }
}
</script>

<style scoped>
.upcoming-bills-widget__summary-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-inline: 6px;
    padding: 8px 12px;
    border-radius: var(--ebk-radius-md);
    background: rgba(var(--v-theme-on-surface), 0.04);
    border: 1px solid rgba(var(--ebk-border), 0.06);
}

.upcoming-bills-widget__summary-label {
    font-size: 0.78rem;
    font-weight: 500;
    color: rgba(var(--v-theme-on-surface), 0.72);
}

.upcoming-bills-widget__count-badge {
    flex: 0 0 auto;
    font-weight: 600;
}

.upcoming-bills-widget__append {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    padding-inline-start: 10px;
}

.upcoming-bills-widget__due-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
}

.upcoming-bills-widget__due-badge--today {
    color: rgb(var(--v-theme-error));
    background: rgba(var(--v-theme-error), 0.12);
}

.upcoming-bills-widget__due-badge--tomorrow {
    color: rgb(var(--v-theme-warning));
    background: rgba(var(--v-theme-warning), 0.14);
}

.upcoming-bills-widget__due-badge--future {
    color: rgba(var(--v-theme-on-surface), 0.65);
    background: rgba(var(--v-theme-on-surface), 0.07);
}
</style>
