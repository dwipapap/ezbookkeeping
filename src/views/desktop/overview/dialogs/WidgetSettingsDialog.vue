<template>
    <v-dialog width="600" v-model="showState">
        <one-column-dialog-layout :title="tt('Widget Settings')" :cancel-button-title="tt('Cancel')"
                                  @cancel="cancel">
            <template #toolbar>
                <v-btn class="mx-2" density="comfortable" variant="outlined" :disabled="uploadingCoverImage" @click="confirm">{{ tt('Apply') }}</v-btn>
            </template>

            <template #content>
                <div class="mt-1">
                    <template :key="`${setting.settingName}-${index}`" v-for="(setting, index) in supportsSettings">
                        <v-select :class="{ 'mt-4': index > 0 }" item-title="name" item-value="value"
                                  :label="tt(setting.displayName)" :items="getItemCountOptions(setting.itemCountValues)"
                                  :model-value="getSettingValue(setting.settingName)"
                                  @update:model-value="updateSettingValue(setting, $event)"
                                  v-if="setting.settingType === 'itemCountSelect' && (!setting.condition || setting.condition(widget?.settings))" />

                        <v-select :class="{ 'mt-4': index > 0 }" item-title="name" item-value="value"
                                  :label="tt(setting.displayName)" :items="getMonthOptions(setting.monthValues)"
                                  :model-value="getSettingValue(setting.settingName)"
                                  @update:model-value="updateSettingValue(setting, $event)"
                                  v-else-if="setting.settingType === 'monthSelect' && (!setting.condition || setting.condition(widget?.settings))" />

                        <v-text-field class="always-cursor-pointer text-field-truncate"
                                      :class="{ 'mt-4': index > 0 }"
                                      item-title="displayName"
                                      item-value="type"
                                      persistent-placeholder
                                      :readonly="true"
                                      :disabled="loading"
                                      :label="tt(setting.displayName)"
                                      :placeholder="tt('Default')"
                                      :model-value="getFilteredAccountsDisplayContent(setting)"
                                      @click="currentSettingItem = setting; showFilterAccountsDialog = true"
                                      v-else-if="setting.settingType === 'accountSelect' && (!setting.condition || setting.condition(widget?.settings))" />

                        <v-text-field class="always-cursor-pointer text-field-truncate"
                                      :class="{ 'mt-4': index > 0 }"
                                      item-title="displayName"
                                      item-value="type"
                                      persistent-placeholder
                                      :readonly="true"
                                      :disabled="loading"
                                      :label="tt(setting.displayName)"
                                      :placeholder="tt('Default')"
                                      :model-value="getFilteredTransactionCategoriesDisplayContent(setting)"
                                      @click="currentSettingItem = setting; showFilterTransactionCategoriesDialog = true"
                                      v-else-if="setting.settingType === 'categorySelect' && (!setting.condition || setting.condition(widget?.settings))" />

                        <v-text-field class="always-cursor-pointer text-field-truncate"
                                      :class="{ 'mt-4': index > 0 }"
                                      item-title="displayName"
                                      item-value="type"
                                      persistent-placeholder
                                      :readonly="true"
                                      :disabled="loading"
                                      :label="tt(setting.displayName)"
                                      :placeholder="tt('Default')"
                                      :model-value="getSettingValue(setting.settingName) ? tt('Custom') : tt('Default')"
                                      @click="currentSettingItem = setting; showFilterTransactionTagsDialog = true"
                                      v-else-if="setting.settingType === 'tagSelect' && (!setting.condition || setting.condition(widget?.settings))" />

                        <v-select :class="{ 'mt-4': index > 0 }" item-title="name" item-value="value"
                                  :label="tt(setting.displayName)" :items="getCustomSelectOptions(setting)"
                                  :multiple="setting.multiple" :chips="setting.multiple" :closable-chips="setting.multiple"
                                  :model-value="getCustomSelectModelValue(setting)"
                                  @update:model-value="updateSettingValue(setting, $event)"
                                  v-else-if="setting.settingType === 'customSelect' && (!setting.condition || setting.condition(widget?.settings))">
                            <template #item="{ props, internalItem }">
                                <v-list-item :disabled="internalItem.raw.disabled?.(widget?.settings, widgetSettingsContext) ?? false" v-bind="props">
                                    <template #title>
                                        <div class="text-truncate">{{ internalItem.raw.name }}</div>
                                    </template>
                                </v-list-item>
                            </template>
                        </v-select>

                        <v-switch :class="{ 'mt-2': index > 0 && (supportsSettings[index - 1]?.settingType !== 'switch' || (supportsSettings[index - 1]?.condition && !supportsSettings[index - 1]?.condition?.(widget?.settings))) }"
                                  :label="tt(setting.displayName)"
                                  :model-value="getSettingValue(setting.settingName)"
                                  @update:model-value="updateSettingValue(setting, $event)"
                                  v-else-if="setting.settingType === 'switch' && (!setting.condition || setting.condition(widget?.settings))" />

                        <amount-input :class="{ 'mt-4': index > 0 }" :label="tt(setting.displayName)"
                                      :currency="defaultCurrency" :show-currency="false"
                                      :model-value="getSettingValue(setting.settingName) as number || 0"
                                      @update:model-value="updateSettingValue(setting, $event)"
                                      v-else-if="setting.settingType === 'amount' && (!setting.condition || setting.condition(widget?.settings))" />

                        <amount-filter-input :class="{ 'mt-4': index > 0 }" :label="tt(setting.displayName)"
                                             :model-value="getSettingValue(setting.settingName) as string || ''"
                                             @update:model-value="updateSettingValue(setting, $event)"
                                             v-else-if="setting.settingType === 'amountFilter' && (!setting.condition || setting.condition(widget?.settings))" />

                        <v-text-field autocomplete="off" :class="{ 'mt-4': index > 0 }" :label="tt(setting.displayName)"
                                      :placeholder="setting.placeholder ? tt(setting.placeholder) : undefined"
                                      :persistent-placeholder="!!setting.placeholder"
                                      :model-value="getSettingValue(setting.settingName)"
                                      @update:model-value="updateSettingValue(setting, $event)"
                                      v-else-if="setting.settingType === 'textbox' && (!setting.condition || setting.condition(widget?.settings))" />

                        <div :class="{ 'mt-4': index > 0 }"
                             v-else-if="setting.settingType === 'backgroundImage' && (!setting.condition || setting.condition(widget?.settings))">
                            <div class="text-body-medium font-weight-medium mb-2">{{ tt(setting.displayName) }}</div>

                            <div class="overview-cover-preview"
                                 :class="{
                                     'overview-cover-preview--has-image': !!coverPreviewUrl,
                                     'overview-cover-preview--dark-text': coverPreviewIsDarkText,
                                     'overview-cover-preview--dragging': isDraggingCover
                                 }"
                                 :style="coverPreviewCardStyle"
                                 @dragover.prevent="isDraggingCover = true"
                                 @dragleave.prevent="isDraggingCover = false"
                                 @drop.prevent="onCoverFileDrop($event, setting)">
                                <div class="overview-cover-preview__overlay" :style="coverPreviewOverlayStyle" v-if="coverPreviewUrl"></div>
                                <div class="overview-cover-preview__content">
                                    <div class="text-title-medium font-weight-bold">
                                        {{ previewMonthTitle }} · <span class="overview-cover-preview__muted">{{ tt('Expense') }}</span>
                                    </div>
                                    <div class="text-headline-small font-weight-bold mt-1">Rp 0</div>
                                    <div class="overview-cover-preview__pill mt-2">{{ tt('Monthly income') }} Rp 0</div>
                                    <div class="text-body-small overview-cover-preview__muted mt-2" v-if="!coverPreviewUrl">
                                        {{ tt('No custom background image set') }}
                                    </div>
                                </div>
                            </div>

                            <input ref="coverFileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                                   class="d-none" @change="onCoverFileSelected($event, setting)" />

                            <div class="d-flex align-center ga-2 mt-3">
                                <v-btn color="primary" variant="tonal" size="small" :loading="uploadingCoverImage"
                                       @click="triggerCoverFilePicker">
                                    {{ getSettingValue(setting.settingName) ? tt('Change Image') : tt('Upload Image') }}
                                </v-btn>
                                <v-btn color="error" variant="text" size="small" :disabled="uploadingCoverImage"
                                       v-if="getSettingValue(setting.settingName)"
                                       @click="removeCoverImage(setting)">
                                    {{ tt('Remove Image') }}
                                </v-btn>
                            </div>
                        </div>

                        <div :class="{ 'mt-4': index > 0 }"
                             v-else-if="setting.settingType === 'slider' && (!setting.condition || setting.condition(widget?.settings))">
                            <div class="d-flex justify-space-between align-center mb-1">
                                <span class="text-body-medium">{{ tt(setting.displayName) }}</span>
                                <span class="text-body-small text-medium-emphasis">{{ getSliderValue(setting) }}{{ setting.unit ?? '' }}</span>
                            </div>
                            <v-slider color="primary" density="compact" hide-details
                                      :min="setting.min" :max="setting.max" :step="setting.step"
                                      :model-value="getSliderValue(setting)"
                                      @update:model-value="updateSettingValue(setting, Math.round($event))" />
                        </div>
                    </template>
                </div>

                <div class="text-body-large text-medium-emphasis text-center" v-if="widget && !supportsSettings.length">{{ tt('This widget has no configurable parameters') }}</div>
            </template>
        </one-column-dialog-layout>

        <account-filter-settings-dialog type="custom"
                                        :selected-account-ids="(currentSettingItem?.settingType === 'accountSelect' && currentSettingItem?.settingName && isArray(getSettingValue(currentSettingItem.settingName))) ? getSettingValue(currentSettingItem.settingName) as string[] : []"
                                        :disable-hidden-account="(currentSettingItem?.settingType === 'accountSelect') ? (currentSettingItem?.disableHiddenAccounts ?? false) : false"
                                        v-model:show="showFilterAccountsDialog"
                                        @settings:change="updateAccountValue"/>

        <category-filter-settings-dialog type="custom"
                                         :selected-category-ids="(currentSettingItem?.settingType === 'categorySelect' && currentSettingItem?.settingName && isArray(getSettingValue(currentSettingItem.settingName))) ? getSettingValue(currentSettingItem.settingName) as string[] : []"
                                         v-model:show="showFilterTransactionCategoriesDialog"
                                         @settings:change="updateCategoryValue"/>

        <transaction-tag-filter-settings-dialog type="custom"
                                                :tag-filter="(currentSettingItem?.settingType === 'tagSelect' && currentSettingItem?.settingName && isString(getSettingValue(currentSettingItem.settingName))) ? getSettingValue(currentSettingItem.settingName) as string : ''"
                                                v-model:show="showFilterTransactionTagsDialog"
                                                @settings:change="updateTagValue"/>
    </v-dialog>
