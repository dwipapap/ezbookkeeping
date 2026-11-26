<template>
    <v-dialog width="680" v-model="showState">
        <one-column-dialog-layout :title="dialogTitle"
                                  :cancel-button-title="tt('Close')"
                                  @cancel="closeDialog">
            <template #toolbar>
                <template v-if="viewMode === 'list'">
                    <v-btn class="mx-2" color="primary" variant="tonal" density="comfortable"
                           :prepend-icon="mdiPlus" @click="startCreateGoal">
                        {{ tt('Create Goal') }}
                    </v-btn>
                </template>
                <template v-else>
                    <v-btn class="mx-1" color="secondary" variant="text" density="comfortable"
                           :disabled="uploadingCoverImage" @click="cancelEdit">
                        {{ tt('Back') }}
                    </v-btn>
                    <v-btn class="mx-2" color="primary" variant="flat" density="comfortable"
                           :disabled="!canSave || uploadingCoverImage" @click="saveGoal">
                        {{ tt('Save') }}
                    </v-btn>
                </template>
            </template>

            <template #content>
                <div v-if="viewMode === 'list'">
                    <div class="d-flex flex-column align-center justify-center py-8 text-center ga-3" v-if="!goals.length">
                        <v-icon :icon="mdiPiggyBankOutline" size="48" color="primary" />
                        <div class="text-title-medium">{{ tt('No savings goals yet') }}</div>
                        <div class="text-body-medium text-medium-emphasis">
                            {{ tt('Track your progress toward financial targets by linking accounts or logging manual savings.') }}
                        </div>
                        <v-btn color="primary" variant="tonal" :prepend-icon="mdiPlus" @click="startCreateGoal">
                            {{ tt('Create Goal') }}
                        </v-btn>
                    </div>

                    <v-list class="pa-0" lines="two" v-else>
                        <template :key="item.goal.id" v-for="(item, index) in goalItems">
                            <v-divider v-if="index > 0" class="my-1" />
                            <v-list-item class="px-2 py-2 rounded-lg">
                                <template #prepend>
                                    <div class="savings-goal-manage-thumb me-3"
                                         :style="getThumbStyle(item.goal)">
                                        <v-icon :icon="mdiPiggyBankOutline" size="20"
                                                :color="coverUrls[item.goal.id] ? 'white' : undefined"
                                                v-if="!coverUrls[item.goal.id]" />
                                    </div>
                                </template>

                                <v-list-item-title class="font-weight-medium d-flex align-center ga-2">
                                    <span class="text-truncate">{{ item.goal.name }}</span>
                                    <v-chip size="x-small" label variant="tonal"
                                            :color="item.goal.mode === 'accounts' ? 'primary' : 'secondary'">
                                        {{ item.goal.mode === 'accounts' ? tt('Linked Accounts') : tt('Manual') }}
                                    </v-chip>
                                    <v-chip size="x-small" label color="success" variant="flat" v-if="item.progress.isCompleted">
                                        {{ tt('Completed') }}
                                    </v-chip>
                                </v-list-item-title>

                                <v-list-item-subtitle class="mt-1">
                                    <span>{{ formatGoalAmount(item.progress.savedAmount, item.currency, item.progress.incomplete) }}</span>
                                    <span class="mx-1">/</span>
                                    <span>{{ formatGoalAmount(item.progress.targetAmount, item.currency, false) }}</span>
                                    <span class="ms-2 font-weight-medium">({{ formatPercentToLocalizedNumerals(item.progress.rawPercent, 0, '<1') }})</span>
                                </v-list-item-subtitle>

                                <template #append>
                                    <div class="d-flex align-center ga-1">
                                        <v-btn density="comfortable" variant="text" color="default" :icon="true"
                                               :aria-label="tt('Edit')" @click="startEditGoal(item.goal)">
                                            <v-icon :icon="mdiPencilOutline" size="20" />
                                            <v-tooltip activator="parent">{{ tt('Edit') }}</v-tooltip>
                                        </v-btn>
                                        <v-btn density="comfortable" variant="text" color="error" :icon="true"
                                               :aria-label="tt('Delete')" @click="confirmDeleteGoal(item.goal)">
                                            <v-icon :icon="mdiDeleteOutline" size="20" />
                                            <v-tooltip activator="parent">{{ tt('Delete') }}</v-tooltip>
                                        </v-btn>
                                    </div>
                                </template>
                            </v-list-item>
                        </template>
                    </v-list>
                </div>

                <v-form v-else :key="formSessionKey" class="pt-1">
                    <v-row dense>
                        <v-col cols="12">
                            <v-text-field
                                autofocus
                                autocomplete="off"
                                persistent-placeholder
                                :label="tt('Name')"
                                :placeholder="tt('e.g. Emergency Fund')"
                                v-model="form.name"
                            />
                        </v-col>

                        <v-col cols="12" sm="7">
                            <amount-input
                                persistent-placeholder
                                :label="tt('Target Amount')"
                                :currency="form.currency"
                                :show-currency="true"
                                :enable-formula="true"
                                v-model="form.targetAmount"
                            />
                        </v-col>

                        <v-col cols="12" sm="5">
                            <currency-select
                                :label="tt('Currency')"
                                v-model="form.currency"
                            />
                        </v-col>

                        <v-col cols="12" class="mt-1">
                            <div class="text-body-small text-medium-emphasis mb-2">{{ tt('Tracking Mode') }}</div>
                            <v-btn-toggle
                                mandatory
                                color="primary"
                                variant="outlined"
                                divided
                                class="w-100"
                                v-model="form.mode"
                            >
                                <v-btn value="accounts" class="flex-grow-1">
                                    {{ tt('Link Existing Accounts') }}
                                </v-btn>
                                <v-btn value="manual" class="flex-grow-1">
                                    {{ tt('Manual Progress') }}
                                </v-btn>
                            </v-btn-toggle>
                        </v-col>

                        <v-col cols="12" class="mt-2" v-if="form.mode === 'accounts'">
                            <div class="d-flex justify-space-between align-center mb-2">
                                <span class="text-body-small text-medium-emphasis">{{ tt('Linked Accounts') }}</span>
                                <span class="text-body-small text-primary font-weight-medium">
                                    {{ form.linkedAccountIds.length }} {{ tt('Selected') }}
                                </span>
                            </div>

                            <div class="savings-goal-account-list border rounded-lg pa-2" v-if="visibleAssetAccounts.length">
                                <template :key="account.id" v-for="(account, idx) in visibleAssetAccounts">
                                    <v-divider v-if="idx > 0" class="my-1" />
                                    <template v-if="account.type === AccountType.SingleAccount.type">
                                        <v-checkbox
                                            density="compact"
                                            hide-details
                                            :model-value="isAccountSelected(account.id)"
                                            @update:model-value="toggleSingleAccount(account.id, !!$event)"
                                        >
                                            <template #label>
                                                <div class="d-flex align-center justify-space-between w-100 ps-1">
                                                    <div class="d-flex align-center ga-2 text-truncate">
                                                        <ItemIcon size="20px" :icon-type="getAccountIconType(account.iconType)" :icon-id="account.icon" :color="account.color" />
                                                        <span class="text-body-medium text-truncate">{{ account.name }}</span>
                                                    </div>
                                                    <span class="text-body-small text-medium-emphasis ms-2 text-no-wrap">
                                                        {{ formatAccountBalance(account) }}
                                                    </span>
                                                </div>
                                            </template>
                                        </v-checkbox>
                                    </template>

                                    <template v-else-if="account.type === AccountType.MultiSubAccounts.type && getVisibleAssetSubAccounts(account).length">
                                        <v-checkbox
                                            density="compact"
                                            hide-details
                                            :model-value="isAllSubAccountsSelected(account)"
                                            :indeterminate="isSomeSubAccountsSelected(account)"
                                            @update:model-value="toggleParentAccount(account, !!$event)"
                                        >
                                            <template #label>
                                                <div class="d-flex align-center ga-2 text-truncate ps-1">
                                                    <ItemIcon size="20px" :icon-type="getAccountIconType(account.iconType)" :icon-id="account.icon" :color="account.color" />
                                                    <span class="text-body-medium font-weight-medium text-truncate">{{ account.name }}</span>
                                                </div>
                                            </template>
                                        </v-checkbox>

                                        <div class="ps-6">
                                            <v-checkbox
                                                density="compact"
                                                hide-details
                                                :key="subAccount.id"
                                                :model-value="isAccountSelected(subAccount.id)"
                                                v-for="subAccount in getVisibleAssetSubAccounts(account)"
                                                @update:model-value="toggleSingleAccount(subAccount.id, !!$event)"
                                            >
                                                <template #label>
                                                    <div class="d-flex align-center justify-space-between w-100 ps-1">
                                                        <span class="text-body-small text-truncate">{{ subAccount.name }}</span>
                                                        <span class="text-body-small text-medium-emphasis ms-2 text-no-wrap">
                                                            {{ formatAccountBalance(subAccount) }}
                                                        </span>
                                                    </div>
                                                </template>
                                            </v-checkbox>
                                        </div>
                                    </template>
                                </template>
                            </div>

                            <div class="text-body-medium text-medium-emphasis pa-3 border rounded-lg text-center" v-else>
                                {{ tt('No available asset accounts') }}
                            </div>
                        </v-col>

                        <v-col cols="12" class="mt-2" v-else>
                            <amount-input
                                persistent-placeholder
                                :label="tt('Current Saved Amount')"
                                :currency="form.currency"
                                :show-currency="true"
                                :enable-formula="true"
                                v-model="form.manualSavedAmount"
                            />
                        </v-col>

                        <v-col cols="12" sm="6" class="mt-1">
                            <date-select
                                :clearable="true"
                                :label="tt('Target Date')"
                                :no-data-text="tt('Unspecified')"
                                v-model="form.targetDate"
                            />
                        </v-col>

                        <v-col cols="12" sm="6" class="mt-1">
                            <amount-input
                                persistent-placeholder
                                :label="tt('Monthly Contribution')"
                                :currency="form.currency"
                                :show-currency="true"
                                :enable-formula="true"
                                v-model="form.monthlyContribution"
                            />
                        </v-col>

                        <v-col cols="12" sm="6" class="mt-1">
                            <color-select
                                :label="tt('Color')"
                                :all-system-color-infos="ALL_ACCOUNT_COLORS"
                                v-model="form.color"
                            />
                        </v-col>

                        <v-col cols="12" class="mt-1">
                            <div class="text-body-medium font-weight-medium mb-2">{{ tt('Custom Cover Image') }}</div>

                            <div class="savings-goal-cover-preview"
                                 :class="{ 'savings-goal-cover-preview--has-image': !!formCoverPreviewUrl, 'savings-goal-cover-preview--dragging': isDraggingCover }"
                                 :style="formCoverPreviewStyle"
                                 @dragover.prevent="isDraggingCover = true"
                                 @dragleave.prevent="isDraggingCover = false"
                                 @drop.prevent="onCoverFileDrop">
                                <div class="savings-goal-cover-preview__overlay" v-if="formCoverPreviewUrl"></div>
                                <div class="savings-goal-cover-preview__content">
                                    <div class="text-title-small font-weight-bold text-truncate">
                                        {{ form.name.trim() || tt('Savings Goal') }}
                                    </div>
                                    <div class="text-body-small mt-1" v-if="!formCoverPreviewUrl">
                                        {{ tt('No custom cover image set') }}
                                    </div>
                                </div>
                            </div>

                            <input ref="coverFileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                                   class="d-none" @change="onCoverFileSelected" />

                            <div class="d-flex align-center ga-2 mt-2">
                                <v-btn color="primary" variant="tonal" size="small" :loading="uploadingCoverImage"
                                       @click="triggerCoverFilePicker">
                                    {{ form.coverImage ? tt('Change Image') : tt('Upload Image') }}
                                </v-btn>
                                <v-btn color="error" variant="text" size="small" :disabled="uploadingCoverImage"
                                       v-if="form.coverImage" @click="removeCoverImage">
                                    {{ tt('Remove Image') }}
                                </v-btn>
                            </div>
                        </v-col>
                    </v-row>
                </v-form>
            </template>
        </one-column-dialog-layout>

        <confirm-dialog ref="confirmDialog" />
    </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, useTemplateRef } from 'vue';
