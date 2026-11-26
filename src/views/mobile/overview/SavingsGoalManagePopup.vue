<template>
    <f7-popup push swipe-to-close :opened="show" @popup:open="onPopupOpen" @popup:closed="onPopupClosed">
        <f7-page v-show="viewMode === 'list'">
            <f7-navbar>
                <f7-nav-left>
                    <f7-link popup-close icon-f7="xmark" :aria-label="tt('Close')"></f7-link>
                </f7-nav-left>
                <f7-nav-title :title="tt('Manage Goals')"></f7-nav-title>
                <f7-nav-right>
                    <f7-link icon-f7="plus" :aria-label="tt('Create Goal')" @click="startCreateGoal"></f7-link>
                </f7-nav-right>
            </f7-navbar>

            <f7-block class="text-align-center padding-vertical" v-if="!goals.length">
                <f7-icon f7="sparkles" size="40" color="primary"></f7-icon>
                <p class="margin-top-half margin-bottom">{{ tt('No savings goals yet') }}</p>
                <f7-button fill round @click="startCreateGoal">{{ tt('Create Goal') }}</f7-button>
            </f7-block>

            <f7-list strong inset dividers class="margin-top-half" v-else>
                <f7-list-item
                    link="#"
                    swipeout
                    :key="item.goal.id"
                    :title="item.goal.name"
                    :subtitle="`${item.goal.mode === 'accounts' ? tt('Linked Accounts') : tt('Manual')} · ${formatPercentToLocalizedNumerals(item.progress.rawPercent, 0, '<1')}`"
                    :after="formatGoalAmount(item.progress.targetAmount, item.currency, false)"
                    v-for="item in goalItems"
                    @click="startEditGoal(item.goal)"
                >
                    <template #media>
                        <div class="savings-goal-mobile-thumb" :style="getThumbStyle(item.goal)">
                            <f7-icon f7="money_dollar_circle_fill" size="18" v-if="!coverUrls[item.goal.id]"></f7-icon>
                        </div>
                    </template>
                    <f7-swipeout-actions right>
                        <f7-swipeout-button color="red" @click="confirmDeleteGoal(item.goal)">
                            {{ tt('Delete') }}
                        </f7-swipeout-button>
                    </f7-swipeout-actions>
                </f7-list-item>
            </f7-list>
        </f7-page>

        <f7-page v-show="viewMode === 'edit'">
            <f7-navbar>
                <f7-nav-left>
                    <f7-link icon-f7="chevron_left" :class="{ 'disabled': uploadingCoverImage }"
                             :aria-label="tt('Back')" @click="cancelEdit"></f7-link>
                </f7-nav-left>
                <f7-nav-title :title="editingGoalId ? tt('Edit Goal') : tt('Create Goal')"></f7-nav-title>
                <f7-nav-right>
                    <f7-link icon-f7="checkmark_alt" :class="{ 'disabled': !canSave || uploadingCoverImage }"
                             :aria-label="tt('Save')" @click="saveGoal"></f7-link>
                </f7-nav-right>
            </f7-navbar>

            <f7-list strong inset dividers class="margin-top-half">
                <f7-list-input
                    type="text"
                    clear-button
                    autocomplete="off"
                    :label="tt('Name')"
                    :placeholder="tt('e.g. Emergency Fund')"
                    :value="form.name"
                    @input="form.name = $event.target.value"
                ></f7-list-input>

                <f7-list-item
                    link="#"
                    no-chevron
                    :title="tt('Target Amount')"
                    :after="formatNumericAmount(form.targetAmount, form.currency)"
                    @click="openNumberPad('targetAmount')"
                ></f7-list-item>

                <f7-list-item
                    link="#"
                    :title="tt('Currency')"
                    :after="getCurrencyDisplayName(form.currency)"
                    @click="showCurrencyPopup = true"
                ></f7-list-item>
            </f7-list>

            <f7-block-title>{{ tt('Tracking Mode') }}</f7-block-title>
            <f7-block class="no-margin-vertical">
                <f7-segmented strong round>
                    <f7-button round :active="form.mode === 'accounts'" @click="form.mode = 'accounts'">
                        {{ tt('Link Existing Accounts') }}
                    </f7-button>
                    <f7-button round :active="form.mode === 'manual'" @click="form.mode = 'manual'">
                        {{ tt('Manual Progress') }}
                    </f7-button>
                </f7-segmented>
            </f7-block>

            <f7-list strong inset dividers class="margin-top">
                <f7-list-item
                    link="#"
                    :title="tt('Linked Accounts')"
                    :after="`${form.linkedAccountIds.length} ${tt('Selected')}`"
                    v-if="form.mode === 'accounts'"
                    @click="viewMode = 'accounts'"
                ></f7-list-item>

                <f7-list-item
                    link="#"
                    no-chevron
                    :title="tt('Current Saved Amount')"
                    :after="formatNumericAmount(form.manualSavedAmount, form.currency)"
                    v-else
                    @click="openNumberPad('manualSavedAmount')"
                ></f7-list-item>
            </f7-list>

            <f7-list strong inset dividers>
                <f7-list-item
                    link="#"
                    no-chevron
                    :title="tt('Target Date')"
                    :after="form.targetDate ? formatGregorianTextualYearMonthDayToLongDate(form.targetDate) : tt('Unspecified')"
                    @click="showDateSheet = true"
                ></f7-list-item>

                <f7-list-item
                    link="#"
                    no-chevron
                    :title="tt('Monthly Contribution')"
                    :after="form.monthlyContribution > 0 ? formatNumericAmount(form.monthlyContribution, form.currency) : tt('Unspecified')"
                    @click="openNumberPad('monthlyContribution')"
                ></f7-list-item>

                <f7-list-item
                    link="#"
                    no-chevron
                    :title="tt('Color')"
                    @click="showColorSheet = true"
                >
                    <template #after>
                        <ItemIcon icon-type="fixed-f7" icon-id="app_fill" :color="form.color"></ItemIcon>
                    </template>
                </f7-list-item>

                <f7-list-item>
                    <div class="mobile-goal-cover-setting">
                        <div class="mobile-goal-cover-setting__label">{{ tt('Custom Cover Image') }}</div>

                        <div class="mobile-goal-cover-preview"
                             :class="{ 'mobile-goal-cover-preview--has-image': !!formCoverPreviewUrl }"
                             :style="formCoverPreviewStyle">
                            <div class="mobile-goal-cover-preview__overlay" v-if="formCoverPreviewUrl"></div>
                            <div class="mobile-goal-cover-preview__content">
                                <div class="mobile-goal-cover-preview__title">
                                    {{ form.name.trim() || tt('Savings Goal') }}
                                </div>
                                <div class="mobile-goal-cover-preview__sub" v-if="!formCoverPreviewUrl">
                                    {{ tt('No custom cover image set') }}
                                </div>
                            </div>
                        </div>

                        <input ref="coverFileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                               style="display: none" @change="onCoverFileSelected" />

                        <div class="mobile-goal-cover-setting__actions">
                            <f7-button fill round small :preloader="true" :loading="uploadingCoverImage"
                                       @click="triggerCoverFilePicker">
                                {{ form.coverImage ? tt('Change Image') : tt('Upload Image') }}
                            </f7-button>
                            <f7-button outline round small color="red" :disabled="uploadingCoverImage"
                                       v-if="form.coverImage" @click="removeCoverImage">
                                {{ tt('Remove Image') }}
                            </f7-button>
                        </div>
                    </div>
                </f7-list-item>
            </f7-list>

            <f7-block class="margin-top" v-if="editingGoalId">
                <f7-button fill round color="red" @click="deleteCurrentEditingGoal">
                    {{ tt('Delete') }}
                </f7-button>
            </f7-block>
        </f7-page>

        <f7-page v-show="viewMode === 'accounts'">
            <f7-navbar>
                <f7-nav-left>
                    <f7-link icon-f7="chevron_left" :aria-label="tt('Back')" @click="viewMode = 'edit'"></f7-link>
                </f7-nav-left>
                <f7-nav-title :title="tt('Linked Accounts')"></f7-nav-title>
                <f7-nav-right>
                    <f7-link icon-f7="checkmark_alt" :aria-label="tt('Done')" @click="viewMode = 'edit'"></f7-link>
                </f7-nav-right>
            </f7-navbar>

            <f7-list strong inset dividers class="margin-top-half" v-if="visibleAssetAccounts.length">
                <template :key="account.id" v-for="account in visibleAssetAccounts">
                    <f7-list-item
                        checkbox
                        :title="account.name"
                        :after="formatAccountBalance(account)"
                        :checked="isAccountSelected(account.id)"
                        v-if="account.type === AccountType.SingleAccount.type"
                        @change="toggleSingleAccount(account.id, $event.target.checked)"
                    >
                        <template #media>
                            <ItemIcon :icon-type="getAccountIconType(account.iconType)" :icon-id="account.icon" :color="account.color" />
                        </template>
                    </f7-list-item>

                    <f7-list-item
                        checkbox
                        class="has-child-list-item"
                        :title="account.name"
                        :checked="isAllSubAccountsSelected(account)"
                        :indeterminate="isSomeSubAccountsSelected(account)"
                        v-else-if="account.type === AccountType.MultiSubAccounts.type && getVisibleAssetSubAccounts(account).length"
                        @change="toggleParentAccount(account, $event.target.checked)"
                    >
                        <template #media>
                            <ItemIcon :icon-type="getAccountIconType(account.iconType)" :icon-id="account.icon" :color="account.color" />
                        </template>
                        <template #root>
                            <ul class="padding-inline-start">
                                <f7-list-item
                                    checkbox
                                    :key="subAccount.id"
                                    :title="subAccount.name"
                                    :after="formatAccountBalance(subAccount)"
                                    :checked="isAccountSelected(subAccount.id)"
                                    v-for="subAccount in getVisibleAssetSubAccounts(account)"
                                    @change="toggleSingleAccount(subAccount.id, $event.target.checked)"
                                />
                            </ul>
                        </template>
                    </f7-list-item>
                </template>
            </f7-list>

            <f7-list strong inset dividers class="margin-top-half" v-else>
                <f7-list-item :title="tt('No available asset accounts')"></f7-list-item>
            </f7-list>
        </f7-page>

        <number-pad-sheet
            :min-value="activeNumberField === 'manualSavedAmount' ? TRANSACTION_MIN_AMOUNT : 0"
            :max-value="TRANSACTION_MAX_AMOUNT"
            :currency="form.currency"
            :hint="activeNumberPadHint"
            v-model:show="showNumberPadSheet"
            v-model="activeNumberPadValue"
            @update:model-value="onNumberPadConfirm"
        />

        <date-selection-sheet
            v-model:show="showDateSheet"
            v-model="form.targetDate"
        />

        <color-selection-sheet
            :all-system-color-infos="ALL_ACCOUNT_COLORS"
            v-model:show="showColorSheet"
            v-model="form.color"
        />

        <list-item-selection-popup
            :title="tt('Currency')"
            :items="allCurrencies"
            value-type="item"
            key-field="currencyCode"
            value-field="currencyCode"
            title-field="displayName"
            after-field="currencyCode"
            :enable-filter="true"
            :filter-placeholder="tt('Find currency')"
            :filter-no-items-text="tt('No results')"
            v-model:show="showCurrencyPopup"
            v-model="form.currency"
        />
    </f7-popup>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, useTemplateRef } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { useI18nUIComponents } from '@/lib/ui/mobile.ts';