</template>

<script setup lang="ts">
import AccountFilterSettingsDialog from '@/views/desktop/common/dialogs/AccountFilterSettingsDialog.vue';
import CategoryFilterSettingsDialog from '@/views/desktop/common/dialogs/CategoryFilterSettingsDialog.vue';
import TransactionTagFilterSettingsDialog from '@/views/desktop/common/dialogs/TransactionTagFilterSettingsDialog.vue';

import { ref, computed, useTemplateRef } from 'vue';

import { useI18n } from '@/locales/helpers.ts';

import { useUserStore } from '@/stores/user.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';
import { useTransactionTagsStore } from '@/stores/transactionTag.ts';
import { useDesktopPageStore } from '@/stores/desktopPage.ts';

import { type NameNumeralValue, values } from '@/core/base.ts';
import { AccountType } from '@/core/account.ts';
import {
    type OverviewWidgetSettingValue,
    type OverviewWidgetCustomSelectSettingValue,
    type OverviewWidgetCustomSelectSettingItem,
    type OverviewWidgetSliderSettingItem,
    type OverviewWidgetSettingItem,
    type OverviewWidgetSettingContext,
    type DesktopOverviewWidgetLayout
} from '@/core/overview_layout.ts';

import { DESKTOP_OVERVIEW_WIDGET_DEFINITIONS } from '@/consts/overview_layout.ts';