import type ConfirmDialog from '@/components/desktop/ConfirmDialog.vue';

import { useI18n } from '@/locales/helpers.ts';

import { useSettingsStore } from '@/stores/setting.ts';
import { useUserStore } from '@/stores/user.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useExchangeRatesStore } from '@/stores/exchangeRates.ts';
import { useDesktopPageStore } from '@/stores/desktopPage.ts';

import type { BigDecimal } from '@/core/numeral.ts';
import type { TextualYearMonthDay } from '@/core/datetime.ts';
import { AccountType } from '@/core/account.ts';
import { ALL_ACCOUNT_COLORS } from '@/consts/color.ts';
import { DISPLAY_HIDDEN_AMOUNT, INCOMPLETE_AMOUNT_SUFFIX } from '@/consts/numeral.ts';
import type { Account } from '@/models/account.ts';

import { parseBigDecimal } from '@/lib/numeral.ts';
import { getAccountIconType } from '@/lib/icon.ts';
import {
    getCachedOverviewCoverObjectUrl,
    getOverviewCoverObjectUrl,
    uploadOverviewCoverImage,
    deleteOverviewCoverImage
} from '@/lib/overview_cover.ts';
import {
    type SavingsGoalConfig,
    type SavingsGoalMode,
    type SavingsGoalProgressResult,
    calculateSavingsGoalProgress,
    createSavingsGoalId,
    parseSavingsGoals,
    serializeSavingsGoals
} from '@/lib/savings_goal.ts';

