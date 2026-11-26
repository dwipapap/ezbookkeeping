<template>
    <f7-popup push swipe-to-close :opened="show" @popup:open="onPopupOpen" @popup:closed="onPopupClosed">
        <f7-page v-show="!showCategoryPicker">
            <f7-navbar>
                <f7-nav-left>
                    <f7-link popup-close icon-f7="xmark" :aria-label="tt('Cancel')"></f7-link>
                </f7-nav-left>
                <f7-nav-title :title="tt('Manage Budgets')"></f7-nav-title>
                <f7-nav-right>
                    <f7-link icon-f7="checkmark_alt" :class="{ 'disabled': !isAllValid }" :aria-label="tt('Save')" @click="save"></f7-link>
                </f7-nav-right>
            </f7-navbar>

            <f7-block-title>{{ tt('Add Budget') }}</f7-block-title>
            <f7-list strong inset dividers class="margin-top-half">
                <f7-list-item link="#" :title="tt('Category')" @click="openCategoryPicker">
                    <template #after>
                        <div class="display-flex align-items-center" v-if="selectedNewCategory">
                            <ItemIcon class="margin-right-half"
                                      :icon-type="getCategoryIconType(selectedNewCategory.iconType)"
                                      :icon-id="selectedNewCategory.icon"
                                      :color="selectedNewCategory.color" />
                            <span>{{ selectedNewCategoryDisplayName }}</span>
                        </div>
                        <span class="text-color-gray" v-else>{{ tt('Select Category') }}</span>
                    </template>
                </f7-list-item>
                <f7-list-item link="#" no-chevron :title="tt('Monthly Limit')" @click="openNumberPadForNew">
                    <template #after>
                        <span :class="{ 'text-color-gray': newLimitAmount <= 0 }">
                            {{ newLimitAmount > 0 ? formatAmount(newLimitAmount) : tt('Tap to enter') }}
                        </span>
                    </template>
                </f7-list-item>
                <f7-list-item>
                    <div class="width-100">
                        <f7-button fill round :disabled="!canAddBudget" @click="addBudget">
                            {{ tt('Add') }}
                        </f7-button>
                    </div>
                </f7-list-item>
            </f7-list>

            <f7-block-title>{{ tt('Configured Budgets') }} ({{ draftBudgets.length }})</f7-block-title>
            <f7-list strong inset dividers class="margin-top-half">
                <f7-list-item :title="tt('No category budgets set')" v-if="!draftBudgets.length"></f7-list-item>
                <f7-list-item link="#" no-chevron
                              :key="item.categoryId"
                              v-for="item in draftBudgets"
                              @click="openNumberPadForItem(item)">
                    <template #media>
                        <ItemIcon :icon-type="getCategoryIconType(getCategoryInfo(item.categoryId)?.iconType)"
                                  :icon-id="getCategoryInfo(item.categoryId)?.icon ?? ''"
                                  :color="getCategoryInfo(item.categoryId)?.color" />
                    </template>
                    <template #title>
                        <span>{{ getCategoryDisplayName(item.categoryId) }}</span>
                    </template>
                    <template #footer>
                        <small class="text-color-gray">{{ getCategorySubtitle(item.categoryId) }}</small>
                    </template>
                    <template #after>
                        <div class="display-flex align-items-center">
                            <span class="margin-right-half">{{ formatAmount(item.limitAmount) }}</span>
                            <f7-link icon-f7="trash" color="red" :aria-label="tt('Delete')"
                                     @click.stop="removeBudget(item.categoryId)"></f7-link>
                        </div>
                    </template>
                </f7-list-item>
            </f7-list>

            <f7-block-footer class="padding-horizontal margin-bottom">
                {{ tt('Category budgets are synced automatically when App Cloud Sync is enabled.') }}
            </f7-block-footer>
        </f7-page>

        <f7-page v-if="showCategoryPicker">
            <f7-navbar>
                <f7-nav-left>
                    <f7-link icon-f7="chevron_left" :aria-label="tt('Back')" @click="showCategoryPicker = false"></f7-link>
                </f7-nav-left>
                <f7-nav-title :title="tt('Select Category')"></f7-nav-title>
                <f7-subnavbar :inner="false">
                    <f7-searchbar custom-search
                                  :value="categoryFilterQuery"
                                  :placeholder="tt('Find category')"
                                  :disable-button="false"
                                  @input="categoryFilterQuery = $event.target.value"
                                  @searchbar:clear="categoryFilterQuery = ''"></f7-searchbar>
                </f7-subnavbar>
            </f7-navbar>

            <f7-list strong inset dividers class="margin-top-half">
                <f7-list-item :title="tt('No available category')" v-if="!filteredExpenseCategoryOptions.length"></f7-list-item>
                <f7-list-item link="#" no-chevron
                              :class="{ 'padding-left': !option.isPrimary, 'disabled': configuredCategoryIdSet.has(option.id) }"
                              :key="option.id"
                              v-for="option in filteredExpenseCategoryOptions"
                              @click="selectCategory(option)">
                    <template #media>
                        <ItemIcon :class="{ 'margin-left': !option.isPrimary }"
                                  :icon-type="getCategoryIconType(option.iconType)"
                                  :icon-id="option.icon"
                                  :color="option.color" />
                    </template>
                    <template #title>
                        <span>{{ option.name }}</span>
                    </template>
                    <template #after>
                        <small class="text-color-gray" v-if="configuredCategoryIdSet.has(option.id)">{{ tt('Added') }}</small>
                        <small class="text-color-gray" v-else-if="option.isPrimary">{{ tt('Primary Category') }}</small>
                    </template>
                </f7-list-item>
            </f7-list>
        </f7-page>

        <number-pad-sheet :min-value="1"
                          :max-value="TRANSACTION_MAX_AMOUNT"
                          :currency="defaultCurrency"
                          v-model:show="showNumberPad"
                          v-model="numberPadAmount"
                          @update:model-value="onNumberPadConfirm" />
    </f7-popup>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { useI18nUIComponents } from '@/lib/ui/mobile.ts';