import { isDefined, isArray, isString, isInteger, isObjectEmpty, arrayItemToObjectField } from '@/lib/common.ts';
import { cloneWidget, getOverviewWidgetSettingContext } from '@/lib/overview_layout.ts';
import {
    DEFAULT_OVERVIEW_COVER_POSITION_Y,
    DEFAULT_OVERVIEW_COVER_OVERLAY_OPACITY,
    DEFAULT_OVERVIEW_COVER_TEXT_COLOR,
    getCachedOverviewCoverObjectUrl,
    getOverviewCoverObjectUrl,
    uploadOverviewCoverImage,
    deleteOverviewCoverImage,
    buildOverviewCoverOverlayGradient
} from '@/lib/overview_cover.ts';

const {
    tt,
    joinMultiText,
    formatNumberToLocalizedNumerals,
    getTablePageOptions,
    getAllLongMonthNames
} = useI18n();

const userStore = useUserStore();
const accountsStore = useAccountsStore();
const transactionCategoriesStore = useTransactionCategoriesStore();
const transactionTagsStore = useTransactionTagsStore();
const desktopPageStore = useDesktopPageStore();

const coverFileInput = useTemplateRef<HTMLInputElement[]>('coverFileInput');

let resolveFunc: ((widget: DesktopOverviewWidgetLayout) => void) | null = null;
let rejectFunc: ((reason?: unknown) => void) | null = null;