import { useSettingsStore } from '@/stores/setting.ts';
import { useUserStore } from '@/stores/user.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useExchangeRatesStore } from '@/stores/exchangeRates.ts';

import type { BigDecimal } from '@/core/numeral.ts';
import type { LocalizedCurrencyInfo } from '@/core/currency.ts';
import type { TextualYearMonthDay } from '@/core/datetime.ts';
import { AccountType } from '@/core/account.ts';
import { ALL_ACCOUNT_COLORS } from '@/consts/color.ts';
import { DISPLAY_HIDDEN_AMOUNT, INCOMPLETE_AMOUNT_SUFFIX } from '@/consts/numeral.ts';
import { TRANSACTION_MIN_AMOUNT, TRANSACTION_MAX_AMOUNT } from '@/consts/transaction.ts';
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

type NumberPadTargetField = 'targetAmount' | 'manualSavedAmount' | 'monthlyContribution';

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
    getAllCurrencies,
    formatAmountToLocalizedNumeralsWithCurrency,
    formatPercentToLocalizedNumerals,
    formatGregorianTextualYearMonthDayToLongDate
} = useI18n();
const { showConfirm, showToast } = useI18nUIComponents();

const settingsStore = useSettingsStore();
const userStore = useUserStore();
const accountsStore = useAccountsStore();
const exchangeRatesStore = useExchangeRatesStore();

