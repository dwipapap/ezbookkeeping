<template>
    <f7-list strong inset dividers class="overview-widget-list quick-templates-widget no-margin-top margin-bottom"
             :class="{ 'skeleton-text': (loading || loadingTemplates) && !templates.length }">
        <f7-list-item group-title v-if="showTitle">
            <div class="display-flex justify-content-space-between align-items-center width-100">
                <small>{{ title || tt('Quick Record') }}</small>
                <f7-link class="quick-templates-widget__manage-link" v-if="!editing" @click="openTemplateList">
                    <small>{{ tt('Manage Templates') }}</small>
                </f7-link>
            </div>
        </f7-list-item>

        <f7-list-item class="quick-templates-widget__strip-item" v-if="(loading || loadingTemplates) && !templates.length">
            <template #inner>
                <div class="quick-templates-widget__strip">
                    <div class="quick-templates-widget__pill quick-templates-widget__pill--skeleton" :key="idx" v-for="idx in Math.min(displayItemCount, 4)">
                        <span class="quick-templates-widget__pill-icon">
                            <f7-icon f7="app_fill" size="18" />
                        </span>
                        <span class="quick-templates-widget__pill-content">
                            <span class="quick-templates-widget__pill-name">Template</span>
                            <span class="quick-templates-widget__pill-amount">0.00 USD</span>
                        </span>
                    </div>
                </div>
            </template>
        </f7-list-item>

        <f7-list-item :link="editing ? undefined : '#'"
                      :title="tt('No templates')"
                      :after="editing ? undefined : tt('Manage Templates')"
                      @click="onEmptyClick"
                      v-else-if="!loading && !loadingTemplates && !templates.length">
            <template #media>
                <f7-icon f7="bolt" />
            </template>
        </f7-list-item>

        <f7-list-item class="quick-templates-widget__strip-item" v-else>
            <template #inner>
                <div class="quick-templates-widget__strip">
                    <button type="button"
                            class="quick-templates-widget__pill"
                            :class="{ 'quick-templates-widget__pill--submitting': submittingTemplateId === template.id }"
                            :disabled="submittingTemplateId === template.id"
                            :key="template.id"
                            v-for="template in templates"
                            @click="onTemplateTap(template)">
                        <span class="quick-templates-widget__pill-icon" :style="getPillIconBgStyle(template)">
                            <ItemIcon :icon-type="getCategoryIconType(getTemplateCategory(template)?.iconType)"
                                      :icon-id="getTemplateCategory(template)?.icon ?? ''"
                                      :color="getTemplateCategory(template)?.color"
                                      v-if="getTemplateCategory(template) && getTemplateCategory(template)?.color" />
                            <f7-icon f7="pencil_ellipsis_rectangle" v-else />
                        </span>
                        <span class="quick-templates-widget__pill-content">
                            <span class="quick-templates-widget__pill-name">{{ template.name }}</span>
                            <span class="quick-templates-widget__pill-amount" :class="getAmountClass(template)">
                                {{ getDisplayTemplateAmount(template) }}
                            </span>
                        </span>
                        <f7-preloader :size="14" class="quick-templates-widget__pill-badge"
                                      v-if="submittingTemplateId === template.id" />
                        <f7-icon f7="bolt_fill" size="12" class="quick-templates-widget__pill-badge text-color-primary"
                                 v-else-if="instantLog" />
                    </button>

                    <button type="button"
                            class="quick-templates-widget__pill quick-templates-widget__pill--add"
                            v-if="!editing"
                            @click="openTemplateList">
                        <f7-icon f7="plus" size="14" />
                        <span class="quick-templates-widget__pill-add-label">{{ tt('Templates') }}</span>
                    </button>
                </div>
            </template>
        </f7-list-item>
    </f7-list>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { f7ready } from 'framework7-vue';
import type { Toast } from 'framework7/types';

import { useI18n } from '@/locales/helpers.ts';
import { useI18nUIComponents } from '@/lib/ui/mobile.ts';

import { useSettingsStore } from '@/stores/setting.ts';
import { useUserStore } from '@/stores/user.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';
import { useTransactionTemplatesStore } from '@/stores/transactionTemplate.ts';
import { useTransactionsStore } from '@/stores/transaction.ts';

import { MobileOverviewWidgetNavigationType } from '@/core/overview_layout.ts';
import { TransactionType } from '@/core/transaction.ts';
import { DISPLAY_HIDDEN_AMOUNT } from '@/consts/numeral.ts';

import type { TransactionCategory } from '@/models/transaction_category.ts';
import type { TransactionTemplate } from '@/models/transaction_template.ts';
import { Transaction } from '@/models/transaction.ts';

import { parseBigDecimal } from '@/lib/numeral.ts';
import { getBrowserTimezoneName, getCurrentUnixTime, getTimezoneOffsetMinutes } from '@/lib/datetime.ts';
import { getCategoryIconType } from '@/lib/icon.ts';
import { generateRandomUUID } from '@/lib/misc.ts';
import logger from '@/lib/logger.ts';