const showState = ref<boolean>(false);
const loading = ref<boolean>(false);
const uploadingCoverImage = ref<boolean>(false);
const isDraggingCover = ref<boolean>(false);
const coverPreviewUrl = ref<string | null>(null);
const sessionUploadedCovers = ref<string[]>([]);
const widget = ref<DesktopOverviewWidgetLayout | null>(null);
const currentSettingItem = ref<OverviewWidgetSettingItem | undefined>(undefined);
const showFilterAccountsDialog = ref<boolean>(false);
const showFilterTransactionCategoriesDialog = ref<boolean>(false);
const showFilterTransactionTagsDialog = ref<boolean>(false);

const defaultCurrency = computed<string>(() => userStore.currentUserDefaultCurrency);
const hasAnyAccount = computed<boolean>(() => accountsStore.allPlainAccounts.length > 0);
const hasAnyTransactionCategory = computed<boolean>(() => !isObjectEmpty(transactionCategoriesStore.allTransactionCategoriesMap));

const supportsSettings = computed<OverviewWidgetSettingItem[]>(() => widget.value ? DESKTOP_OVERVIEW_WIDGET_DEFINITIONS[widget.value.type]?.supportsSettings ?? [] : []);
const widgetSettingsContext = computed<OverviewWidgetSettingContext>(() => getOverviewWidgetSettingContext());
const previewMonthTitle = computed<string>(() => getAllLongMonthNames()[new Date().getMonth()] || 'Month');

const coverPreviewIsDarkText = computed<boolean>(() => {
    const color = widget.value?.settings['backgroundImageTextColor'];
    return (isString(color) ? color : DEFAULT_OVERVIEW_COVER_TEXT_COLOR) === 'dark';
});

const coverPreviewCardStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {};

    if (!coverPreviewUrl.value) {
        return style;
    }

    const posY = isInteger(widget.value?.settings['backgroundImagePositionY'])
        ? widget.value.settings['backgroundImagePositionY'] as number
        : DEFAULT_OVERVIEW_COVER_POSITION_Y;

    style['backgroundImage'] = `url("${coverPreviewUrl.value}")`;
    style['backgroundSize'] = 'cover';
    style['backgroundRepeat'] = 'no-repeat';
    style['backgroundPosition'] = `center ${posY}%`;
    return style;
});

const coverPreviewOverlayStyle = computed<Record<string, string>>(() => {
    const opacity = isInteger(widget.value?.settings['backgroundImageOverlayOpacity'])
        ? widget.value.settings['backgroundImageOverlayOpacity'] as number
        : DEFAULT_OVERVIEW_COVER_OVERLAY_OPACITY;
    const textColor = isString(widget.value?.settings['backgroundImageTextColor'])
        ? widget.value.settings['backgroundImageTextColor'] as string
        : DEFAULT_OVERVIEW_COVER_TEXT_COLOR;

    return {
        background: buildOverviewCoverOverlayGradient(opacity, textColor)
    };
});

function getItemCountOptions(values: number[]): NameNumeralValue[] {
    return getTablePageOptions(values, undefined, false, true);
}

function getMonthOptions(values: number[]): NameNumeralValue[] {
    return values.map(value => ({
        name: tt('format.misc.nMonths', { n: formatNumberToLocalizedNumerals(value) }),
        value: value
    }));
}