import {
    mdiDeleteOutline,
    mdiPencilOutline,
    mdiPiggyBankOutline,
    mdiPlus
} from '@mdi/js';

interface GoalFormState {
    id: string;
    name: string;
    targetAmount: number;
    currency: string;
    mode: SavingsGoalMode;
    linkedAccountIds: string[];
    manualSavedAmount: number;
    monthlyContribution: number;
    targetDate: TextualYearMonthDay | '';
    coverImage: string;
    color: string;
}

const props = defineProps<{
    show: boolean;
    startCreating?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:show', value: boolean): void;
}>();

const {
    tt,
    formatAmountToLocalizedNumeralsWithCurrency,
    formatPercentToLocalizedNumerals
} = useI18n();

const settingsStore = useSettingsStore();
const userStore = useUserStore();
const accountsStore = useAccountsStore();
const exchangeRatesStore = useExchangeRatesStore();
const desktopPageStore = useDesktopPageStore();

const confirmDialog = useTemplateRef<InstanceType<typeof ConfirmDialog>>('confirmDialog');
const coverFileInput = useTemplateRef<HTMLInputElement>('coverFileInput');

const viewMode = ref<'list' | 'edit'>('list');
const editingGoalId = ref<string | null>(null);
const formSessionKey = ref<number>(0);
const uploadingCoverImage = ref<boolean>(false);
const isDraggingCover = ref<boolean>(false);
const formCoverPreviewUrl = ref<string | null>(null);
const sessionUploadedCovers = ref<string[]>([]);
const coverUrls = ref<Record<string, string | null>>({});

