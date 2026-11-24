<template>
    <f7-popup push swipe-to-close :opened="show" @popup:open="onPopupOpen" @popup:closed="onPopupClosed">
        <f7-page v-show="!showFilterAccountsPopup && !showFilterCategoriesPopup && !showFilterTagsPopup && !showAmountFilterPopup">
            <f7-navbar>
                <f7-nav-left>
                    <f7-link popup-close icon-f7="xmark" :aria-label="tt('Cancel')"></f7-link>
                </f7-nav-left>
                <f7-nav-title :title="tt('Widget Settings')"></f7-nav-title>
                <f7-nav-right>
                    <f7-link icon-f7="checkmark_alt" :class="{ 'disabled': uploadingCoverImage }" :aria-label="tt('Apply')" @click="confirm"></f7-link>
                </f7-nav-right>
            </f7-navbar>

            <f7-list strong inset dividers class="settings-list margin-top-half" :class="{ 'disabled': loading }" >
                <template :key="`${setting.settingName}-${index}`" v-for="(setting, index) in supportsSettings">
                    <template v-if="setting.settingType === 'customSelect' && setting.multiple && (!setting.condition || setting.condition(widget?.settings))">
                        <f7-list-item group-title>
                            <small>{{ tt(setting.displayName) }}</small>
                        </f7-list-item>
                        <f7-list-item checkbox :key="`${setting.settingName}-${option.value}`"
                                      :title="tt(option.name)"
                                      :value="option.value"
                                      :checked="isMultipleValueSelected(setting, option.value)"
                                      :disabled="option.disabled?.(widget?.settings, widgetSettingsContext) || isLastSelectedMultipleValue(setting, option.value)"
                                      v-for="option in setting.selectValues"
                                      @change="updateMultipleValue(setting, option.value, $event.target.checked)"></f7-list-item>
                    </template>

                    <f7-list-item v-else-if="setting.settingType === 'switch' && (!setting.condition || setting.condition(widget?.settings))">
                        <template #after-title>
                            {{ tt(setting.displayName) }}
                        </template>
                        <template #after>
                            <f7-toggle :checked="getSettingValue(setting.settingName) as boolean"
                                       @toggle:change="updateSettingValue(setting.settingName, $event)"></f7-toggle>
                        </template>
                    </f7-list-item>

                    <f7-list-input readonly type="colorpicker" class="list-color-picker-input"
                                   :color-picker-params="{
                                       modules: ['sb-spectrum', 'hue-slider', 'hex'],
                                       hexLabel: false,
                                       hexValueEditable: true
                                   }"
                                   :value="{ hex: getDisplayColor(getSettingValue(setting.settingName) as string) }"
                                   @colorpicker:change="updateColorSettingValue(setting.settingName, $event)"
                                   v-else-if="setting.settingType === 'color' && (!setting.condition || setting.condition(widget?.settings))">
                        <template #inner-start>
                            <div class="item-actual-title">
                                <span>{{ tt(setting.displayName) }}</span>
                            </div>
                        </template>
                        <template #inner-end>
                            <div class="color-picker-display">
                                <ItemIcon icon-type="fixed-f7" icon-id="app_fill" :color="getSettingValue(setting.settingName)"></ItemIcon>
                                <f7-icon class="color-picker-chevron" f7="chevron_up_chevron_down"></f7-icon>
                            </div>
                        </template>
                    </f7-list-input>

                    <f7-list-input type="text"
                                   autocomplete="off"
                                   :label="tt(setting.displayName)"
                                   :placeholder="setting.placeholder ? tt(setting.placeholder) : undefined"
                                   :value="getSettingValue(setting.settingName) as string"
                                   @input="updateSettingValue(setting.settingName, $event.target.value)"
                                   v-else-if="setting.settingType === 'textbox' && (!setting.condition || setting.condition(widget?.settings))"></f7-list-input>

                    <f7-list-item v-else-if="setting.settingType === 'backgroundImage' && (!setting.condition || setting.condition(widget?.settings))">
                        <div class="mobile-cover-setting">
                            <div class="mobile-cover-setting__label">{{ tt(setting.displayName) }}</div>

                            <div class="mobile-cover-preview"
                                 :class="{
                                     'mobile-cover-preview--has-image': !!coverPreviewUrl,
                                     'mobile-cover-preview--dark-text': coverPreviewIsDarkText
                                 }"
                                 :style="coverPreviewCardStyle">
                                <div class="mobile-cover-preview__overlay" :style="coverPreviewOverlayStyle" v-if="coverPreviewUrl"></div>
                                <div class="mobile-cover-preview__content">
                                    <div class="mobile-cover-preview__title">
                                        {{ previewMonthTitle }} · {{ tt('Expense') }}
                                    </div>
                                    <div class="mobile-cover-preview__amount">Rp 0</div>
                                    <div class="mobile-cover-preview__sub">
                                        {{ coverPreviewUrl ? `${tt('Monthly income')} Rp 0` : tt('No custom background image set') }}
                                    </div>
                                </div>
                            </div>

                            <input ref="coverFileInput" type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                                   style="display: none" @change="onCoverFileSelected($event, setting)" />

                            <div class="mobile-cover-setting__actions">
                                <f7-button fill round small :preloader="true" :loading="uploadingCoverImage"
                                           @click="triggerCoverFilePicker">
                                    {{ getSettingValue(setting.settingName) ? tt('Change Image') : tt('Upload Image') }}
                                </f7-button>
                                <f7-button outline round small color="red" :disabled="uploadingCoverImage"
                                           v-if="getSettingValue(setting.settingName)"
                                           @click="removeCoverImage(setting)">
                                    {{ tt('Remove Image') }}
                                </f7-button>
                            </div>
                        </div>
                    </f7-list-item>

                    <f7-list-item v-else-if="setting.settingType === 'slider' && (!setting.condition || setting.condition(widget?.settings))">
                        <div class="mobile-slider-setting">
                            <div class="mobile-slider-setting__header">
                                <span>{{ tt(setting.displayName) }}</span>
                                <span class="mobile-slider-setting__value">{{ getSliderValue(setting) }}{{ setting.unit ?? '' }}</span>
                            </div>
                            <f7-range :min="setting.min" :max="setting.max" :step="setting.step"
                                      :value="getSliderValue(setting)"
                                      @range:change="updateSettingValue(setting.settingName, Math.round($event))" />
                        </div>
                    </f7-list-item>

                    <f7-list-item class="item-truncate-after-text"
                                  :class="{ 'up-down-chevron': setting.settingType !== 'accountSelect' && setting.settingType !== 'categorySelect' && setting.settingType !== 'tagSelect' && setting.settingType !== 'amount' && setting.settingType !== 'amountFilter' }"
                                  :no-chevron="setting.settingType === 'amount'"
                                  link="#" :disabled="isSettingDisabled(setting)"
                                  @click="openSettingSelection(setting, $event)"
                                  v-else-if="!setting.condition || setting.condition(widget?.settings)">
                        <template #after-title>
                            <div class="item-actual-title">
                                <span>{{ tt(setting.displayName) }}</span>
                            </div>
                        </template>
                        <template #after>
                            <f7-preloader v-if="loading && (setting.settingType === 'accountSelect' || setting.settingType === 'categorySelect' || setting.settingType === 'tagSelect') && (!setting.condition || setting.condition(widget?.settings))" />
                            <div v-else>{{ getSingleSettingDisplayName(setting) }}</div>
                        </template>
                    </f7-list-item>
                </template>
            </f7-list>

            <f7-popover class="widget-setting-selection-popover" @popover:open="onPopoverOpen">
                <f7-list dividers>
                    <f7-list-item link="#" no-chevron popover-close
                                  :title="option.name"
                                  :disabled="option.disabled?.(widget?.settings, widgetSettingsContext)"
                                  :class="{ 'list-item-selected': selectedSettingValue === option.value }"
                                  :key="option.value" v-for="option in selectedSettingOptions"
                                  @click="updateSelectedSettingValue(option.value)">
                        <template #after>
                            <f7-icon class="list-item-checked-icon" f7="checkmark_alt"
                                     v-if="selectedSettingValue === option.value"></f7-icon>
                        </template>
                    </f7-list-item>
                </f7-list>
            </f7-popover>
        </f7-page>

        <account-filter-settings-page disable-hidden-account
                                      v-model:custom-selected-account-ids="customSelectedAccountIds"
                                      @save="updateAccountValue"
                                      v-if="showFilterAccountsPopup" />

        <category-filter-settings-page v-model:custom-selected-category-ids="customSelectedCategoryIds"
                                       @save="updateCategoryValue"
                                       v-if="showFilterCategoriesPopup" />

        <transaction-tag-filter-settings-page v-model:custom-tag-filter="customTagFilter"
                                              @save="updateTagValue"
                                              v-if="showFilterTagsPopup" />

        <number-pad-sheet :min-value="TRANSACTION_MIN_AMOUNT"
                          :max-value="TRANSACTION_MAX_AMOUNT"
                          :currency="defaultCurrency"
                          v-model:show="showAmountSheet"
                          v-model="customAmountValue"
                          @update:model-value="updateAmountSettingValue" />

        <transaction-amount-filter-page show-all-option
                                        v-model:custom-amount-filter="customAmountFilter"
                                        @save="updateAmountValue"
                                        v-if="showAmountFilterPopup" />
    </f7-popup>