function getCustomSelectOptions(setting: OverviewWidgetCustomSelectSettingItem): OverviewWidgetCustomSelectSettingValue[] {
    return setting.selectValues.map(item => ({
        name: tt(item.name),
        value: item.value,
        disabled: item.disabled
    }));
}

function getCustomSelectModelValue(setting: OverviewWidgetCustomSelectSettingItem): OverviewWidgetSettingValue | undefined {
    const val = getSettingValue(setting.settingName);
    if (!isDefined(val) && setting.settingName === 'backgroundImageTextColor') {
        return DEFAULT_OVERVIEW_COVER_TEXT_COLOR;
    }
    return val;
}

function getSliderValue(setting: OverviewWidgetSliderSettingItem): number {
    const val = getSettingValue(setting.settingName);
    return isInteger(val) ? val : setting.defaultValue;
}

function getSettingValue(settingName: string): OverviewWidgetSettingValue | undefined {
    return widget.value?.settings[settingName];
}

function updateSettingValue(setting: OverviewWidgetSettingItem, value: OverviewWidgetSettingValue | null): void {
    if (!widget.value || value === null) {
        return;
    }

    if (setting.settingType === 'accountSelect' || setting.settingType === 'categorySelect') {
        if (isDefined(value) && isArray(value)) {
            widget.value.settings[setting.settingName] = value;
        } else {
            widget.value.settings[setting.settingName] = [];
        }
    } else if (setting.settingType === 'customSelect' && setting.multiple && isDefined(setting.allValue) && isArray(value)) {
        const previousValue = widget.value.settings[setting.settingName];
        const previousValues = isArray(previousValue) ? previousValue : [];
        const allValue = setting.allValue as number;

        if (value.includes(allValue) && !previousValues.includes(allValue)) {
            widget.value.settings[setting.settingName] = [allValue];
        } else {
            const selectedValues = value.filter(item => item !== allValue);
            widget.value.settings[setting.settingName] = selectedValues.length ? selectedValues : [allValue];
        }
    } else if (setting.settingType === 'customSelect' && setting.multiple && isArray(value)) {
        if (value.length >= (setting.minSelections ?? 0)) {
            widget.value.settings[setting.settingName] = value;
        }
    } else {
        widget.value.settings[setting.settingName] = value;
    }
}

function triggerCoverFilePicker(): void {
    const inputs = coverFileInput.value;
    const input = isArray(inputs) ? inputs[0] : (inputs as unknown as HTMLInputElement | null);
    if (input) {
        input.value = '';
        input.click();
    }
}

async function handleCoverFile(file: File, setting: OverviewWidgetSettingItem): Promise<void> {
    if (!widget.value) {
        return;
    }

    uploadingCoverImage.value = true;
    try {
        const { fileName, objectUrl } = await uploadOverviewCoverImage(file);
        sessionUploadedCovers.value.push(fileName);
        widget.value.settings[setting.settingName] = fileName;

        if (!isInteger(widget.value.settings['backgroundImagePositionY'])) {
            widget.value.settings['backgroundImagePositionY'] = DEFAULT_OVERVIEW_COVER_POSITION_Y;
        }
        if (!isInteger(widget.value.settings['backgroundImageOverlayOpacity'])) {
            widget.value.settings['backgroundImageOverlayOpacity'] = DEFAULT_OVERVIEW_COVER_OVERLAY_OPACITY;
        }
        if (!isString(widget.value.settings['backgroundImageTextColor'])) {
            widget.value.settings['backgroundImageTextColor'] = DEFAULT_OVERVIEW_COVER_TEXT_COLOR;
        }

        coverPreviewUrl.value = objectUrl;
    } catch (error) {
        desktopPageStore.addErrorToast(error as Error);
    } finally {
        uploadingCoverImage.value = false;
    }
}

function onCoverFileSelected(event: Event, setting: OverviewWidgetSettingItem): void {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (file) {
        handleCoverFile(file, setting);
    }
}

function onCoverFileDrop(event: DragEvent, setting: OverviewWidgetSettingItem): void {
    isDraggingCover.value = false;
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
        handleCoverFile(file, setting);
    }
}