const defaultCurrency = computed<string>(() => userStore.currentUserDefaultCurrency);
const showAmountInHomePage = computed<boolean>(() => settingsStore.appSettings.showAmountInHomePage);
const defaultGoalColor = computed<string>(() => ALL_ACCOUNT_COLORS[11] || '2196f3');

const form = reactive<GoalFormState>({
    id: '',
    name: '',
    targetAmount: 0,
    currency: defaultCurrency.value,
    mode: 'accounts',
    linkedAccountIds: [],
    manualSavedAmount: 0,
    monthlyContribution: 0,
    targetDate: '',
    coverImage: '',
    color: defaultGoalColor.value
});

const showState = computed<boolean>({
    get: () => props.show,
    set: (value: boolean) => {
        if (!value) {
            cleanupUnusedSessionUploads();
        }
        emit('update:show', value);
    }
});

const goals = computed<SavingsGoalConfig[]>(() => parseSavingsGoals(settingsStore.appSettings.savingsGoals));

const goalItems = computed<Array<{ goal: SavingsGoalConfig; currency: string; progress: SavingsGoalProgressResult }>>(() => {
    return goals.value.map(goal => {
        const currency = goal.currency || defaultCurrency.value;
        const progress = calculateSavingsGoalProgress(goal, {
            accountsMap: accountsStore.allAccountsMap,
            getExchangedAmount: exchangeRatesStore.getExchangedAmount,
            defaultCurrency: defaultCurrency.value
        });
        return { goal, currency, progress };
    });
});