const coverFileInput = useTemplateRef<HTMLInputElement>('coverFileInput');

const viewMode = ref<'list' | 'edit' | 'accounts'>('list');
const editingGoalId = ref<string | null>(null);
const uploadingCoverImage = ref<boolean>(false);
const formCoverPreviewUrl = ref<string | null>(null);
const sessionUploadedCovers = ref<string[]>([]);
const coverUrls = ref<Record<string, string | null>>({});

const showNumberPadSheet = ref<boolean>(false);
const activeNumberField = ref<NumberPadTargetField>('targetAmount');
const activeNumberPadValue = ref<number>(0);
const showDateSheet = ref<boolean>(false);
const showColorSheet = ref<boolean>(false);
const showCurrencyPopup = ref<boolean>(false);

const defaultCurrency = computed<string>(() => userStore.currentUserDefaultCurrency);
const showAmountInHomePage = computed<boolean>(() => settingsStore.appSettings.showAmountInHomePage);
const defaultGoalColor = computed<string>(() => ALL_ACCOUNT_COLORS[11] || '2196f3');
const allCurrencies = computed<LocalizedCurrencyInfo[]>(() => getAllCurrencies());

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

const canSave = computed<boolean>(() => {
    return form.name.trim().length > 0 && form.targetAmount > 0 && form.currency.trim().length > 0;
});