const DEFAULT_MOBILE_ITEM_COUNT = 8;

const props = defineProps<{
    loading: boolean;
    title?: string;
    showTitle: boolean;
    editing?: boolean;
    itemCount: number;
    instantLog: boolean;
}>();

const emit = defineEmits<{
    (e: 'navigate', type: MobileOverviewWidgetNavigationType, path?: string): void;
    (e: 'refresh'): void;
}>();

const { tt, formatAmountToLocalizedNumeralsWithCurrency } = useI18n();
const { showToast } = useI18nUIComponents();

const settingsStore = useSettingsStore();
const userStore = useUserStore();
const accountsStore = useAccountsStore();
const transactionCategoriesStore = useTransactionCategoriesStore();
const transactionTemplatesStore = useTransactionTemplatesStore();
const transactionsStore = useTransactionsStore();

const loadingTemplates = ref<boolean>(false);
const submittingTemplateId = ref<string | null>(null);

let activeUndoToast: Toast.Toast | null = null;
const undoneTransactionIds = new Set<string>();

const showAmountInHomePage = computed<boolean>(() => settingsStore.appSettings.showAmountInHomePage);
const displayItemCount = computed<number>(() => props.itemCount > 0 ? props.itemCount : DEFAULT_MOBILE_ITEM_COUNT);
const templates = computed<TransactionTemplate[]>(() => transactionTemplatesStore.allVisibleNormalTemplates.slice(0, displayItemCount.value));

function getTemplateCategory(template: TransactionTemplate): TransactionCategory | undefined {
    return transactionCategoriesStore.allTransactionCategoriesMap[template.categoryId];
}

function getPillIconBgStyle(template: TransactionTemplate): Record<string, string> {
    const color = getTemplateCategory(template)?.color;
    if (color && /^[0-9a-f]{6}$/i.test(color)) {
        return { 'background-color': `#${color}22` };
    }
    return {};
}

function getDisplayTemplateAmount(template: TransactionTemplate): string {
    const amount = !showAmountInHomePage.value || template.hideAmount ? DISPLAY_HIDDEN_AMOUNT : parseBigDecimal(template.sourceAmount);
    return formatAmountToLocalizedNumeralsWithCurrency(amount, accountsStore.allAccountsMap[template.sourceAccountId]?.currency ?? '');
}

function getAmountClass(template: TransactionTemplate): string {
    if (template.type === TransactionType.Income) {
        return 'text-income';
    } else if (template.type === TransactionType.Expense) {
        return 'text-expense';
    } else {
        return '';
    }
}

function hasRequiredFieldsForInstantLog(template: TransactionTemplate): boolean {
    if (template.type !== TransactionType.Expense &&
        template.type !== TransactionType.Income &&
        template.type !== TransactionType.Transfer) {
        return false;
    }

    if (!template.sourceAccountId || template.sourceAccountId === '0') {
        return false;
    }

    const sourceAccount = accountsStore.allAccountsMap[template.sourceAccountId];

    if (!sourceAccount || sourceAccount.hidden) {
        return false;
    }

    if (!template.categoryId || template.categoryId === '0') {
        return false;
    }

    const category = transactionCategoriesStore.allTransactionCategoriesMap[template.categoryId];

    if (!category || category.hidden) {
        return false;
    }

    if (template.type === TransactionType.Transfer) {
        if (!template.destinationAccountId || template.destinationAccountId === '0') {
            return false;
        }

        const destinationAccount = accountsStore.allAccountsMap[template.destinationAccountId];

        if (!destinationAccount || destinationAccount.hidden) {
            return false;
        }
    }

    return true;
}

function openTemplateList(): void {
    if (props.editing) {
        return;
    }

    emit('navigate', MobileOverviewWidgetNavigationType.Url, '/template/list');
}

function onEmptyClick(): void {
    if (props.editing) {
        return;
    }

    openTemplateList();
}

async function undoCreatedTransaction(createdTransaction: Transaction): Promise<void> {
    if (!createdTransaction.id || undoneTransactionIds.has(createdTransaction.id)) {
        return;
    }

    undoneTransactionIds.add(createdTransaction.id);

    try {
        await transactionsStore.deleteTransaction({
            transaction: createdTransaction,
            defaultCurrency: userStore.currentUserDefaultCurrency
        });

        emit('refresh');
    } catch (error: unknown) {
        undoneTransactionIds.delete(createdTransaction.id);
        const err = error as { processed?: boolean; message?: string } | undefined;

        if (err && !err.processed) {
            showToast((err.message || err) as string);
        }
    }
}