const visibleAssetAccounts = computed<Account[]>(() => {
    return accountsStore.allAccounts.filter(account => {
        if (account.hidden || !account.isAsset) {
            return false;
        }
        if (account.type === AccountType.MultiSubAccounts.type) {
            return getVisibleAssetSubAccounts(account).length > 0;
        }
        return true;
    });
});

const dialogTitle = computed<string>(() => {
    if (viewMode.value === 'list') {
        return tt('Manage Goals');
    }
    return editingGoalId.value ? tt('Edit Goal') : tt('Create Goal');
});

const canSave = computed<boolean>(() => {
    return form.name.trim().length > 0 && form.targetAmount > 0 && form.currency.trim().length > 0;
});

const formCoverPreviewStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {};
    if (formCoverPreviewUrl.value) {
        style['backgroundImage'] = `url("${formCoverPreviewUrl.value}")`;
        style['backgroundSize'] = 'cover';
        style['backgroundPosition'] = 'center center';
    } else if (form.color) {
        style['borderColor'] = `#${form.color}`;
    }
    return style;
});

function getVisibleAssetSubAccounts(account: Account): Account[] {
    if (!account.subAccounts) {
        return [];
    }
    return account.subAccounts.filter(sub => !sub.hidden && sub.isAsset);
}

function getThumbStyle(goal: SavingsGoalConfig): Record<string, string> {
    const url = coverUrls.value[goal.id];
    if (url) {
        return {
            backgroundImage: `url("${url}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center center'
        };
    }
    if (goal.color) {
        return {
            backgroundColor: `#${goal.color}22`,
            color: `#${goal.color}`
        };
    }
    return {};
}

function formatGoalAmount(amount: BigDecimal, currency: string, incomplete: boolean): string {
    if (!showAmountInHomePage.value) {
        return formatAmountToLocalizedNumeralsWithCurrency(DISPLAY_HIDDEN_AMOUNT, currency);
    }
    return formatAmountToLocalizedNumeralsWithCurrency(amount, currency) + (incomplete ? INCOMPLETE_AMOUNT_SUFFIX : '');
}

function formatAccountBalance(account: Account): string {
    if (!showAmountInHomePage.value) {
        return formatAmountToLocalizedNumeralsWithCurrency(DISPLAY_HIDDEN_AMOUNT, account.currency);
    }
    return formatAmountToLocalizedNumeralsWithCurrency(parseBigDecimal(account.balance), account.currency);
}

function toNumberAmount(raw: string | undefined): number {
    if (!raw) {
        return 0;
    }
    try {
        const val = parseBigDecimal(raw).truncate().toDoubleNumber();
        return Number.isFinite(val) ? val : 0;
    } catch {
        return 0;
    }
}

function resetForm(goal?: SavingsGoalConfig): void {
    formSessionKey.value += 1;

    if (goal) {
        editingGoalId.value = goal.id;
        form.id = goal.id;
        form.name = goal.name;
        form.targetAmount = toNumberAmount(goal.targetAmount);
        form.currency = goal.currency || defaultCurrency.value;
        form.mode = goal.mode;
        form.linkedAccountIds = [...goal.linkedAccountIds];
        form.manualSavedAmount = toNumberAmount(goal.manualSavedAmount);
        form.monthlyContribution = toNumberAmount(goal.monthlyContribution);
        form.targetDate = (goal.targetDate as TextualYearMonthDay) || '';
        form.coverImage = goal.coverImage || '';
        form.color = goal.color || defaultGoalColor.value;
    } else {
        editingGoalId.value = null;
        form.id = createSavingsGoalId();
        form.name = '';
        form.targetAmount = 0;
        form.currency = defaultCurrency.value;
        form.mode = 'accounts';
        form.linkedAccountIds = [];
        form.manualSavedAmount = 0;
        form.monthlyContribution = 0;
        form.targetDate = '';
        form.coverImage = '';
        form.color = defaultGoalColor.value;
    }

    loadFormCoverPreview();
}