import { useSettingsStore } from '@/stores/setting.ts';
import { useUserStore } from '@/stores/user.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';

import { CategoryType } from '@/core/category.ts';
import { TRANSACTION_MAX_AMOUNT } from '@/consts/transaction.ts';
import type { TransactionCategory } from '@/models/transaction_category.ts';

import { getCategoryIconType } from '@/lib/icon.ts';
import { parseBigDecimal } from '@/lib/numeral.ts';
import {
    parseCategoryMonthlyBudgets,
    serializeCategoryMonthlyBudgets
} from '@/lib/category_budget.ts';

interface DraftBudgetItem {
    categoryId: string;
    limitAmount: number;
}

interface ExpenseCategoryOption {
    id: string;
    name: string;
    icon: string;
    iconType: number;
    color: string;
    isPrimary: boolean;
    parentName: string;
    searchText: string;
}

defineProps<{
    show: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:show', value: boolean): void;
}>();

const { tt, formatAmountToLocalizedNumeralsWithCurrency } = useI18n();
const { showToast } = useI18nUIComponents();

const settingsStore = useSettingsStore();
const userStore = useUserStore();
const categoriesStore = useTransactionCategoriesStore();

const draftBudgets = ref<DraftBudgetItem[]>([]);
const newCategoryId = ref<string | null>(null);
const newLimitAmount = ref<number>(0);

const showCategoryPicker = ref<boolean>(false);
const categoryFilterQuery = ref<string>('');

const showNumberPad = ref<boolean>(false);
const numberPadTarget = ref<'new' | string | null>(null);
const numberPadAmount = ref<number>(0);

const defaultCurrency = computed<string>(() => userStore.currentUserDefaultCurrency);
const categoriesMap = computed<Record<string, TransactionCategory>>(() => categoriesStore.allTransactionCategoriesMap);

const configuredCategoryIdSet = computed<Set<string>>(() => {
    return new Set(draftBudgets.value.map(item => item.categoryId));
});

const expenseCategoryOptions = computed<ExpenseCategoryOption[]>(() => {
    const primaryCategories = categoriesStore.allTransactionCategories[CategoryType.Expense] ?? [];
    const options: ExpenseCategoryOption[] = [];

    for (const primary of primaryCategories) {
        if (primary.hidden) {
            continue;
        }

        options.push({
            id: primary.id,
            name: primary.name,
            icon: primary.icon,
            iconType: primary.iconType,
            color: primary.color,
            isPrimary: true,
            parentName: '',
            searchText: primary.name.toLowerCase()
        });

        for (const sub of primary.subCategories ?? []) {
            if (sub.hidden) {
                continue;
            }

            options.push({
                id: sub.id,
                name: sub.name,
                icon: sub.icon,
                iconType: sub.iconType,
                color: sub.color,
                isPrimary: false,
                parentName: primary.name,
                searchText: `${primary.name} ${sub.name}`.toLowerCase()
            });
        }
    }

    return options;
});

const filteredExpenseCategoryOptions = computed<ExpenseCategoryOption[]>(() => {
    const q = categoryFilterQuery.value.trim().toLowerCase();

    if (!q) {
        return expenseCategoryOptions.value;
    }

    return expenseCategoryOptions.value.filter(option => option.searchText.includes(q));
});

