<template>
    <v-card class="overview-widget quick-templates-widget h-100" :class="{ disabled: loading }">
        <template #title>
            <overview-widget-header :title="title || tt('Quick Record')" :icon="mdiLightningBoltOutline">
                <v-btn density="compact" color="default" variant="text" :icon="true"
                       to="/template/list" :aria-label="tt('Manage Templates')" v-if="!editing">
                    <v-icon :icon="mdiCogOutline" size="18" />
                    <v-tooltip activator="parent">{{ tt('Manage Templates') }}</v-tooltip>
                </v-btn>
            </overview-widget-header>
        </template>

        <v-card-text class="overview-widget__body quick-templates-widget__body">
            <div class="quick-templates-widget__grid" v-if="(loading || loadingTemplates) && !templates.length">
                <div class="quick-templates-widget__pill quick-templates-widget__pill--skeleton" :key="idx" v-for="idx in displayItemCount">
                    <v-skeleton-loader class="skeleton-no-margin w-100" type="text" :loading="true" />
                </div>
            </div>
            <div class="overview-widget__empty" v-else-if="!loading && !loadingTemplates && !templates.length">
                <v-icon :icon="mdiLightningBoltOutline" size="32" />
                <span>{{ tt('No templates') }}</span>
                <v-btn size="small" variant="tonal" color="primary" to="/template/list" v-if="!editing">
                    {{ tt('Manage Templates') }}
                </v-btn>
            </div>
            <div class="quick-templates-widget__grid" v-else>
                <button type="button"
                        class="quick-templates-widget__pill"
                        :class="{ 'quick-templates-widget__pill--submitting': submittingTemplateId === template.id }"
                        :disabled="submittingTemplateId === template.id"
                        :title="template.name"
                        :key="template.id"
                        v-for="template in templates"
                        @click="onTemplateClick(template)">
                    <span class="quick-templates-widget__pill-icon">
                        <ItemIcon size="20px"
                                  :icon-type="getCategoryIconType(getTemplateCategory(template)?.iconType)"
                                  :icon-id="getTemplateCategory(template)?.icon ?? ''"
                                  :color="getTemplateCategory(template)?.color"
                                  v-if="getTemplateCategory(template) && getTemplateCategory(template)?.color" />
                        <v-icon size="20" :icon="mdiPencilBoxOutline" v-else />
                    </span>
                    <span class="quick-templates-widget__pill-content">
                        <span class="quick-templates-widget__pill-name text-truncate">{{ template.name }}</span>
                        <span class="quick-templates-widget__pill-amount overview-widget__amount" :class="getAmountClass(template)">
                            {{ getDisplayTemplateAmount(template) }}
                        </span>
                    </span>
                    <v-progress-circular indeterminate size="14" width="2" color="primary"
                                         class="quick-templates-widget__pill-badge"
                                         v-if="submittingTemplateId === template.id" />
                    <v-icon :icon="mdiLightningBolt" size="14" color="primary"
                            class="quick-templates-widget__pill-badge"
                            v-else-if="instantLog" />
                </button>
            </div>
        </v-card-text>

        <edit-dialog ref="editDialog" :type="TransactionEditPageType.Transaction" />

        <v-snackbar v-model="showUndoSnackbar" :timeout="5000">
            <span>{{ tt('Logged: {name}', { name: lastLoggedTemplateName }) }}</span>
            <template #actions>
                <v-btn variant="text" color="primary" :loading="undoing" @click="undoLastLoggedTransaction">
                    {{ tt('Undo') }}
                </v-btn>
            </template>
        </v-snackbar>
    </v-card>
</template>

<script setup lang="ts">
import OverviewWidgetHeader from './OverviewWidgetHeader.vue';
import EditDialog from '@/views/desktop/transactions/list/dialogs/EditDialog.vue';

import { ref, computed, nextTick, onMounted, useTemplateRef } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { TransactionEditPageType } from '@/views/base/transactions/TransactionEditPageBase.ts';

import { useSettingsStore } from '@/stores/setting.ts';
import { useUserStore } from '@/stores/user.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';
import { useTransactionTemplatesStore } from '@/stores/transactionTemplate.ts';
import { useTransactionsStore } from '@/stores/transaction.ts';
import { useDesktopPageStore } from '@/stores/desktopPage.ts';

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

import {
    mdiCogOutline,
    mdiLightningBolt,
    mdiLightningBoltOutline,
    mdiPencilBoxOutline
} from '@mdi/js';

type EditDialogType = InstanceType<typeof EditDialog>;

const DEFAULT_DESKTOP_ITEM_COUNT = 6;

const props = defineProps<{
    loading: boolean;
    title?: string;
    editing?: boolean;
    itemCount: number;
    instantLog: boolean;
}>();

const emit = defineEmits<{
    (e: 'refresh'): void;
}>();

const { tt, formatAmountToLocalizedNumeralsWithCurrency } = useI18n();

