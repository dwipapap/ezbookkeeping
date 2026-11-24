<template>
    <f7-card class="home-summary-card no-margin-top margin-bottom"
             :class="{
                 'skeleton-text': loading,
                 'home-summary-card--has-cover': hasCustomBackground,
                 'home-summary-card--cover-light-text': hasCustomBackground && !isDarkTextOnCover,
                 'home-summary-card--cover-dark-text': hasCustomBackground && isDarkTextOnCover
             }"
             :style="cardStyle">
        <div class="home-summary-card__cover-overlay" :style="overlayStyle" v-if="hasCustomBackground"></div>

        <f7-card-header class="display-block" :style="cardHeaderStyle">
            <p class="no-margin">
                <span class="card-header-content" v-if="loading">
                    <span class="home-summary-month">Month</span>
                    <span>·</span>
                    <small>Expense</small>
                </span>
                <span class="card-header-content" v-else>
                    <span class="home-summary-month">{{ displayDateRange?.thisMonth?.displayTime }}</span>
                    <span>·</span>
                    <small>{{ tt('Expense') }}</small>
                </span>
            </p>
            <p class="no-margin">
                <span class="month-expense" v-if="loading">0.00 USD</span>
                <span class="month-expense" v-else>{{ transactionOverview?.thisMonth ? getDisplayExpenseAmount(transactionOverview.thisMonth) : '-' }}</span>
                <f7-link class="display-inline-flex margin-inline-start-half" :style="iconStyle"
                         :aria-label="showAmountInHomePage ? tt('Hide Amount') : tt('Show Amount')"
                         @click="showAmountInHomePage = !showAmountInHomePage">
                    <f7-icon class="ebk-hide-icon" :f7="showAmountInHomePage ? 'eye_slash_fill' : 'eye_fill'"></f7-icon>
                </f7-link>
            </p>
            <p class="no-margin">
                <small class="home-summary-misc" v-if="loading">Monthly income 0.00 USD</small>
                <small class="home-summary-misc" v-else>
                    <span>{{ tt('Monthly income') }}</span>
                    <span>{{ transactionOverview?.thisMonth ? getDisplayIncomeAmount(transactionOverview.thisMonth) : '-' }}</span>
                </small>
            </p>
        </f7-card-header>
    </f7-card>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useI18n } from '@/locales/helpers.ts';
import { usePeriodStatisticsWidgetBase } from '@/views/base/overview/PeriodStatisticsWidgetBase.ts';

import { useEnvironmentsStore } from '@/stores/environment.ts';

import type { ColorValue } from '@/core/color.ts';
import {
    DEFAULT_MOBILE_OVERVIEW_WIDGET_LIGHT_BACKGROUND_COLOR,
    DEFAULT_MOBILE_OVERVIEW_WIDGET_DARK_BACKGROUND_COLOR
} from '@/consts/color.ts';

import { getDisplayColor, getContrastTextColor, getContrastIconColor } from '@/lib/color.ts';
import {
    DEFAULT_OVERVIEW_COVER_POSITION_Y,
    DEFAULT_OVERVIEW_COVER_OVERLAY_OPACITY,
    DEFAULT_OVERVIEW_COVER_TEXT_COLOR,
    getCachedOverviewCoverObjectUrl,
    getOverviewCoverObjectUrl,
    buildOverviewCoverOverlayGradient
} from '@/lib/overview_cover.ts';

const props = defineProps<{
    loading: boolean;
    height: number;
    lightBackgroundColor?: ColorValue;
    darkBackgroundColor?: ColorValue;
    backgroundImage?: string;
    backgroundImagePositionY?: number;
    backgroundImageOverlayOpacity?: number;
    backgroundImageTextColor?: string;
}>();

const environmentsStore = useEnvironmentsStore();

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

const isDarkMode = computed<boolean>(() => environmentsStore.framework7DarkMode || false);
const backgroundColor = computed<ColorValue>(() => isDarkMode.value ?
    props.darkBackgroundColor ?? DEFAULT_MOBILE_OVERVIEW_WIDGET_DARK_BACKGROUND_COLOR :
    props.lightBackgroundColor ?? DEFAULT_MOBILE_OVERVIEW_WIDGET_LIGHT_BACKGROUND_COLOR);
const foregroundColor = computed<string>(() => {
    if (hasCustomBackground.value) {
        return isDarkTextOnCover.value ? '#1c1c24' : '#ffffff';
    }
    return getDisplayColor(getContrastTextColor(backgroundColor.value));
});
const iconColor = computed<string>(() => {
    if (hasCustomBackground.value) {
        return isDarkTextOnCover.value ? '#1c1c24' : '#ffffff';
    }
    return getDisplayColor(getContrastIconColor(backgroundColor.value));
});

const cardStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {
        'background-color': getDisplayColor(backgroundColor.value),
        'color': foregroundColor.value
    };

    if (coverObjectUrl.value) {
        const posY = typeof props.backgroundImagePositionY === 'number'
            ? props.backgroundImagePositionY
            : DEFAULT_OVERVIEW_COVER_POSITION_Y;

        style['background-image'] = `url("${coverObjectUrl.value}")`;
        style['background-size'] = 'cover';
        style['background-repeat'] = 'no-repeat';
        style['background-position'] = `center ${posY}%`;
    }

    return style;
});

const overlayStyle = computed<Record<string, string>>(() => ({
    background: buildOverviewCoverOverlayGradient(
        props.backgroundImageOverlayOpacity ?? DEFAULT_OVERVIEW_COVER_OVERLAY_OPACITY,
        props.backgroundImageTextColor ?? DEFAULT_OVERVIEW_COVER_TEXT_COLOR
    )
}));

const cardHeaderStyle = computed<Record<string, string>>(() => {
    const finalStyle: Record<string, string> = {
        color: foregroundColor.value,
        position: 'relative',
        'z-index': '1'
    };

    if (props.height === 1) {
        finalStyle['padding-top'] = '10px';
    } else if (props.height === 2) {
        finalStyle['padding-top'] = '60px';
    } else {
        finalStyle['padding-top'] = '120px';
    }

    return finalStyle;
});

const iconStyle = computed<Record<string, string>>(() => ({
    color: iconColor.value,
    opacity: '1'
}));

const { tt } = useI18n();
const {
    showAmountInHomePage,
    displayDateRange,
    transactionOverview,
    getDisplayIncomeAmount,
    getDisplayExpenseAmount
} = usePeriodStatisticsWidgetBase({});
</script>

<style scoped>
.home-summary-card__cover-overlay {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    z-index: 0;
}

.home-summary-card--cover-light-text :deep(.card-header) {
    text-shadow: 0 1px 5px rgba(0, 0, 0, 0.38);
}

.home-summary-card--cover-light-text :deep(.card-header-content),
.home-summary-card--cover-light-text :deep(.home-summary-misc) {
    opacity: 0.88;
}

.home-summary-card--cover-dark-text :deep(.card-header) {
    text-shadow: 0 1px 3px rgba(255, 255, 255, 0.45);
}

.home-summary-card--cover-dark-text :deep(.card-header-content),
.home-summary-card--cover-dark-text :deep(.home-summary-misc) {
    opacity: 0.78;
}
</style>
