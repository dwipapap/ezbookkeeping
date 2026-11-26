<template>
    <v-dialog width="680" v-model="showState">
        <one-column-dialog-layout :title="tt('Manage Budgets')" :cancel-button-title="tt('Cancel')"
                                  @cancel="cancel">
            <template #content>
                <v-alert type="info" variant="tonal" density="compact" class="mb-4">
                    {{ tt('Category budgets are synced automatically when App Cloud Sync is enabled.') }}
                </v-alert>

                <div class="text-subtitle-2 font-weight-medium mb-2">{{ tt('Add Budget') }}</div>
                <v-row dense class="align-center mb-4">
                    <v-col cols="12" sm="6">
                        <v-autocomplete
                            v-model="newCategoryId"
                            :items="expenseCategoryOptions"
                            item-title="name"
                            item-value="id"
                            density="compact"
                            hide-details
                            clearable
                            :label="tt('Category')"
                            :placeholder="tt('Select Category')"
                            :no-data-text="tt('No available category')"
                            :custom-filter="filterCategoryOption"
                        >
                            <template #selection="{ internalItem }">
                                <div class="d-flex align-center text-truncate" v-if="internalItem.raw">
                                    <ItemIcon class="me-2 flex-shrink-0" size="20px"
                                              :icon-type="getCategoryIconType(internalItem.raw.iconType)"
                                              :icon-id="internalItem.raw.icon"
                                              :color="internalItem.raw.color" />
                                    <span class="text-truncate">
                                        {{ internalItem.raw.parentName ? `${internalItem.raw.parentName} - ${internalItem.raw.name}` : internalItem.raw.name }}
                                    </span>
                                </div>
                            </template>
                            <template #item="{ props: itemProps, internalItem }">
                                <v-list-item v-bind="itemProps"
                                             :class="{ 'ps-8': !internalItem.raw.isPrimary }"
                                             :disabled="configuredCategoryIdSet.has(internalItem.raw.id)">
                                    <template #prepend>
                                        <ItemIcon class="me-2" size="22px"
                                                  :icon-type="getCategoryIconType(internalItem.raw.iconType)"
                                                  :icon-id="internalItem.raw.icon"
                                                  :color="internalItem.raw.color" />
                                    </template>
                                    <template #title>
                                        <div class="d-flex align-center justify-space-between ga-2">
                                            <span class="text-truncate">{{ internalItem.raw.name }}</span>
                                            <span class="text-caption text-medium-emphasis flex-shrink-0"
                                                  v-if="configuredCategoryIdSet.has(internalItem.raw.id)">
                                                {{ tt('Added') }}
                                            </span>
                                            <span class="text-caption text-medium-emphasis flex-shrink-0"
                                                  v-else-if="internalItem.raw.isPrimary">
                                                {{ tt('Primary Category') }}
                                            </span>
                                        </div>
                                    </template>
                                </v-list-item>
                            </template>
                        </v-autocomplete>
                    </v-col>
                    <v-col cols="8" sm="4">
                        <amount-input
                            density="compact"
                            hide-details
                            :currency="defaultCurrency"
                            :show-currency="true"
                            :enable-formula="true"
                            :label="tt('Monthly Limit')"
                            v-model="newLimitAmount"
                        />
                    </v-col>
                    <v-col cols="4" sm="2">
                        <v-btn color="primary" variant="tonal" block
                               :disabled="!canAddBudget"
                               @click="addBudget">
                            {{ tt('Add') }}
                        </v-btn>
                    </v-col>
                </v-row>

                <v-divider class="mb-3" />

                <div class="text-subtitle-2 font-weight-medium mb-2">
                    {{ tt('Configured Budgets') }} ({{ draftBudgets.length }})
                </div>

                <div class="text-body-medium text-medium-emphasis text-center py-6" v-if="!draftBudgets.length">
                    {{ tt('No category budgets set') }}
                </div>

                <v-list density="compact" class="pa-0" v-else>
                    <template :key="item.categoryId" v-for="(item, idx) in draftBudgets">
                        <v-divider v-if="idx > 0" class="my-1" />
                        <v-list-item class="px-0 py-2">
                            <template #prepend>
                                <ItemIcon class="me-3" size="28px"
                                          :icon-type="getCategoryIconType(getCategoryInfo(item.categoryId)?.iconType)"
                                          :icon-id="getCategoryInfo(item.categoryId)?.icon ?? ''"
                                          :color="getCategoryInfo(item.categoryId)?.color" />
                            </template>

                            <v-list-item-title class="text-body-medium font-weight-medium text-truncate">
                                {{ getCategoryDisplayName(item.categoryId) }}
                            </v-list-item-title>
                            <v-list-item-subtitle class="text-caption">
                                {{ getCategorySubtitle(item.categoryId) }}
                            </v-list-item-subtitle>

                            <template #append>
                                <div class="d-flex align-center ga-2 ms-3">
                                    <div style="width: 170px;">
                                        <amount-input
                                            density="compact"
                                            hide-details
                                            :currency="defaultCurrency"
                                            :show-currency="true"
                                            :enable-formula="true"
                                            :enable-rules="true"
                                            v-model="item.limitAmount"
                                        />
                                    </div>
                                    <v-btn icon variant="text" color="error" density="comfortable"
                                           :aria-label="tt('Delete')"
                                           @click="removeBudget(item.categoryId)">
                                        <v-icon :icon="mdiDeleteOutline" size="20" />
                                    </v-btn>
                                </div>
                            </template>
                        </v-list-item>
                    </template>
                </v-list>
            </template>

            <template #footer>
                <v-btn color="secondary" variant="tonal" @click="cancel">{{ tt('Cancel') }}</v-btn>
                <v-spacer />
                <v-btn color="primary" :disabled="!isAllValid" @click="save">{{ tt('Save') }}</v-btn>
            </template>
        </one-column-dialog-layout>
    </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