</template>

<script setup lang="ts">
import AccountFilterSettingsPage from '@/views/mobile/settings/AccountFilterSettingsPage.vue';
import CategoryFilterSettingsPage from '@/views/mobile/settings/CategoryFilterSettingsPage.vue';
import TransactionTagFilterSettingsPage from '@/views/mobile/settings/TransactionTagFilterSettingsPage.vue';
import TransactionAmountFilterPage from '@/views/mobile/transactions/AmountFilterPage.vue';

import { ref, computed, nextTick, useTemplateRef } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { type Framework7Dom, openPopover, useI18nUIComponents } from '@/lib/ui/mobile.ts';

import { useUserStore } from '@/stores/user.ts';
import { useAccountsStore } from '@/stores/account.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';
import { useTransactionTagsStore } from '@/stores/transactionTag.ts';

import { TRANSACTION_MIN_AMOUNT, TRANSACTION_MAX_AMOUNT } from '@/consts/transaction.ts';
import {
    type OverviewWidgetSettingValue,
    type OverviewWidgetCustomSelectSettingValue,
    type OverviewWidgetCustomSelectSettingItem,
    type OverviewWidgetSliderSettingItem,
    type OverviewWidgetSettingItem,
    type OverviewWidgetSettingContext,
    type MobileOverviewWidgetLayout
} from '@/core/overview_layout.ts';
import { MOBILE_OVERVIEW_WIDGET_DEFINITIONS } from '@/consts/overview_layout.ts';