const selectedNewCategory = computed<TransactionCategory | undefined>(() => {
    return newCategoryId.value ? categoriesMap.value[newCategoryId.value] : undefined;
});

const selectedNewCategoryDisplayName = computed<string>(() => {
    const cat = selectedNewCategory.value;

    if (!cat) {
        return '';
    }

    if (cat.parentId && cat.parentId !== '0') {
        const parent = categoriesMap.value[cat.parentId];
        return parent ? `${parent.name} - ${cat.name}` : cat.name;
    }

    return cat.name;
});

const canAddBudget = computed<boolean>(() => {
    return !!newCategoryId.value && newLimitAmount.value > 0 && !configuredCategoryIdSet.value.has(newCategoryId.value);
});

const isAllValid = computed<boolean>(() => {
    return draftBudgets.value.every(item => Number.isFinite(item.limitAmount) && item.limitAmount > 0);
});

function formatAmount(amount: number): string {
    return formatAmountToLocalizedNumeralsWithCurrency(parseBigDecimal(amount), defaultCurrency.value);
}

function getCategoryInfo(categoryId: string): TransactionCategory | undefined {
    return categoriesMap.value[categoryId];
}

function getCategoryDisplayName(categoryId: string): string {
    return getCategoryInfo(categoryId)?.name ?? tt('Unknown Category');
}

function getCategorySubtitle(categoryId: string): string {
    const cat = getCategoryInfo(categoryId);

    if (!cat) {
        return '';
    }

    if (!cat.parentId || cat.parentId === '0') {
        return tt('Includes all subcategories');
    }

    const parent = getCategoryInfo(cat.parentId);
    return parent ? parent.name : tt('Secondary Category');
}

function onPopupOpen(): void {
    categoriesStore.loadAllCategories({ force: false });

    const parsed = parseCategoryMonthlyBudgets(settingsStore.appSettings.categoryMonthlyBudgets);
    draftBudgets.value = parsed
        .filter(item => {
            const cat = categoriesMap.value[item.categoryId];
            return !cat || cat.type === CategoryType.Expense;
        })
        .map(item => ({
            categoryId: item.categoryId,
            limitAmount: Math.trunc(parseBigDecimal(item.monthlyLimit).toDoubleNumber())
        }));

    newCategoryId.value = null;
    newLimitAmount.value = 0;
    showCategoryPicker.value = false;
    categoryFilterQuery.value = '';
}

function onPopupClosed(): void {
    showCategoryPicker.value = false;
    showNumberPad.value = false;
    emit('update:show', false);
}

function openCategoryPicker(): void {
    categoryFilterQuery.value = '';
    showCategoryPicker.value = true;
}

function selectCategory(option: ExpenseCategoryOption): void {
    if (configuredCategoryIdSet.value.has(option.id)) {
        return;
    }

    newCategoryId.value = option.id;
    showCategoryPicker.value = false;
}

function openNumberPadForNew(): void {
    numberPadTarget.value = 'new';
    numberPadAmount.value = newLimitAmount.value;
    showNumberPad.value = true;
}

function openNumberPadForItem(item: DraftBudgetItem): void {
    numberPadTarget.value = item.categoryId;
    numberPadAmount.value = item.limitAmount;
    showNumberPad.value = true;
}

function onNumberPadConfirm(value: number): void {
    if (value <= 0) {
        showToast('Budget limit must be greater than zero');
        return;
    }

    if (numberPadTarget.value === 'new') {
        newLimitAmount.value = Math.trunc(value);
    } else if (numberPadTarget.value) {
        const targetItem = draftBudgets.value.find(item => item.categoryId === numberPadTarget.value);

        if (targetItem) {
            targetItem.limitAmount = Math.trunc(value);
        }
    }
}

function addBudget(): void {
    if (!canAddBudget.value || !newCategoryId.value) {
        return;
    }

    draftBudgets.value.push({
        categoryId: newCategoryId.value,
        limitAmount: Math.trunc(newLimitAmount.value)
    });

    newCategoryId.value = null;
    newLimitAmount.value = 0;
}

function removeBudget(categoryId: string): void {
    draftBudgets.value = draftBudgets.value.filter(item => item.categoryId !== categoryId);
}

function save(): void {
    if (!isAllValid.value) {
        return;
    }

    const serialized = serializeCategoryMonthlyBudgets(
        draftBudgets.value.map(item => ({
            categoryId: item.categoryId,
            monthlyLimit: Math.trunc(item.limitAmount).toString()
        }))
    );

    settingsStore.setCategoryMonthlyBudgets(serialized);
    showToast('Category budgets updated');
    emit('update:show', false);
}
</script>
