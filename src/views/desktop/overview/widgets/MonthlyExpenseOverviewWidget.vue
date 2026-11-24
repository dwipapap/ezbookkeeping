<template>
    <v-card class="monthly-expense-widget h-100"
            :class="{
                'disabled': loading,
                'monthly-expense-widget--has-cover': hasCustomBackground,
                'monthly-expense-widget--cover-light-text': hasCustomBackground && !isDarkTextOnCover,
                'monthly-expense-widget--cover-dark-text': hasCustomBackground && isDarkTextOnCover
            }"
            :style="cardStyle">
        <div class="monthly-expense-widget__cover-overlay" :style="overlayStyle" v-if="hasCustomBackground"></div>

        <template #title>
            <div class="d-flex align-end monthly-expense-widget__title-row">
                <div class="d-flex align-baseline">
                    <span class="text-headline-small font-weight-bold">{{ displayDateRange?.thisMonth?.displayTime }}</span>
                    <span class="mx-1 text-title-large monthly-expense-widget__muted">·</span>
                    <span class="monthly-expense-widget__muted font-weight-bold text-title-small">{{ tt('Expense') }}</span>
                </div>
                <v-btn class="ms-2 monthly-expense-widget__action-btn" density="compact" :color="hasCustomBackground ? undefined : 'default'" variant="text"
                       :aria-label="tt('Refresh')" :icon="true" :loading="loading" @click="emit('refresh')">
                    <template #loader>
                        <v-progress-circular indeterminate size="20" />
                    </template>
                    <v-icon :icon="mdiRefresh" size="24" />
                    <v-tooltip activator="parent">{{ tt('Refresh') }}</v-tooltip>
                </v-btn>
            </div>
        </template>

        <v-card-text class="pt-2">
            <div class="monthly-expense-widget__content">
                <div class="mt-2 d-flex align-end">
                    <span class="text-headline-small font-weight-medium text-no-wrap monthly-expense-widget__expense-amount"
                          :class="{ 'text-primary': !hasCustomBackground }">
                        <span v-if="!loading || (transactionOverview && transactionOverview.thisMonth && transactionOverview.thisMonth.valid)">{{ transactionOverview && transactionOverview.thisMonth ? getDisplayExpenseAmount(transactionOverview.thisMonth) : '-' }}</span>
                        <v-skeleton-loader class="d-inline-block skeleton-no-margin mt-3 pb-1" width="120px" type="text" :loading="true" v-else-if="loading && (!transactionOverview || !transactionOverview.thisMonth || !transactionOverview.thisMonth.valid)"></v-skeleton-loader>
                    </span>
                    <v-btn class="ms-1 monthly-expense-widget__eye-btn" density="compact" :color="hasCustomBackground ? undefined : 'primary'" variant="text"
                           :aria-label="showAmountInHomePage ? tt('Hide Amount') : tt('Show Amount')"
                           :icon="true" @click="showAmountInHomePage = !showAmountInHomePage">
                        <v-icon :icon="showAmountInHomePage ? mdiEyeOffOutline : mdiEyeOutline" size="20" />
                    </v-btn>
                </div>

                <div class="monthly-expense-widget__income mt-2">
                    <span class="monthly-expense-widget__income-dot"></span>
                    <span class="monthly-expense-widget__income-label text-truncate">{{ tt('Monthly income') }}</span>
                    <span class="font-weight-bold text-body-medium text-truncate" v-if="!loading || (transactionOverview && transactionOverview.thisMonth && transactionOverview.thisMonth.valid)">{{ transactionOverview && transactionOverview.thisMonth ? getDisplayIncomeAmount(transactionOverview.thisMonth) : '-' }}</span>
                    <v-skeleton-loader class="d-inline-block skeleton-no-margin mt-1 pb-1" width="100px" type="text" :loading="true" v-else-if="loading && (!transactionOverview || !transactionOverview.thisMonth || !transactionOverview.thisMonth.valid)"></v-skeleton-loader>
                </div>

                <v-btn class="monthly-expense-widget__details mt-4" :variant="hasCustomBackground ? 'flat' : 'tonal'" :to="currentDetailsUrl">{{ tt('View Details') }}</v-btn>
            </div>

            <div class="monthly-expense-widget__illustration img-with-direction" aria-hidden="true" v-if="!hasCustomBackground">
                <svg viewBox="0 0 168 132" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle class="monthly-expense-widget__illustration-halo" cx="112" cy="73" r="52" />
                    <circle class="monthly-expense-widget__illustration-dot" cx="151" cy="25" r="4" />
                    <circle class="monthly-expense-widget__illustration-dot monthly-expense-widget__illustration-dot--muted" cx="18" cy="108" r="3" />

                    <g class="monthly-expense-widget__illustration-paper">
                        <rect x="28" y="16" width="78" height="101" rx="12" />
                        <path d="M85 16H94C100.627 16 106 21.3726 106 28V38L85 16Z" />
                        <rect class="monthly-expense-widget__illustration-line" x="43" y="39" width="34" height="6" rx="3" />
                        <rect class="monthly-expense-widget__illustration-line monthly-expense-widget__illustration-line--short" x="43" y="53" width="49" height="4" rx="2" />
                        <rect class="monthly-expense-widget__illustration-line monthly-expense-widget__illustration-line--short" x="43" y="64" width="39" height="4" rx="2" />
                        <rect class="monthly-expense-widget__illustration-total" x="42" y="84" width="49" height="18" rx="6" />
                        <path class="monthly-expense-widget__illustration-total-line" d="M50 93H68" />
                    </g>

                    <g class="monthly-expense-widget__illustration-chart">
                        <circle cx="117" cy="82" r="29" />
                        <circle class="monthly-expense-widget__illustration-chart-track" cx="117" cy="82" r="18" />
                        <circle class="monthly-expense-widget__illustration-chart-value" cx="117" cy="82" r="18" pathLength="100" />
                        <circle class="monthly-expense-widget__illustration-chart-center" cx="117" cy="82" r="8" />
                    </g>

                    <g class="monthly-expense-widget__illustration-coins">
                        <ellipse cx="139" cy="111" rx="15" ry="5" />
                        <path d="M124 104V111C124 113.761 130.716 116 139 116C147.284 116 154 113.761 154 111V104" />
                        <ellipse cx="139" cy="104" rx="15" ry="5" />
                    </g>
                </svg>
            </div>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from '@/locales/helpers.ts';