const activeNumberPadHint = computed<string>(() => {
    if (activeNumberField.value === 'targetAmount') {
        return tt('Target Amount');
    } else if (activeNumberField.value === 'manualSavedAmount') {
        return tt('Current Saved Amount');
    }
    return tt('Monthly Contribution');
});

const formCoverPreviewStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {};
    if (formCoverPreviewUrl.value) {
        style['background-image'] = `url("${formCoverPreviewUrl.value}")`;
        style['background-size'] = 'cover';
        style['background-position'] = 'center center';
    }
    return style;
});

function getVisibleAssetSubAccounts(account: Account): Account[] {
    if (!account.subAccounts) {
        return [];
    }
    return account.subAccounts.filter(sub => !sub.hidden && sub.isAsset);
}

function getCurrencyDisplayName(currencyCode: string): string {
    const found = allCurrencies.value.find(c => c.currencyCode === currencyCode);
    return found ? `${found.displayName} (${found.currencyCode})` : currencyCode;
}

function getThumbStyle(goal: SavingsGoalConfig): Record<string, string> {
    const url = coverUrls.value[goal.id];
    if (url) {
        return {
            'background-image': `url("${url}")`,
            'background-size': 'cover',
            'background-position': 'center center'
        };
    }
    if (goal.color) {
        return {
            'background-color': `#${goal.color}22`,
            'color': `#${goal.color}`
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

function formatNumericAmount(amount: number, currency: string): string {
    return formatAmountToLocalizedNumeralsWithCurrency(parseBigDecimal(amount), currency);
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

function openNumberPad(field: NumberPadTargetField): void {
    activeNumberField.value = field;
    activeNumberPadValue.value = form[field];
    showNumberPadSheet.value = true;
}

function onNumberPadConfirm(value: number): void {
    form[activeNumberField.value] = value;
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
    showConfirm('Are you sure you want to delete this savings goal?', () => {
        const nextGoals = goals.value.filter(g => g.id !== goal.id);
        settingsStore.setSavingsGoals(serializeSavingsGoals(nextGoals));

        if (goal.coverImage && !nextGoals.some(g => g.coverImage === goal.coverImage)) {
            deleteOverviewCoverImage(goal.coverImage);
        }

        if (viewMode.value === 'edit' && editingGoalId.value === goal.id) {
            viewMode.value = 'list';
        }
    });
}

function deleteCurrentEditingGoal(): void {
    const goal = goals.value.find(g => g.id === editingGoalId.value);
    if (goal) {
        confirmDeleteGoal(goal);
    }
}

function triggerCoverFilePicker(): void {
    const input = coverFileInput.value;
    if (input) {
        input.value = '';
        input.click();
    }
}

async function onCoverFileSelected(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) {
        return;
    }

    uploadingCoverImage.value = true;
    try {
        const { fileName, objectUrl } = await uploadOverviewCoverImage(file);
        sessionUploadedCovers.value.push(fileName);
        form.coverImage = fileName;
        formCoverPreviewUrl.value = objectUrl;
    } catch (error) {
        const err = error as { message?: string };
        showToast(err?.message || String(error));
    } finally {
        uploadingCoverImage.value = false;
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

function onPopupOpen(): void {
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

function onPopupClosed(): void {
    cleanupUnusedSessionUploads();
    emit('update:show', false);
}

watch(goals, () => {
    if (props.show) {
        loadListCoverUrls();
    }
});
</script>

<style scoped>
.savings-goal-mobile-thumb {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(var(--f7-theme-color-rgb, 33, 150, 243), 0.12);
    color: var(--f7-theme-color);
    flex-shrink: 0;
}

.mobile-goal-cover-setting {
    width: 100%;
    padding: 6px 0;
}

.mobile-goal-cover-setting__label {
    font-size: var(--f7-label-font-size);
    color: var(--f7-label-text-color);
    margin-bottom: 8px;
}

.mobile-goal-cover-preview {
    position: relative;
    height: 84px;
    border-radius: 12px;
    overflow: hidden;
    background: var(--f7-list-bg-color);
    border: 1px dashed var(--f7-list-item-border-color);
    display: flex;
    align-items: flex-end;
    padding: 10px 14px;
}

.mobile-goal-cover-preview--has-image {
    border-style: solid;
    border-color: transparent;
    color: #ffffff;
}

.mobile-goal-cover-preview__overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(12, 10, 24, 0.35) 0%, rgba(12, 10, 24, 0.78) 100%);
    pointer-events: none;
    z-index: 0;
}

.mobile-goal-cover-preview__content {
    position: relative;
    z-index: 1;
    width: 100%;
    min-width: 0;
}

.mobile-goal-cover-preview__title {
    font-size: 1rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mobile-goal-cover-preview__sub {
    font-size: 0.78rem;
    opacity: 0.75;
    margin-top: 2px;
}

.mobile-goal-cover-setting__actions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
}
</style>