import { isDefined, isArray, isString, isInteger, isObjectEmpty, arrayItemToObjectField } from '@/lib/common.ts';
import { parseBigDecimal } from '@/lib/numeral.ts';
import { getDisplayColor } from '@/lib/color.ts';
import { isAllAccountsChecked } from '@/lib/account.ts';
import { isAllCategoriesChecked } from '@/lib/category.ts';
import { cloneWidget, getOverviewWidgetSettingContext } from '@/lib/overview_layout.ts';
import { scrollToSelectedItem } from '@/lib/ui/common.ts';
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

const props = defineProps<{
    modelValue: MobileOverviewWidgetLayout | null;
    show: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: MobileOverviewWidgetLayout): void;
    (e: 'update:show', value: boolean): void;
}>();

const {
    tt,
    formatAmountToLocalizedNumerals,
    formatNumberToLocalizedNumerals,
    getTablePageOptions,
    getAllLongMonthNames
} = useI18n();
const { showToast } = useI18nUIComponents();

const userStore = useUserStore();
const accountsStore = useAccountsStore();
const transactionCategoriesStore = useTransactionCategoriesStore();
const transactionTagsStore = useTransactionTagsStore();

const coverFileInput = useTemplateRef<HTMLInputElement[]>('coverFileInput');

const loading = ref<boolean>(false);
const uploadingCoverImage = ref<boolean>(false);
const coverPreviewUrl = ref<string | null>(null);
const sessionUploadedCovers = ref<string[]>([]);
const didConfirm = ref<boolean>(false);
const widget = ref<MobileOverviewWidgetLayout | null>(null);
const currentSettingItem = ref<OverviewWidgetSettingItem | undefined>(undefined);
const showFilterAccountsPopup = ref<boolean>(false);
const showFilterCategoriesPopup = ref<boolean>(false);
const showFilterTagsPopup = ref<boolean>(false);
const showAmountSheet = ref<boolean>(false);
const showAmountFilterPopup = ref<boolean>(false);
const customSelectedAccountIds = ref<string[]>([]);
const customSelectedCategoryIds = ref<string[]>([]);
const customTagFilter = ref<string>('');
const customAmountValue = ref<number>(0);
const customAmountFilter = ref<string>('');