import { usePeriodStatisticsWidgetBase } from '@/views/base/overview/PeriodStatisticsWidgetBase.ts';

import { DateRange } from '@/core/datetime.ts';
import {
    DEFAULT_OVERVIEW_COVER_POSITION_Y,
    DEFAULT_OVERVIEW_COVER_OVERLAY_OPACITY,
    DEFAULT_OVERVIEW_COVER_TEXT_COLOR,
    getCachedOverviewCoverObjectUrl,
    getOverviewCoverObjectUrl,
    buildOverviewCoverOverlayGradient
} from '@/lib/overview_cover.ts';

import {
    mdiRefresh,
    mdiEyeOutline,
    mdiEyeOffOutline
} from '@mdi/js';

const props = defineProps<{
    loading: boolean;
    backgroundImage?: string;
    backgroundImagePositionY?: number;
    backgroundImageOverlayOpacity?: number;
    backgroundImageTextColor?: string;
}>();

const emit = defineEmits<{
    (e: 'refresh'): void
}>();

const { tt } = useI18n();

const coverObjectUrl = ref<string | null>(getCachedOverviewCoverObjectUrl(props.backgroundImage));

watch(() => props.backgroundImage, (newFileName) => {
    coverObjectUrl.value = getCachedOverviewCoverObjectUrl(newFileName);

    if (!newFileName) {
        return;
    }

    const requested = newFileName;
    getOverviewCoverObjectUrl(requested).then(url => {
        if (props.backgroundImage === requested) {
            coverObjectUrl.value = url;
        }
    });
}, { immediate: true });

const hasCustomBackground = computed<boolean>(() => !!coverObjectUrl.value);
const isDarkTextOnCover = computed<boolean>(() => (props.backgroundImageTextColor || DEFAULT_OVERVIEW_COVER_TEXT_COLOR) === 'dark');

const cardStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {};

    if (!coverObjectUrl.value) {
        return style;
    }

    const posY = typeof props.backgroundImagePositionY === 'number'
        ? props.backgroundImagePositionY
        : DEFAULT_OVERVIEW_COVER_POSITION_Y;

    style['backgroundImage'] = `url("${coverObjectUrl.value}")`;
    style['backgroundSize'] = 'cover';
    style['backgroundRepeat'] = 'no-repeat';
    style['backgroundPosition'] = `center ${posY}%`;
    return style;
});

const overlayStyle = computed<Record<string, string>>(() => ({
    background: buildOverviewCoverOverlayGradient(
        props.backgroundImageOverlayOpacity ?? DEFAULT_OVERVIEW_COVER_OVERLAY_OPACITY,
        props.backgroundImageTextColor ?? DEFAULT_OVERVIEW_COVER_TEXT_COLOR
    )
}));

const {
    showAmountInHomePage,
    displayDateRange,
    transactionOverview,
    currentDetailsUrl,
    getDisplayIncomeAmount,
    getDisplayExpenseAmount
} = usePeriodStatisticsWidgetBase({
    dateType: DateRange.ThisMonth.type
});
</script>
