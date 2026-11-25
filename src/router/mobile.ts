import type { Router } from 'framework7/types';

import { isUserLogined, isUserUnlocked } from '@/lib/userstate.ts';

import HomePage from '@/views/mobile/HomePage.vue';
import LoginPage from '@/views/mobile/LoginPage.vue';

type AsyncComponentLoader = () => Promise<{ default: unknown }>;

function asyncResolve(componentOrLoader: unknown): (ctx: Router.RouteCallbackCtx) => void {
    return function({ resolve }: { resolve: ({ component }: { component: unknown }) => void }): void {
        if (typeof componentOrLoader === 'function') {
            (componentOrLoader as AsyncComponentLoader)().then(mod => {
                resolve({ component: mod.default });
            });
            return;
        }

        resolve({ component: componentOrLoader });
    } as unknown as (ctx: Router.RouteCallbackCtx) => void;
}

function checkLogin({ router, resolve, reject }: { router: Router.Router, resolve: () => void, reject: () => void }): void {
    if (!isUserLogined()) {
        reject();
        router.navigate('/login', {
            clearPreviousHistory: true,
            browserHistory: false
        });
        return;
    }

    if (!isUserUnlocked()) {
        reject();
        router.navigate('/unlock', {
            clearPreviousHistory: true,
            browserHistory: false
        });
        return;
    }

    resolve();
}

function checkLocked({ router, resolve, reject }: { router: Router.Router, resolve: () => void, reject: () => void }): void {
    if (!isUserLogined()) {
        reject();
        router.navigate('/login', {
            clearPreviousHistory: true,
            browserHistory: false
        });
        return;
    }

    if (isUserUnlocked()) {
        reject();
        router.navigate('/', {
            clearPreviousHistory: true,
            browserHistory: false
        });
        return;
    }

    resolve();
}

function checkNotLogin({ router, resolve, reject }: { router: Router.Router, resolve: () => void, reject: () => void }): void {
    if (isUserLogined() && !isUserUnlocked()) {
        reject();
        router.navigate('/unlock', {
            clearPreviousHistory: true,
            browserHistory: false
        });
        return;
    }

    if (isUserLogined()) {
        reject();
        router.navigate('/', {
            clearPreviousHistory: true,
            browserHistory: false
        });
        return;
    }

    resolve();
}

const routes: Router.RouteParameters[] = [
    {
        path: '/',
        async: asyncResolve(HomePage),
        beforeEnter: [checkLogin],
        options: {
            animate: false,
        }
    },
    {
        path: '/login',
        async: asyncResolve(LoginPage),
        beforeEnter: [checkNotLogin],
        options: {
            animate: false,
        }
    },
    {
        path: '/signup',
        async: asyncResolve(() => import('@/views/mobile/SignupPage.vue')),
        beforeEnter: [checkNotLogin],
        options: {
            animate: false,
        }
    },
    {
        path: '/unlock',
        async: asyncResolve(() => import('@/views/mobile/UnlockPage.vue')),
        beforeEnter: [checkLocked],
        options: {
            animate: false,
        }
    },
    {
        path: '/transaction/list',
        async: asyncResolve(() => import('@/views/mobile/transactions/ListPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/transaction/filter/amount',
        async: asyncResolve(() => import('@/views/mobile/transactions/AmountFilterPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/transaction/add',
        async: asyncResolve(() => import('@/views/mobile/transactions/EditPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/transaction/edit',
        async: asyncResolve(() => import('@/views/mobile/transactions/EditPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/transaction/detail',
        async: asyncResolve(() => import('@/views/mobile/transactions/EditPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/account/list',
        async: asyncResolve(() => import('@/views/mobile/accounts/ListPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/account/add',
        async: asyncResolve(() => import('@/views/mobile/accounts/EditPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/account/edit',
        async: asyncResolve(() => import('@/views/mobile/accounts/EditPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/account/reconciliation_statements',
        async: asyncResolve(() => import('@/views/mobile/accounts/ReconciliationStatementPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/account/move_all_transactions',
        async: asyncResolve(() => import('@/views/mobile/accounts/MoveAllTransactionsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/statistic/transaction',
        async: asyncResolve(() => import('@/views/mobile/statistics/TransactionPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/statistic/settings',
        async: asyncResolve(() => import('@/views/mobile/statistics/SettingsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings/textsize',
        async: asyncResolve(() => import('@/views/mobile/settings/TextSizeSettingsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings/filter/account',
        async: asyncResolve(() => import('@/views/mobile/settings/AccountFilterSettingsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings/filter/category',
        async: asyncResolve(() => import('@/views/mobile/settings/CategoryFilterSettingsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings/filter/tag',
        async: asyncResolve(() => import('@/views/mobile/settings/TransactionTagFilterSettingsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings/preferences',
        async: asyncResolve(() => import('@/views/mobile/settings/PreferencesSettingsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings/overview_layout',
        async: asyncResolve(() => import('@/views/mobile/overview/LayoutEditorPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings/chart_color_scheme',
        async: asyncResolve(() => import('@/views/mobile/settings/ChartColorSchemeSettingsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings/account_category_display_order',
        async: asyncResolve(() => import('@/views/mobile/settings/AccountCategoryDisplayOrderSettingsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings/sync',
        async: asyncResolve(() => import('@/views/mobile/settings/ApplicationCloudSyncSettingsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings/browser_caches',
        async: asyncResolve(() => import('@/views/mobile/settings/BrowserCacheSettingPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/settings',
        async: asyncResolve(() => import('@/views/mobile/SettingsPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/app_lock',
        async: asyncResolve(() => import('@/views/mobile/ApplicationLockPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/exchange_rates',
        async: asyncResolve(() => import('@/views/mobile/exchangerates/ListPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/exchange_rates/update',
        async: asyncResolve(() => import('@/views/mobile/exchangerates/UpdatePage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/about',
        async: asyncResolve(() => import('@/views/mobile/AboutPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/user/profile',
        async: asyncResolve(() => import('@/views/mobile/users/UserProfilePage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/user/data/management',
        async: asyncResolve(() => import('@/views/mobile/users/DataManagementPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/user/2fa',
        async: asyncResolve(() => import('@/views/mobile/users/TwoFactorAuthPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/user/sessions',
        async: asyncResolve(() => import('@/views/mobile/users/SessionListPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/category/all',
        async: asyncResolve(() => import('@/views/mobile/categories/AllPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/category/list',
        async: asyncResolve(() => import('@/views/mobile/categories/ListPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/category/add',
        async: asyncResolve(() => import('@/views/mobile/categories/EditPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/category/edit',
        async: asyncResolve(() => import('@/views/mobile/categories/EditPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/category/preset',
        async: asyncResolve(() => import('@/views/mobile/categories/PresetPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/tag/list',
        async: asyncResolve(() => import('@/views/mobile/tags/ListPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/tag/group/list',
        async: asyncResolve(() => import('@/views/mobile/tags/GroupListPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/template/list',
        async: asyncResolve(() => import('@/views/mobile/templates/ListPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/schedule/list',
        async: asyncResolve(() => import('@/views/mobile/schedules/ListPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/template/add',
        async: asyncResolve(() => import('@/views/mobile/transactions/EditPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '/template/edit',
        async: asyncResolve(() => import('@/views/mobile/transactions/EditPage.vue')),
        beforeEnter: [checkLogin]
    },
    {
        path: '(.*)',
        redirect: '/'
    }
];

export default routes;