function removeCoverImage(setting: OverviewWidgetSettingItem): void {
    if (!widget.value) {
        return;
    }

    delete widget.value.settings[setting.settingName];
    delete widget.value.settings['backgroundImagePositionY'];
    delete widget.value.settings['backgroundImageOverlayOpacity'];
    delete widget.value.settings['backgroundImageTextColor'];
    coverPreviewUrl.value = null;
}

function loadCoverPreview(): void {
    const fileName = widget.value?.settings['backgroundImage'];
    if (!isString(fileName) || !fileName) {
        coverPreviewUrl.value = null;
        return;
    }

    coverPreviewUrl.value = getCachedOverviewCoverObjectUrl(fileName);
    const requested = fileName;
    getOverviewCoverObjectUrl(requested).then(url => {
        if (widget.value?.settings['backgroundImage'] === requested) {
            coverPreviewUrl.value = url;
        }
    });
}

function getFilteredAccountsDisplayContent(setting: OverviewWidgetSettingItem): string {
    if ((loading.value && !hasAnyAccount.value) || !accountsStore.allVisiblePlainAccounts || !accountsStore.allVisiblePlainAccounts.length) {
        return '';
    }

    const settingValue = getSettingValue(setting.settingName) as string[] | undefined;

    if (!settingValue || !isArray(settingValue) || !settingValue.length) {
        return tt('All');
    }

    const filterAccountIds: Record<string, boolean> = arrayItemToObjectField(settingValue, true);

    let allAccountSelected = true;
    const selectedAccountNames: string[] = [];

    for (const account of accountsStore.allVisiblePlainAccounts) {
        if (account.type === AccountType.MultiSubAccounts.type) {
            continue;
        }

        if (!filterAccountIds[account.id]) {
            allAccountSelected = false;
        } else {
            selectedAccountNames.push(account.name);
        }
    }

    if (allAccountSelected) {
        return tt('All');
    } else if (selectedAccountNames.length < 1) {
        return '';
    }

    return joinMultiText(selectedAccountNames);
}

function getFilteredTransactionCategoriesDisplayContent(setting: OverviewWidgetSettingItem): string {
    if ((loading.value && !hasAnyTransactionCategory.value) || !transactionCategoriesStore.allTransactionCategoriesMap) {
        return '';
    }

    const settingValue = getSettingValue(setting.settingName) as string[] | undefined;

    if (!settingValue || !isArray(settingValue) || !settingValue.length) {
        return tt('All');
    }

    const filterTransactionCategoryIds: Record<string, boolean> = arrayItemToObjectField(settingValue, true);

    let allCategorySelected = true;
    const selectedCategoryNames: string[] = [];

    for (const transactionCategory of values(transactionCategoriesStore.allTransactionCategoriesMap)) {
        if (!transactionCategory.parentId || transactionCategory.parentId === '0') {
            continue;
        }

        if (!filterTransactionCategoryIds[transactionCategory.id]) {
            allCategorySelected = false;
        } else {
            selectedCategoryNames.push(transactionCategory.name);
        }
    }

    if (allCategorySelected) {
        return tt('All');
    } else if (selectedCategoryNames.length < 1) {
        return '';
    }

    return joinMultiText(selectedCategoryNames);
}

function updateAccountValue(changed: boolean, selectedAccountIds?: string[]): void {
    if (!changed || !currentSettingItem.value || currentSettingItem.value.settingType !== 'accountSelect') {
        showFilterAccountsDialog.value = false;
        return;
    }

    updateSettingValue(currentSettingItem.value, selectedAccountIds ?? []);
    currentSettingItem.value = undefined;
    showFilterAccountsDialog.value = false;
}

function updateCategoryValue(changed: boolean, selectedCategoryIds?: string[]): void {
    if (!changed || !currentSettingItem.value || currentSettingItem.value.settingType !== 'categorySelect') {
        showFilterTransactionCategoriesDialog.value = false;
        return;
    }

    updateSettingValue(currentSettingItem.value, selectedCategoryIds ?? []);
    currentSettingItem.value = undefined;
    showFilterTransactionCategoriesDialog.value = false;
}