const defaultCurrency = computed<string>(() => userStore.currentUserDefaultCurrency);
const hasAnyAccount = computed<boolean>(() => accountsStore.allPlainAccounts.length > 0);
const hasAnyVisibleAccount = computed<boolean>(() => accountsStore.allVisibleAccountsCount > 0);
const hasAnyTransactionCategory = computed<boolean>(() => !isObjectEmpty(transactionCategoriesStore.allTransactionCategoriesMap));
const hasAnyAvailableTag = computed<boolean>(() => transactionTagsStore.allAvailableTagsCount > 0);

const supportsSettings = computed<OverviewWidgetSettingItem[]>(() => widget.value ? MOBILE_OVERVIEW_WIDGET_DEFINITIONS[widget.value.type]?.supportsSettings ?? [] : []);
const widgetSettingsContext = computed<OverviewWidgetSettingContext>(() => getOverviewWidgetSettingContext());
const selectedSettingOptions = computed<OverviewWidgetCustomSelectSettingValue[]>(() => currentSettingItem.value ? getSettingOptions(currentSettingItem.value) : []);
const selectedSettingValue = computed<OverviewWidgetSettingValue | undefined>(() => {
    if (!currentSettingItem.value) {
        return undefined;
    }
    const val = getSettingValue(currentSettingItem.value.settingName);
    if (!isDefined(val) && currentSettingItem.value.settingName === 'backgroundImageTextColor') {
        return DEFAULT_OVERVIEW_COVER_TEXT_COLOR;
    }
    return val;
});
const previewMonthTitle = computed<string>(() => getAllLongMonthNames()[new Date().getMonth()] || 'Month');

const coverPreviewIsDarkText = computed<boolean>(() => {
    const color = widget.value?.settings['backgroundImageTextColor'];
    return (isString(color) ? color : DEFAULT_OVERVIEW_COVER_TEXT_COLOR) === 'dark';
});