import { useI18n } from '@/locales/helpers.ts';

import { useSettingsStore } from '@/stores/setting.ts';
import { useUserStore } from '@/stores/user.ts';
import { useTransactionCategoriesStore } from '@/stores/transactionCategory.ts';
import { useDesktopPageStore } from '@/stores/desktopPage.ts';

import { CategoryType } from '@/core/category.ts';
import type { TransactionCategory } from '@/models/transaction_category.ts';

import { getCategoryIconType } from '@/lib/icon.ts';
import { parseBigDecimal } from '@/lib/numeral.ts';
import {
    parseCategoryMonthlyBudgets,
    serializeCategoryMonthlyBudgets
} from '@/lib/category_budget.ts';

import {
    mdiDeleteOutline
} from '@mdi/js';

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

const { tt } = useI18n();

const settingsStore = useSettingsStore();
const userStore = useUserStore();
const categoriesStore = useTransactionCategoriesStore();
const desktopPageStore = useDesktopPageStore();

const showState = ref<boolean>(false);
const draftBudgets = ref<DraftBudgetItem[]>([]);
const newCategoryId = ref<string | null>(null);
const newLimitAmount = ref<number>(0);

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

const canAddBudget = computed<boolean>(() => {
    return !!newCategoryId.value && newLimitAmount.value > 0 && !configuredCategoryIdSet.value.has(newCategoryId.value);
});

const isAllValid = computed<boolean>(() => {
    return draftBudgets.value.every(item => Number.isFinite(item.limitAmount) && item.limitAmount > 0);
});

function filterCategoryOption(_value: string, query: string, item?: { raw?: ExpenseCategoryOption }): boolean {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
        return true;
    }

    return item?.raw?.searchText.includes(normalizedQuery) ?? false;
}

function getCategoryInfo(categoryId: string): TransactionCategory | undefined {
    return categoriesMap.value[categoryId];
}

function getCategoryDisplayName(categoryId: string): string {
    const category = getCategoryInfo(categoryId);

    if (!category) {
        return tt('Unknown Category');
    }

    return category.name;
}

function getCategorySubtitle(categoryId: string): string {
    const category = getCategoryInfo(categoryId);

    if (!category) {
        return '';
    }

    if (!category.parentId || category.parentId === '0') {
        return tt('Includes all subcategories');
    }

    const parent = getCategoryInfo(category.parentId);
    return parent ? parent.name : tt('Secondary Category');
}

function open(): void {
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
    showState.value = true;
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
    desktopPageStore.addToast('Category budgets updated');
    showState.value = false;
}

function cancel(): void {
    showState.value = false;
}

defineExpose({
    open
});
</script>