const settingsStore = useSettingsStore();
const userStore = useUserStore();
const accountsStore = useAccountsStore();
const transactionCategoriesStore = useTransactionCategoriesStore();
const transactionTemplatesStore = useTransactionTemplatesStore();
const transactionsStore = useTransactionsStore();
const desktopPageStore = useDesktopPageStore();

const editDialog = useTemplateRef<EditDialogType>('editDialog');

const loadingTemplates = ref<boolean>(false);
const submittingTemplateId = ref<string | null>(null);
const showUndoSnackbar = ref<boolean>(false);
const undoing = ref<boolean>(false);
const lastLoggedTransaction = ref<Transaction | null>(null);
const lastLoggedTemplateName = ref<string>('');

const showAmountInHomePage = computed<boolean>(() => settingsStore.appSettings.showAmountInHomePage);
const displayItemCount = computed<number>(() => props.itemCount > 0 ? props.itemCount : DEFAULT_DESKTOP_ITEM_COUNT);
const templates = computed<TransactionTemplate[]>(() => transactionTemplatesStore.allVisibleNormalTemplates.slice(0, displayItemCount.value));

function getTemplateCategory(template: TransactionTemplate): TransactionCategory | undefined {
    return transactionCategoriesStore.allTransactionCategoriesMap[template.categoryId];
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

function openPreFilledDialog(template: TransactionTemplate): void {
    editDialog.value?.open({
        template: template
    }).then(result => {
        if (result && result.message) {
            desktopPageStore.addToast(result.message);
        }

        emit('refresh');
    }).catch(error => {
        if (error) {
            desktopPageStore.addErrorToast(error);
        }
    });
}

function triggerUndoSnackbar(createdTransaction: Transaction, templateName: string): void {
    lastLoggedTransaction.value = createdTransaction;
    lastLoggedTemplateName.value = templateName;

    if (showUndoSnackbar.value) {
        showUndoSnackbar.value = false;
        nextTick(() => {
            showUndoSnackbar.value = true;
        });
    } else {
        showUndoSnackbar.value = true;
    }
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
        triggerUndoSnackbar(createdTransaction, template.name);
    } catch (error: unknown) {
        const err = error as { processed?: boolean; message?: string } | undefined;

        if (err && !err.processed) {
            desktopPageStore.addErrorToast(err as { message: string });
        }
    } finally {
        if (submittingTemplateId.value === template.id) {
            submittingTemplateId.value = null;
        }
    }
}

function onTemplateClick(template: TransactionTemplate): void {
    if (props.editing || submittingTemplateId.value === template.id) {
        return;
    }

    if (!props.instantLog || !hasRequiredFieldsForInstantLog(template)) {
        openPreFilledDialog(template);
        return;
    }

    instantLogTemplate(template);
}

async function undoLastLoggedTransaction(): Promise<void> {
    if (!lastLoggedTransaction.value || undoing.value) {
        return;
    }

    undoing.value = true;

    try {
        await transactionsStore.deleteTransaction({
            transaction: lastLoggedTransaction.value,
            defaultCurrency: userStore.currentUserDefaultCurrency
        });

        showUndoSnackbar.value = false;
        lastLoggedTransaction.value = null;
        emit('refresh');
    } catch (error: unknown) {
        const err = error as { processed?: boolean; message?: string } | undefined;

        if (err && !err.processed) {
            desktopPageStore.addErrorToast(err as { message: string });
        }
    } finally {
        undoing.value = false;
    }
}

onMounted(() => {
    loadingTemplates.value = true;
    transactionTemplatesStore.loadAllNormalTemplates({ force: false }).catch(error => {
        logger.warn('failed to load normal transaction templates', error);
    }).finally(() => {
        loadingTemplates.value = false;
    });
});
</script>

<style scoped>
.quick-templates-widget__body {
    padding-top: 2px;
}

.quick-templates-widget__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
}

.quick-templates-widget__pill {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 8px 10px;
    border-radius: var(--ebk-radius-md, 10px);
    border: 1px solid rgba(var(--ebk-border), 0.1);
    background: rgba(var(--v-theme-on-surface), 0.03);
    color: inherit;
    text-align: start;
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}

.quick-templates-widget__pill:hover:not(:disabled) {
    background: rgba(var(--v-theme-primary), 0.08);
    border-color: rgba(var(--v-theme-primary), 0.28);
}

.quick-templates-widget__pill:active:not(:disabled) {
    transform: scale(0.98);
}

.quick-templates-widget__pill--submitting {
    opacity: 0.7;
    cursor: wait;
}

.quick-templates-widget__pill--skeleton {
    cursor: default;
    min-height: 52px;
}

.quick-templates-widget__pill-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border-radius: var(--ebk-radius-md, 8px);
    background: rgba(var(--v-theme-on-surface), 0.045);
}

.quick-templates-widget__pill-content {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    gap: 1px;
}

.quick-templates-widget__pill-name {
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1.25;
}

.quick-templates-widget__pill-amount {
    font-size: 0.75rem;
    font-weight: 500;
}

.quick-templates-widget__pill-badge {
    flex: 0 0 auto;
    opacity: 0.85;
}
</style>
