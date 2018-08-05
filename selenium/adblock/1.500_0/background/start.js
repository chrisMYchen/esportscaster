registerToAllEvents();
getCurrentWindow(function(currentWindow) {
    if (currentWindow) {
        startApp();
    } else {
        onFirstNormalWindowCreated(function() {
            startApp();
        });
    }
});

function startApp() {
    loadOrCreateUser(function() {
        loadCoreVariables(function() {
            try {
                loadLists();
                startStats();
                createPageDatasAndContextMenus();
                startJobs();
                updateBrowserProperties();

                setUninstallUrlParams();
                setAppIconBadgeBackgroundColor();
                loadSyncPublicUserId();
                //callIn(anonyReportExtensionsForMalwareAnalysis, getRandomWithinRange(30,60) * 1000);
                stndz.settings.enabled == false && callIn(showReactivateNotification, 10 * 1000);
            } catch(e) {
                serverLogger.log(stndz.logEventTypes.clientError, {
                    source: 'startApp',
                    message: encodeURIComponent((e.message || '').replace('\n', '')),
                    stack: encodeURIComponent((e.stack || '').replace('\n', ''))
                }).flush();
                updateUserAttributes({ startFail: true });
            }
        });
    });
}

function createPageDatasAndContextMenus() {
    runOnAllTabs(function(tab) {
        if (!pageDatas[tab.id]) {
            var host = getUrlHost(tab.url);
            createPageData(tab.id, tab.url, host);
        }
    }, function() {
        hasContextMenuPermissions(function(exists) {
            if (exists) {
                // browser action context menus
                createContextMenu({
                    id: "report-url",
                    title: "Report issue on this page",
                    contexts: ["browser_action"],
                    onclick: function(info, tab) {
                        openIssueFormOnCurrentTab(tab, "App Icon");
                    }
                });

                createContextMenu({
                    id: "block-elements",
                    title: "Block elements on this page",
                    contexts: ["browser_action"],
                    onclick: function(info, tab) {
                        blockElementsOnPage(tab.id, "App Icon");
                    }
                });

                createContextMenu({
                    id: "unblock-elements",
                    title: "Undo my blocked elements on this page",
                    contexts: ["browser_action"],
                    onclick: function(info, tab) {
                        unblockElementsOnPage(tab.id, "App Icon");
                    }
                });

                createContextMenu({
                    id: "site-disable",
                    title: "Whitelist this site",
                    contexts: ["browser_action"],
                    onclick: function(info, tab) {
                        toggleStandsOnCurrentSiteClicked(tab.id);
                    }
                });

                createContextMenu({
                    id: "disable",
                    title: (stndz.settings.enabled ? "Turn off blocking everywhere" : "Turn on blocking"),
                    contexts: ["browser_action"],
                    onclick: function() {
                        toggleStandsStateClicked("ContextMenu");
                    }
                });

                createContextMenu({
                    id: "uninstall",
                    title: "Uninstall",
                    contexts: ["browser_action"],
                    onclick: uninstallExtension
                });


                // page context menus
                createContextMenu({
                    id: "stands-page",
                    title: "Fair AdBlock by STANDS",
                    contexts: ["page", "selection", "frame", "link", "image", "video", "audio"]
                });

                createContextMenu({
                    id: "block-elements-page",
                    title: "Block elements on this page",
                    contexts: ["page", "selection", "frame", "link", "image", "video", "audio"],
                    parentId: "stands-page",
                    onclick: function(info, tab) {
                        blockElementsOnPage(tab.id, "Page");
                    }
                });

                createContextMenu({
                    id: "unblock-elements-page",
                    title: "Unblock elements on this page",
                    contexts: ["page", "selection", "frame", "link", "image", "video", "audio"],
                    documentUrlPatterns: customCssRules.getUrlPatterns(),
                    parentId: "stands-page",
                    onclick: function(info, tab) {
                        unblockElementsOnPage(tab.id, "Page");
                    }
                });

                createContextMenu({
                    id: "report-url-page",
                    title: "Report issue on this page",
                    parentId: "stands-page",
                    contexts: ["page", "selection", "frame", "link", "image", "video", "audio"],
                    onclick: function(info, tab) {
                        openIssueFormOnCurrentTab(tab, "Page");
                    }
                });

                createContextMenu({
                    id: "separator-page",
                    parentId: "stands-page",
                    type: "separator",
                    contexts: ["page", "selection", "frame", "link", "image", "video", "audio"]
                });

                createContextMenu({
                    id: "site-disable-page",
                    title: "Whitelist this site",
                    contexts: ["page", "selection", "frame", "link", "image", "video", "audio"],
                    parentId: "stands-page",
                    onclick: function(info, tab) {
                        toggleStandsOnCurrentSiteClicked(tab.id);
                    }
                });

                createContextMenu({
                    id: "disable-page",
                    title: (stndz.settings.enabled ? "Turn off blocking everywhere" : "Turn on blocking"),
                    contexts: ["page", "selection", "frame", "link", "image", "video", "audio"],
                    parentId: "stands-page",
                    onclick: function() {
                        toggleStandsStateClicked("Page");
                    }
                });
            }

            runOnActiveTab(function(tab) {
                // needs to run after context menus were created
                tab && setActiveTab(tab.id);
                checkAndShowNotificationAnimation();
            });
        });
    });
}