function startCreateGoal(): void {
    resetForm();
    viewMode.value = 'edit';
}

function startEditGoal(goal: SavingsGoalConfig): void {
    resetForm(goal);
    viewMode.value = 'edit';
}

function cancelEdit(): void {
    cleanupUnusedSessionUploads();
    viewMode.value = 'list';
}

function closeDialog(): void {
    cleanupUnusedSessionUploads();
    showState.value = false;
}

function isAccountSelected(accountId: string): boolean {
    return form.linkedAccountIds.includes(accountId);
}

function toggleSingleAccount(accountId: string, checked: boolean): void {
    const next = new Set(form.linkedAccountIds);
    if (checked) {
        next.add(accountId);
    } else {
        next.delete(accountId);
    }
    form.linkedAccountIds = Array.from(next);
}

function isAllSubAccountsSelected(account: Account): boolean {
    const subs = getVisibleAssetSubAccounts(account);
    if (!subs.length) {
        return false;
    }
    if (form.linkedAccountIds.includes(account.id)) {
        return true;
    }
    return subs.every(sub => form.linkedAccountIds.includes(sub.id));
}

function isSomeSubAccountsSelected(account: Account): boolean {
    const subs = getVisibleAssetSubAccounts(account);
    if (!subs.length || isAllSubAccountsSelected(account)) {
        return false;
    }
    return subs.some(sub => form.linkedAccountIds.includes(sub.id));
}

function toggleParentAccount(account: Account, checked: boolean): void {
    const subs = getVisibleAssetSubAccounts(account);
    const next = new Set(form.linkedAccountIds);
    next.delete(account.id);
    for (const sub of subs) {
        if (checked) {
            next.add(sub.id);
        } else {
            next.delete(sub.id);
        }
    }
    form.linkedAccountIds = Array.from(next);
}

function saveGoal(): void {
    if (!canSave.value) {
        return;
    }

    const updatedGoal: SavingsGoalConfig = {
        id: form.id || createSavingsGoalId(),
        name: form.name.trim(),
        targetAmount: parseBigDecimal(Math.max(0, Math.trunc(form.targetAmount))).toString(),
        currency: form.currency || defaultCurrency.value,
        mode: form.mode,
        linkedAccountIds: form.mode === 'accounts' ? [...form.linkedAccountIds] : [],
        manualSavedAmount: form.mode === 'manual' ? parseBigDecimal(Math.trunc(form.manualSavedAmount)).toString() : '0',
        monthlyContribution: form.monthlyContribution > 0 ? parseBigDecimal(Math.trunc(form.monthlyContribution)).toString() : undefined,
        targetDate: form.targetDate || undefined,
        coverImage: form.coverImage || undefined,
        color: form.color || undefined
    };

    const currentGoals = [...goals.value];
    const previousGoal = editingGoalId.value ? currentGoals.find(g => g.id === editingGoalId.value) : undefined;
    const replacedCover = previousGoal?.coverImage && previousGoal.coverImage !== updatedGoal.coverImage
        ? previousGoal.coverImage
        : undefined;

    if (editingGoalId.value) {
        const idx = currentGoals.findIndex(g => g.id === editingGoalId.value);
        if (idx >= 0) {
            currentGoals.splice(idx, 1, updatedGoal);
        } else {
            currentGoals.push(updatedGoal);
        }
    } else {
        currentGoals.push(updatedGoal);
    }

    settingsStore.setSavingsGoals(serializeSavingsGoals(currentGoals));

    sessionUploadedCovers.value = sessionUploadedCovers.value.filter(f => f !== updatedGoal.coverImage);
    cleanupUnusedSessionUploads();

    if (replacedCover && !currentGoals.some(g => g.coverImage === replacedCover)) {
        deleteOverviewCoverImage(replacedCover);
    }

    viewMode.value = 'list';
}