const coverPreviewCardStyle = computed<Record<string, string>>(() => {
    const fallbackBg = widget.value?.settings['lightBackgroundColor'];
    const style: Record<string, string> = {};

    if (isString(fallbackBg) && fallbackBg) {
        style['background-color'] = getDisplayColor(fallbackBg);
    }

    if (coverPreviewUrl.value) {
        const posY = isInteger(widget.value?.settings['backgroundImagePositionY'])
            ? widget.value.settings['backgroundImagePositionY'] as number
            : DEFAULT_OVERVIEW_COVER_POSITION_Y;

        style['background-image'] = `url("${coverPreviewUrl.value}")`;
        style['background-size'] = 'cover';
        style['background-repeat'] = 'no-repeat';
        style['background-position'] = `center ${posY}%`;
    }

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

function isSettingDisabled(setting: OverviewWidgetSettingItem): boolean {
    if (setting.settingType === 'accountSelect' && setting.disableHiddenAccounts) {
        return !hasAnyVisibleAccount.value;
    } else if (setting.settingType === 'accountSelect' && !setting.disableHiddenAccounts) {
        return !hasAnyAccount.value;
    } else if (setting.settingType === 'categorySelect') {
        return !hasAnyTransactionCategory.value;
    } else if (setting.settingType === 'tagSelect') {
        return !hasAnyAvailableTag.value;
    }

    return false;
}

function getSettingOptions(setting: OverviewWidgetSettingItem): OverviewWidgetCustomSelectSettingValue[] {
    if (setting.settingType === 'itemCountSelect') {
        return getTablePageOptions(setting.itemCountValues, undefined, false, true);
    } else if (setting.settingType === 'monthSelect') {
        return setting.monthValues.map(value => ({
            name: tt('format.misc.nMonths', { n: formatNumberToLocalizedNumerals(value) }),
            value: value
        }));
    } else if (setting.settingType === 'customSelect') {
        return setting.selectValues.map(option => ({
            name: tt(option.name),
            value: option.value,
            disabled: option.disabled
        }));
    }

    return [];
}

function getSliderValue(setting: OverviewWidgetSliderSettingItem): number {
    const val = getSettingValue(setting.settingName);
    return isInteger(val) ? val : setting.defaultValue;
}

function getSettingValue(settingName: string): OverviewWidgetSettingValue | undefined {
    return widget.value?.settings[settingName];
}

function updateSettingValue(settingName: string, value: OverviewWidgetSettingValue): void {
    if (widget.value) {
        widget.value.settings[settingName] = value;
    }
}

function updateColorSettingValue(settingName: string, value: { hex: string }): void {
    if (widget.value && value && value.hex) {
        widget.value.settings[settingName] = value.hex.replace(/^#/, '').substring(0, 6).toLowerCase();
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

async function onCoverFileSelected(event: Event, setting: OverviewWidgetSettingItem): Promise<void> {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file || !widget.value) {
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
        const err = error as { message?: string };
        showToast(err?.message || String(error));
    } finally {
        uploadingCoverImage.value = false;
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

function cleanupUnusedSessionUploads(keepFileName?: string): void {
    for (const fileName of sessionUploadedCovers.value) {
        if (fileName && fileName !== keepFileName) {
            deleteOverviewCoverImage(fileName);
        }
    }
    sessionUploadedCovers.value = [];
}

function getSingleSettingDisplayName(setting: OverviewWidgetSettingItem): string {
    let value = getSettingValue(setting.settingName);

    if (!isDefined(value) && setting.settingName === 'backgroundImageTextColor') {
        value = DEFAULT_OVERVIEW_COVER_TEXT_COLOR;
    }

    if (setting.settingType === 'accountSelect') {
        if (!isArray(value) || value.length < 1) {
            return tt('All');
        }

        return isAllAccountsChecked(accountsStore.allVisiblePlainAccounts, arrayItemToObjectField(value as string[], true)) ? tt('All') : tt('Partial');
    } else if (setting.settingType === 'categorySelect') {
        if (!isArray(value) || value.length < 1) {
            return tt('All');
        }

        return isAllCategoriesChecked(transactionCategoriesStore.allTransactionCategories, arrayItemToObjectField(value as string[], true)) ? tt('All') : tt('Partial');
    } else if (setting.settingType === 'tagSelect' || setting.settingType === 'amountFilter') {
        return value ? tt('Custom') : tt('All');
    } else if (setting.settingType === 'amount') {
        return formatAmountToLocalizedNumerals(parseBigDecimal(isInteger(value) ? value : 0), defaultCurrency.value);
    }

    return getSettingOptions(setting).find(option => option.value === value)?.name ?? '';
}

function isMultipleValueSelected(setting: OverviewWidgetCustomSelectSettingItem, value: string | number): boolean {
    const selectedValues = getSettingValue(setting.settingName);
    return isArray(selectedValues) && selectedValues.includes(value);
}

function isLastSelectedMultipleValue(setting: OverviewWidgetCustomSelectSettingItem, value: string | number): boolean {
    const selectedValues = getSettingValue(setting.settingName);
    return isArray(selectedValues) && selectedValues.length === 1 && selectedValues[0] === value;
}

function updateMultipleValue(setting: OverviewWidgetCustomSelectSettingItem, value: string | number, checked: boolean): void {
    const currentValue = getSettingValue(setting.settingName);
    const selectedValues = isArray(currentValue) ? [...currentValue] : [];
    const index = selectedValues.indexOf(value);

    if (checked && index < 0) {
        if (isDefined(setting.allValue) && value === setting.allValue) {
            updateSettingValue(setting.settingName, [value]);
            return;
        }

        selectedValues.push(value);
    } else if (!checked && index >= 0) {
        if (selectedValues.length <= 1) {
            return;
        }

        selectedValues.splice(index, 1);
    }

    if (isDefined(setting.allValue) && value !== setting.allValue) {
        const allValueIndex = selectedValues.indexOf(setting.allValue);

        if (allValueIndex >= 0) {
            selectedValues.splice(allValueIndex, 1);
        }
    }

    updateSettingValue(setting.settingName, selectedValues);
}

function openSettingSelection(setting: OverviewWidgetSettingItem, event: MouseEvent): void {
    if (loading.value) {
        return;
    }

    const value = getSettingValue(setting.settingName);
    currentSettingItem.value = setting;

    if (setting.settingType === 'accountSelect') {
        customSelectedAccountIds.value = isArray(value) ? [...value] as string[] : [];
        showFilterAccountsPopup.value = true;
    } else if (setting.settingType === 'categorySelect') {
        customSelectedCategoryIds.value = isArray(value) ? [...value] as string[] : [];
        showFilterCategoriesPopup.value = true;
    } else if (setting.settingType === 'tagSelect') {
        customTagFilter.value = isString(value) ? value : '';
        showFilterTagsPopup.value = true;
    } else if (setting.settingType === 'amount') {
        customAmountValue.value = isInteger(value) ? value : 0;
        showAmountSheet.value = true;
    } else if (setting.settingType === 'amountFilter') {
        customAmountFilter.value = isString(value) ? value : '';
        showAmountFilterPopup.value = true;
    } else {
        nextTick(() => {
            openPopover('.widget-setting-selection-popover', event.currentTarget as HTMLElement);
        });
    }
}

function updateSelectedSettingValue(value: string | number): void {
    if (currentSettingItem.value) {
        updateSettingValue(currentSettingItem.value.settingName, value);
    }
}

function updateAccountValue(): void {
    if (currentSettingItem.value && currentSettingItem.value.settingType === 'accountSelect') {
        updateSettingValue(currentSettingItem.value.settingName, customSelectedAccountIds.value);
    }

    currentSettingItem.value = undefined;
    customSelectedAccountIds.value = [];
    showFilterAccountsPopup.value = false;
}

function updateCategoryValue(): void {
    if (currentSettingItem.value && currentSettingItem.value.settingType === 'categorySelect') {
        updateSettingValue(currentSettingItem.value.settingName, customSelectedCategoryIds.value);
    }

    currentSettingItem.value = undefined;
    customSelectedCategoryIds.value = [];
    showFilterCategoriesPopup.value = false;
}

function updateTagValue(): void {
    if (currentSettingItem.value && currentSettingItem.value.settingType === 'tagSelect') {
        updateSettingValue(currentSettingItem.value.settingName, customTagFilter.value);
    }

    currentSettingItem.value = undefined;
    customTagFilter.value = '';
    showFilterTagsPopup.value = false;
}

function updateAmountSettingValue(value: number): void {
    if (currentSettingItem.value?.settingType === 'amount') {
        updateSettingValue(currentSettingItem.value.settingName, value);
    }

    currentSettingItem.value = undefined;
    customAmountValue.value = 0;
    showAmountSheet.value = false;
}

function updateAmountValue(): void {
    if (currentSettingItem.value && currentSettingItem.value.settingType === 'amountFilter') {
        updateSettingValue(currentSettingItem.value.settingName, customAmountFilter.value);
    }

    currentSettingItem.value = undefined;
    customAmountFilter.value = '';
    showAmountFilterPopup.value = false;
}

function confirm(): void {
    if (widget.value) {
        didConfirm.value = true;
        const finalCover = widget.value.settings['backgroundImage'];
        cleanupUnusedSessionUploads(isString(finalCover) ? finalCover : undefined);
        emit('update:modelValue', widget.value);
    }

    close();
}

function close(): void {
    emit('update:show', false);
}

function onPopoverOpen(event: { $el: Framework7Dom }): void {
    scrollToSelectedItem(event.$el[0], '.popover-inner', '.popover-inner', 'li.list-item-selected');
}

function onPopupOpen(): void {
    if (!props.modelValue) {
        close();
        return;
    }

    didConfirm.value = false;
    sessionUploadedCovers.value = [];
    uploadingCoverImage.value = false;
    widget.value = cloneWidget(props.modelValue);
    currentSettingItem.value = undefined;
    customSelectedAccountIds.value = [];
    customSelectedCategoryIds.value = [];
    customTagFilter.value = '';
    customAmountValue.value = 0;
    customAmountFilter.value = '';

    if (MOBILE_OVERVIEW_WIDGET_DEFINITIONS[widget.value.type]) {
        const defaultSettings = MOBILE_OVERVIEW_WIDGET_DEFINITIONS[widget.value.type]?.defaultSettings ?? {};
        widget.value.settings = { ...defaultSettings, ...widget.value.settings };
    }

    loadCoverPreview();

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
                showToast(error.message || error);
            }
        });
    }
}

function onPopupClosed(): void {
    if (!didConfirm.value) {
        cleanupUnusedSessionUploads(undefined);
    }

    widget.value = null;
    coverPreviewUrl.value = null;
    currentSettingItem.value = undefined;
    showFilterAccountsPopup.value = false;
    showFilterCategoriesPopup.value = false;
    showFilterTagsPopup.value = false;
    showAmountSheet.value = false;
    showAmountFilterPopup.value = false;
    customSelectedAccountIds.value = [];
    customSelectedCategoryIds.value = [];
    customTagFilter.value = '';
    customAmountValue.value = 0;
    customAmountFilter.value = '';
    close();
}
</script>

<style>
.widget-setting-selection-popover .popover-inner {
    max-height: 350px;
    overflow-y: auto;
}

.mobile-cover-setting {
    width: 100%;
    padding: 6px 0;
}

.mobile-cover-setting__label {
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 10px;
}

.mobile-cover-preview {
    position: relative;
    height: 136px;
    border-radius: 18px;
    overflow: hidden;
    padding: 16px;
    display: flex;
    align-items: flex-end;
    box-sizing: border-box;
    border: 1px solid rgba(15, 23, 42, 0.08);
    background-color: #e6e0fa;
}

.mobile-cover-preview--has-image {
    color: #ffffff;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}

.mobile-cover-preview--has-image.mobile-cover-preview--dark-text {
    color: #1c1c24;
    text-shadow: 0 1px 3px rgba(255, 255, 255, 0.45);
}

.mobile-cover-preview__overlay {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
}

.mobile-cover-preview__content {
    position: relative;
    z-index: 1;
}

.mobile-cover-preview__title {
    font-size: 14px;
    opacity: 0.85;
}

.mobile-cover-preview__amount {
    font-size: 22px;
    font-weight: 600;
    line-height: 1.25;
}

.mobile-cover-preview__sub {
    font-size: 12px;
    opacity: 0.8;
}

.mobile-cover-setting__actions {
    display: flex;
    gap: 10px;
    margin-top: 12px;
}

.mobile-cover-setting__actions .button {
    flex: 1 1 0;
}

.mobile-slider-setting {
    width: 100%;
    padding: 4px 0;
}

.mobile-slider-setting__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    font-size: 15px;
}

.mobile-slider-setting__value {
    opacity: 0.65;
    font-size: 14px;
}
</style>