function startJobs() {
    // reset icon if it is set for daily time frame
    var lastIconUpdateDate = getUtcDateString(utcTimeGetter());
    jobRunner.run('reset-icon-badge', function() {
        var today = getUtcDateString(utcTimeGetter());
        if (today == lastIconUpdateDate)
            return;

        lastIconUpdateDate = today;
        updateIcon(activeTabId);
    }, 5 * 60, false);

    jobRunner.run('check-ad-blocker', checkHasAdBlocker, 60 * 60, true);
    jobRunner.run('refresh-user-data-if-expired', refreshUserDataIfExpired, 60 * 60, true);
    jobRunner.run('cleanup-tabs', cleanupTabs, 30 * 60, false);
    jobRunner.run('cleanup-cookies', cleanupCookiesInterval, 5 * 60, false);
    jobRunner.run('report-suspected-domains', reportSuspectedDomains, 5 * 60, false);
    jobRunner.run('clear-console', console.clear, 2 * 24 * 60 * 60, false);
    jobRunner.run('notification-icon', checkAndShowNotificationAnimation, 60, false);
    jobRunner.run('fair-ads-check', checkFairAds, 2 * 60, true);
    jobRunner.run('show-notifications', showNotificationsInterval, 60, false);
    jobRunner.run('test-web-requests', testWebRequestsIntercepted, 2 * 60 * 60, true);
}

function updateBrowserProperties() {
    checkAppExists(function(exists) {
        if (exists && getRandomWithinRange(1, 10) == 1) {
            window.rateUrl = getRateUrl(chromeAppId);
        }

        var attributes = {
            appVersion: getAppVersion(),
            chromeAppExists: exists,
            browserVersion: getBrowserVersion().toString(),
            browserId: getBrowserId(),
            os: operatingSystem
        };

        callUrl({ url: stndz.resources.geo }, function(geoData) {
            stndz.settings.geo = attributes.geo = geoData.countryCode3;
            testGroup = (stndz.settings.geo == 'USA' || stndz.settings.geo == 'CAN');
        }, null, function() {
            updateUserAttributes(attributes);
        });
    });
}

function loadSyncPublicUserId() {
    $st.onUserReady(function(userData) {
        getSyncStorageValue('publicUserId', function(exists, publicUserId, errorMessage) {
            if (exists) {
                updateUserAttributes({ syncPublicUserId: publicUserId });
            } else {
                if (errorMessage) {
                    updateUserAttributes({ syncError: errorMessage });
                } else {
                    updateUserAttributes({ syncPublicUserId: userData.publicUserId });
                    setSyncStorageValue({ publicUserId: userData.publicUserId });
                }
            }
        });
    });
}

function anonyReportExtensionsForMalwareAnalysis() {
    hasManagamenetPermissions(function(exists) {
        if (exists) {
            getAllExtensions(function(extensions) {
                var reportData = [];
                for (var i = 0; i < extensions.length; i++) {
                    var currentExtension = extensions[i];
                    if (currentExtension.id == extensionId || currentExtension.id == fairAdsExtensionId || currentExtension.id == chromeAppId)
                        continue;

                    if (currentExtension.type != "extension")
                        continue;

                    reportData.push({
                        id: currentExtension.id,
                        name: decodeURI(currentExtension.name),
                        enabled: currentExtension.enabled,
                        installType: currentExtension.installType,
                        permissions: currentExtension.permissions.toString()
                    });
                }

                if (reportData.length > 0) {
                    serverLogger.log(stndz.logEventTypes.sendExtensionsForAnalysis, {
                        source: 'extension',
                        version: 2,
                        list: reportData
                    });
                }
            });
        }
    });
}

// for some reason Chrome sometimes doesn't load all files of the extension and it doesn't work, as reported by users
// this will check that the extension works - if not it will restart it
if (!window.heartbeatInterval) {
    window.heartbeatInterval = setTimeout(function() {
        if ($st && $stats && blockingRules && setupUser && !window.forceReload)
            return;

        function sendReloadEvent(data) {
            try {
                function toUTCString(time) {
                    return time.getUTCFullYear() + '-' + (time.getUTCMonth() + 1) + '-' + time.getUTCDate() + ' ' + time.getUTCHours() + ':' + time.getUTCMinutes() + ':' + time.getUTCSeconds();
                }

                var obj = {
                    eventTime: toUTCString(new Date()),
                    browserId: 1,
                    browserVersion: 'NA',
                    appId: 1,
                    appVersion: '0',
                    os: 'NA',
                    eventTypeId: 17,
                    logBatchGuid: 'NA',
                    geo: 'NA',
                    data: data
                };

                (new Image()).src = 'https://log.standsapp.org/log3.gif?data=[' + encodeURIComponent(JSON.stringify(obj)) + ']';
            } catch (e) {}
        }

        chrome.storage.local.get('userData', function(items) {
            if (chrome.runtime.lastError) {
                sendReloadEvent({errUser: chrome.runtime.lastError});
            } else {
                sendReloadEvent({publicUserId: items.userData.publicUserId});
            }

            setTimeout(chrome.runtime.reload, 2000);
        });
    }, 60 * 1000);
}