function showUndoToast(createdTransaction: Transaction, templateName: string): void {
    f7ready((f7Instance) => {
        if (activeUndoToast) {
            activeUndoToast.close();
            activeUndoToast = null;
        }

        const toast = f7Instance.toast.create({
            text: tt('Logged: {name}', { name: templateName }),
            position: 'bottom',
            closeTimeout: 5000,
            closeButton: true,
            closeButtonText: tt('Undo'),
            destroyOnClose: true,
            on: {
                closeButtonClick: () => {
                    undoCreatedTransaction(createdTransaction);
                },
                closed: () => {
                    if (activeUndoToast === toast) {
                        activeUndoToast = null;
                    }
                }
            }
        });

        activeUndoToast = toast;
        toast.open();
    });
}

async function instantLogTemplate(template: TransactionTemplate): Promise<void> {
    submittingTemplateId.value = template.id;

    try {
        const now = getCurrentUnixTime();
        const utcOffset = getTimezoneOffsetMinutes(now);
        const newTransaction = Transaction.createNewTransaction(
            template.type,
            now,
            getBrowserTimezoneName(),
            utcOffset
        );

        newTransaction.setCategoryId(template.categoryId);
        newTransaction.sourceAccountId = template.sourceAccountId;
        newTransaction.destinationAccountId = template.type === TransactionType.Transfer ? template.destinationAccountId : '0';
        newTransaction.sourceAmount = template.sourceAmount;
        newTransaction.destinationAmount = template.type === TransactionType.Transfer ? template.destinationAmount : 0;
        newTransaction.hideAmount = template.hideAmount;
        newTransaction.tagIds = template.tagIds ? [...template.tagIds] : [];
        newTransaction.comment = template.comment || '';

        const createdTransaction = await transactionsStore.saveTransaction({
            transaction: newTransaction,
            defaultCurrency: userStore.currentUserDefaultCurrency,
            isEdit: false,
            clientSessionId: generateRandomUUID()
        });

        emit('refresh');
        showUndoToast(createdTransaction, template.name);
    } catch (error: unknown) {
        const err = error as { processed?: boolean; message?: string } | undefined;

        if (err && !err.processed) {
            showToast((err.message || err) as string);
        }
    } finally {
        if (submittingTemplateId.value === template.id) {
            submittingTemplateId.value = null;
        }
    }
}

function onTemplateTap(template: TransactionTemplate): void {
    if (props.editing || submittingTemplateId.value === template.id) {
        return;
    }

    if (!props.instantLog || !hasRequiredFieldsForInstantLog(template)) {
        emit('navigate', MobileOverviewWidgetNavigationType.Url, '/transaction/add?templateId=' + template.id);
        return;
    }

    instantLogTemplate(template);
}

onMounted(() => {
    loadingTemplates.value = true;
    transactionTemplatesStore.loadAllNormalTemplates({ force: false }).catch(error => {
        logger.warn('failed to load normal transaction templates', error);
    }).finally(() => {
        loadingTemplates.value = false;
    });
});

onBeforeUnmount(() => {
    if (activeUndoToast) {
        activeUndoToast.close();
        activeUndoToast = null;
    }
});
</script>

<style scoped>
.quick-templates-widget__strip-item :deep(.item-content) {
    padding-inline-start: 0;
}

.quick-templates-widget__strip-item :deep(.item-inner) {
    min-width: 0;
    padding-inline-end: 0;
    padding-top: 4px;
    padding-bottom: 10px;
}

.quick-templates-widget__strip {
    display: flex;
    overflow-x: auto;
    gap: 10px;
    width: 100%;
    padding: 2px 14px;
    box-sizing: border-box;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
}

.quick-templates-widget__strip::-webkit-scrollbar {
    display: none;
}

.quick-templates-widget__pill {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    flex: 0 0 auto;
    width: auto !important;
    max-width: 204px;
    padding: 9px 13px;
    border-radius: 16px;
    border: 0;
    background-color: rgba(128, 128, 128, 0.08);
    color: var(--f7-text-color);
    font: inherit;
    text-align: start;
    cursor: pointer;
    touch-action: manipulation;
    transition: opacity 0.15s ease, transform 0.1s ease;
}

:root.dark .quick-templates-widget__pill {
    background-color: rgba(255, 255, 255, 0.07);
}

.quick-templates-widget__pill:active:not(:disabled) {
    transform: scale(0.96);
    opacity: 0.82;
}

.quick-templates-widget__pill--submitting {
    opacity: 0.65;
}

.quick-templates-widget__pill--skeleton {
    cursor: default;
}

.quick-templates-widget__pill--add {
    background-color: rgba(var(--f7-theme-color-rgb), 0.10);
    color: var(--f7-theme-color);
    gap: 5px;
    padding: 9px 14px;
}

.quick-templates-widget__pill-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background-color: rgba(128, 128, 128, 0.12);
}

.quick-templates-widget__pill-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
}

.quick-templates-widget__pill-name {
    font-size: 0.84rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.quick-templates-widget__pill-amount {
    font-size: 0.74rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    white-space: nowrap;
}

.quick-templates-widget__pill-add-label {
    font-size: 0.82rem;
    font-weight: 600;
    white-space: nowrap;
}

.quick-templates-widget__pill-badge {
    flex: 0 0 auto;
    opacity: 0.85;
}
</style>