function confirmDeleteGoal(goal: SavingsGoalConfig): void {
    confirmDialog.value?.open('Are you sure you want to delete this savings goal?', {
        color: 'error'
    }).then(() => {
        const nextGoals = goals.value.filter(g => g.id !== goal.id);
        settingsStore.setSavingsGoals(serializeSavingsGoals(nextGoals));

        if (goal.coverImage && !nextGoals.some(g => g.coverImage === goal.coverImage)) {
            deleteOverviewCoverImage(goal.coverImage);
        }
    }).catch(() => {
        // cancelled
    });
}

function triggerCoverFilePicker(): void {
    const input = coverFileInput.value;
    if (input) {
        input.value = '';
        input.click();
    }
}

async function handleCoverFile(file: File): Promise<void> {
    uploadingCoverImage.value = true;
    try {
        const { fileName, objectUrl } = await uploadOverviewCoverImage(file);
        sessionUploadedCovers.value.push(fileName);
        form.coverImage = fileName;
        formCoverPreviewUrl.value = objectUrl;
    } catch (error) {
        desktopPageStore.addErrorToast(error as Error);
    } finally {
        uploadingCoverImage.value = false;
    }
}

function onCoverFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (file) {
        handleCoverFile(file);
    }
}

function onCoverFileDrop(event: DragEvent): void {
    isDraggingCover.value = false;
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
        handleCoverFile(file);
    }
}

function removeCoverImage(): void {
    form.coverImage = '';
    formCoverPreviewUrl.value = null;
}

function loadFormCoverPreview(): void {
    const fileName = form.coverImage;
    if (!fileName) {
        formCoverPreviewUrl.value = null;
        return;
    }

    formCoverPreviewUrl.value = getCachedOverviewCoverObjectUrl(fileName);
    const requested = fileName;
    getOverviewCoverObjectUrl(requested).then(url => {
        if (form.coverImage === requested) {
            formCoverPreviewUrl.value = url;
        }
    });
}

function cleanupUnusedSessionUploads(): void {
    const savedCovers = new Set(goals.value.map(g => g.coverImage).filter((c): c is string => !!c));
    for (const fileName of sessionUploadedCovers.value) {
        if (fileName && !savedCovers.has(fileName)) {
            deleteOverviewCoverImage(fileName);
        }
    }
    sessionUploadedCovers.value = [];
}

function loadListCoverUrls(): void {
    for (const goal of goals.value) {
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
}

watch(() => props.show, (opened) => {
    if (opened) {
        if (!accountsStore.allAccounts.length) {
            accountsStore.loadAllAccounts({ force: false }).catch(() => {});
        }
        loadListCoverUrls();
        if (props.startCreating) {
            startCreateGoal();
        } else {
            viewMode.value = 'list';
        }
    }
});

watch(goals, () => {
    if (props.show) {
        loadListCoverUrls();
    }
}, { immediate: true });
</script>

<style scoped>
.savings-goal-manage-thumb {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-primary));
    flex-shrink: 0;
}

.savings-goal-account-list {
    max-height: 220px;
    overflow-y: auto;
}

.savings-goal-cover-preview {
    position: relative;
    height: 92px;
    border-radius: 12px;
    border: 1px dashed rgba(var(--v-theme-on-surface), 0.24);
    background: rgba(var(--v-theme-on-surface), 0.04);
    overflow: hidden;
    display: flex;
    align-items: flex-end;
    padding: 12px 16px;
    transition: border-color 0.2s ease;
}

.savings-goal-cover-preview--dragging {
    border-color: rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
}

.savings-goal-cover-preview--has-image {
    border-style: solid;
    border-color: transparent;
    color: #ffffff;
}

.savings-goal-cover-preview__overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(12, 10, 24, 0.32) 0%, rgba(12, 10, 24, 0.78) 100%);
    pointer-events: none;
}

.savings-goal-cover-preview__content {
    position: relative;
    z-index: 1;
    width: 100%;
    min-width: 0;
}
</style>