function updateTagValue(changed: boolean, textualTagFilter?: string): void {
    if (!changed || !currentSettingItem.value || currentSettingItem.value.settingType !== 'tagSelect') {
        showFilterTransactionTagsDialog.value = false;
        return;
    }

    updateSettingValue(currentSettingItem.value, textualTagFilter ?? '');
    currentSettingItem.value = undefined;
    showFilterTransactionTagsDialog.value = false;
}

function cleanupUnusedSessionUploads(keepFileName?: string): void {
    for (const fileName of sessionUploadedCovers.value) {
        if (fileName && fileName !== keepFileName) {
            deleteOverviewCoverImage(fileName);
        }
    }
    sessionUploadedCovers.value = [];
}

function open(value: DesktopOverviewWidgetLayout): Promise<DesktopOverviewWidgetLayout> {
    widget.value = cloneWidget(value);
    sessionUploadedCovers.value = [];
    uploadingCoverImage.value = false;
    isDraggingCover.value = false;

    if (DESKTOP_OVERVIEW_WIDGET_DEFINITIONS[widget.value.type]) {
        const defaultSettings = DESKTOP_OVERVIEW_WIDGET_DEFINITIONS[widget.value.type]?.defaultSettings ?? {};
        widget.value.settings = { ...defaultSettings, ...widget.value.settings };
    }

    loadCoverPreview();
    showState.value = true;

    const promises: Promise<unknown>[] = [];

    if (supportsSettings.value.some(setting => setting.settingType === 'accountSelect')) {
        promises.push(accountsStore.loadAllAccounts({ force: false }));
    }

    if (supportsSettings.value.some(setting => setting.settingType === 'categorySelect')) {
        promises.push(transactionCategoriesStore.loadAllCategories({ force: false }));
    }

    if (supportsSettings.value.some(setting => setting.settingType === 'tagSelect')) {
        promises.push(transactionTagsStore.loadAllTags({ force: false }));
    }

    if (promises.length > 0) {
        loading.value = true;

        Promise.all(promises).then(() => {
            loading.value = false;
        }).catch(error => {
            loading.value = false;

            if (!error.processed) {
                desktopPageStore.addErrorToast(error);
            }
        });
    }

    return new Promise((resolve, reject) => {
        resolveFunc = resolve;
        rejectFunc = reject;
    });
}

function confirm(): void {
    if (!widget.value) {
        return;
    }

    const finalCover = widget.value.settings['backgroundImage'];
    cleanupUnusedSessionUploads(isString(finalCover) ? finalCover : undefined);
    resolveFunc?.(widget.value);
    showState.value = false;
}

function cancel(): void {
    cleanupUnusedSessionUploads(undefined);
    rejectFunc?.();
    showState.value = false;
}

defineExpose({
    open
});
</script>

<style scoped>
.overview-cover-preview {
    position: relative;
    height: 152px;
    border-radius: 16px;
    overflow: hidden;
    border: 1px dashed rgba(var(--v-theme-primary), 0.35);
    background: linear-gradient(145deg, rgba(var(--v-theme-primary), 0.12), rgba(var(--v-theme-primary), 0.04));
    display: flex;
    align-items: center;
    padding: 16px 20px;
    transition: border-color 150ms ease;
}

.overview-cover-preview--dragging {
    border-color: rgb(var(--v-theme-primary));
    border-width: 2px;
}

.overview-cover-preview--has-image {
    border-style: solid;
    border-color: rgba(255, 255, 255, 0.25);
    color: #ffffff;
}

.overview-cover-preview--has-image.overview-cover-preview--dark-text {
    color: #1c1c24;
    border-color: rgba(28, 28, 36, 0.14);
}

.overview-cover-preview__overlay {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
}

.overview-cover-preview__content {
    position: relative;
    z-index: 1;
}

.overview-cover-preview__muted {
    opacity: 0.78;
}

.overview-cover-preview__pill {
    display: inline-block;
    font-size: 0.75rem;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(var(--v-theme-surface), 0.75);
}

.overview-cover-preview--has-image:not(.overview-cover-preview--dark-text) .overview-cover-preview__pill {
    background: rgba(15, 13, 28, 0.48);
    color: #ffffff;
}

.overview-cover-preview--has-image.overview-cover-preview--dark-text .overview-cover-preview__pill {
    background: rgba(255, 255, 255, 0.78);
    color: #1c1c24;
}
</style>
