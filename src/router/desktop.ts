import { type NavigationGuardReturn, createRouter, createWebHashHistory } from 'vue-router';

import { isUserLogined, isUserUnlocked } from '@/lib/userstate.ts';

import LoginPage from '@/views/desktop/LoginPage.vue';
import HomePage from '@/views/desktop/HomePage.vue';

function checkLogin(): NavigationGuardReturn {
    if (!isUserLogined()) {
        return {
            path: '/login',
            replace: true
        };
    }

    if (!isUserUnlocked()) {
        return {
            path: '/unlock',
            replace: true
        };
    }

    return true;
}

function checkLocked(): NavigationGuardReturn {
    if (!isUserLogined()) {
        return {
            path: '/login',
            replace: true
        };
    }

    if (isUserUnlocked()) {
        return {
            path: '/',
            replace: true
        };
    }

    return true;
}

function checkNotLogin(): NavigationGuardReturn {
    if (isUserLogined() && !isUserUnlocked()) {
        return {
            path: '/unlock',
            replace: true
        };
    }

    if (isUserLogined()) {
        return {
            path: '/',
            replace: true
        };
    }

    return true;
}

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: '/',
            component: HomePage,
            beforeEnter: checkLogin
        },
        {
            path: '/transaction/list',
            component: () => import('@/views/desktop/transactions/ListPage.vue'),
            beforeEnter: checkLogin,
            props: route => ({
                initPageType: route.query['pageType'],
                initDateType: route.query['dateType'],
                initMaxTime: route.query['maxTime'],
                initMinTime: route.query['minTime'],
                initType: route.query['type'],
                initCategoryIds: route.query['categoryIds'],
                initAccountIds: route.query['accountIds'],
                initTagFilter: route.query['tagFilter'],
                initAmountFilter: route.query['amountFilter'],
                initKeyword: route.query['keyword'],
                initMatchMode: route.query['matchMode']
            })
        },
        {
            path: '/statistics/transaction',
            component: () => import('@/views/desktop/statistics/TransactionPage.vue'),
            beforeEnter: checkLogin,
            props: route => ({
                initAnalysisType: route.query['analysisType'],
                initChartDataType: route.query['chartDataType'],
                initChartType: route.query['chartType'],
                initChartDateType: route.query['chartDateType'],
                initStartTime: route.query['startTime'],
                initEndTime: route.query['endTime'],
                initFilterAccountIds: route.query['filterAccountIds'],
                initFilterCategoryIds: route.query['filterCategoryIds'],
                initTagFilter: route.query['tagFilter'],
                initKeyword: route.query['keyword'],
                initMatchMode: route.query['matchMode'],
                initSortingType: route.query['sortingType'],
                initTrendDateAggregationType: route.query['trendDateAggregationType'],
                initAssetTrendsDateAggregationType: route.query['assetTrendsDateAggregationType']
            })
        },
        {
            path: '/insights/explorer',
            component: () => import('@/views/desktop/insights/ExplorerPage.vue'),
            beforeEnter: checkLogin,
            props: route => ({
                initId: route.query['id'],
                initActiveTab: route.query['activeTab'],
                initDateRangeType: route.query['dateRangeType'],
                initStartTime: route.query['startTime'],
                initEndTime: route.query['endTime']
            })
        },
        {
            path: '/account/list',
            component: () => import('@/views/desktop/accounts/ListPage.vue'),
            beforeEnter: checkLogin
        },
        {
            path: '/',
            component: () => import('@/views/desktop/settings/SettingsPageLayout.vue'),
            beforeEnter: checkLogin,
            children: [
                {
                    path: '/category/list',
                    component: () => import('@/views/desktop/categories/ListPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/tag/list',
                    component: () => import('@/views/desktop/tags/ListPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/template/list',
                    component: () => import('@/views/desktop/templates/ListPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/schedule/list',
                    component: () => import('@/views/desktop/schedules/ListPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/custom_icon/list',
                    component: () => import('@/views/desktop/customicons/ListPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/presets/import/list',
                    component: () => import('@/views/desktop/presets/ImportPresetsListPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/settings/user/basic',
                    component: () => import('@/views/desktop/users/UserBasicSettingPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/settings/user/security',
                    component: () => import('@/views/desktop/users/UserSecuritySettingPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/settings/user/two_factor',
                    component: () => import('@/views/desktop/users/TwoFactorAuthPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/settings/user/data_management',
                    component: () => import('@/views/desktop/users/DataManagementPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/settings/preferences',
                    component: () => import('@/views/desktop/settings/PreferencesSettingsPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/settings/application_lock',
                    component: () => import('@/views/desktop/settings/ApplicationLockPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/settings/statistics',
                    component: () => import('@/views/desktop/settings/StatisticsSettingPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/settings/cloud_sync',
                    component: () => import('@/views/desktop/settings/ApplicationCloudSyncSettingsPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/settings/browser_cache',
                    component: () => import('@/views/desktop/settings/BrowserCacheSettingPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/settings/developer_tools',
                    component: () => import('@/views/desktop/settings/DeveloperToolsPage.vue'),
                    beforeEnter: checkLogin
                },
                {
                    path: '/exchange_rate',
                    component: () => import('@/views/desktop/exchangerates/ListPage.vue'),
                    beforeEnter: checkLogin
                }
            ]
        },
        {
            path: '/overview/edit',
            component: () => import('@/views/desktop/overview/LayoutEditorPage.vue'),
            beforeEnter: checkLogin
        },
        {
            path: '/login',
            component: LoginPage,
            beforeEnter: checkNotLogin
        },
        {
            path: '/signup',
            component: () => import('@/views/desktop/SignupPage.vue'),
            beforeEnter: checkNotLogin
        },
        {
            path: '/verify_email',
            component: () => import('@/views/desktop/VerifyEmailPage.vue'),
            props: route => ({
                email: route.query['email'],
                token: route.query['token'],
                hasValidEmailVerifyToken: route.query['emailSent'] === 'true'
            })
        },
        {
            path: '/forgetpassword',
            component: () => import('@/views/desktop/ForgetPasswordPage.vue'),
            beforeEnter: checkNotLogin
        },
        {
            path: '/resetpassword',
            component: () => import('@/views/desktop/ResetPasswordPage.vue'),
            props: route => ({
                token: route.query['token']
            })
        },
        {
            path: '/oauth2_callback',
            component: () => import('@/views/desktop/OAuth2CallbackPage.vue'),
            props: route => ({
                token: route.query['token'],
                provider: route.query['provider'],
                platform: route.query['platform'],
                userName: route.query['userName'],
                errorCode: route.query['errorCode'],
                errorMessage: route.query['errorMessage']
            })
        },
        {
            path: '/unlock',
            component: () => import('@/views/desktop/UnlockPage.vue'),
            beforeEnter: checkLocked
        }
    ],
});

export default router;
