function showNotificationsInterval() {
    if (isLastMinutes(lastActivity, 1) == false)
        return;

    getCurrentWindow(function(currentWindow) {
        if (!currentWindow || !currentWindow.focused)
            return;

        var currentHour = utcTimeGetter().getHours();
        var activityDays = $stats.getActivityDays();
        if (currentHour <= 12 || currentHour >= 19 || extensionNotifications.canShowNotifications() == false || activityDays < 3)
            return;

        $st.onUserReady(function(userData) {
            if (userData.chromeNotifications && userData.chromeNotifications.length) {
                var notification = userData.chromeNotifications[0];
                callUrl({
                    url: stndz.resources.setReadNotification.replace('[USERID]', userData.privateUserId).replace('[ID]', notification.id),
                    method: 'PUT'
                }, function() {
                    if (extensionNotifications.wasSeen(notification.id) == false) {
                        extensionNotifications.markAsSeen(notification.id);
                        showCustomNotification(notification.title, notification.text, notification.button, notification.url);
                    }

                    refreshUserData();
                });
                return;
            }

            if (extensionNotifications.wasSeen("rate-request"))
                return;

            var donations = $stats.getTotalDonations();
            if (hasAdBlocker == false && stndz.settings.adsEnabled && donations > 0 && userData.stands && userData.stands.length) {

                var title = 'You raised ' + getNormalizedNumber(donations) + ' micro-donations to ' + userData.stands[0].causes[0].causeName;
                var message = 'Rate Fair Ads to help us grow and raise more';
                var url = getRateUrl(fairAdsExtensionId);
                showRateNotification(title, message, url, 'donations');
                extensionNotifications.markAsSeen("rate-request");

            } else {

                var stats = $stats.getSummary();
                var title = 'You blocked ' + getNormalizedNumber(stats.blocking.total.adServersBlocks) + ' ads, ' +
                    (stats.blocking.total.popupBlocks ? getNormalizedNumber(stats.blocking.total.popupBlocks) + ' popups ' : '') +
                    'and saved ' + getNormalizedTime(stats.loadTimes.total.timeSaved);
                var message = 'Would you like to rate us?';
                showRateNotification(title, message, rateUrl, 'blocks');
                extensionNotifications.markAsSeen("rate-request");

            }
        });
    });
}

function checkAndShowNotificationAnimation() {
    $st.onUserReady(function(userData) {
        if (!activeTabId || !pageDatas[activeTabId])
            return;

        if (userData.notificationsCount > 0 && pageDatas[activeTabId])
            showNotificationAnimation(pageDatas[activeTabId].isDeactivated || stndz.settings.enabled == false);
        else
            stopNotificationAnimationIfRunning(pageDatas[activeTabId].isDeactivated || stndz.settings.enabled == false);
    });
}

function showCustomNotification(title, message, buttonText, url) {
    var options = {
        type: "basic",
        iconUrl: "icons/48.png",
        title: title,
        message: message,
        priority: 2,
        requireInteraction: true,
        buttons: [
            {
                title: buttonText
            },
            {
                title: "Close"
            }
        ]
    };

    var details = {
        type: "custom",
        url: url
    };

    createNotification(JSON.stringify(details), options, function(notificationId) { });
}

function showRateNotification(title, message, url, variant) {
    var options = {
        type: "basic",
        iconUrl: "icons/48.png",
        title: title,
        message: message,
        priority: 2,
        requireInteraction: true,
        buttons: [
            {
                title: "Rate",
                iconUrl: "/icons/rate-star.png"
            },
            {
                title: "Close"
            }
        ]
    };

    var details = {
        type: "rate-request",
        url: url
    };

    createNotification(JSON.stringify(details), options, function(notificationId) { });
    updateUserAttributes({
        rateRequestTime: getLocalDateAndMinuteString(utcTimeGetter()),
        utcRateRequestTime: getUtcDateAndMinuteString(utcTimeGetter()),
        rateRequestVariant: variant
    });
}

function showReactivateNotification() {
    if (stndz.settings.enabled)
        return;

    getStorageValue(stndz.constants.pauseConfirmedTime, function(exists, value) {
        if (exists && value)
            return;

        var options = {
            type: "basic",
            iconUrl: "icons/48.png",
            title: "Turn on Fair Ad Blocking",
            message: "STANDS is turned off, would you like to turn it on?",
            priority: 2,
            requireInteraction: true,
            buttons: [
                {
                    title: "Turn on",
                    iconUrl: "/icons/turn-on.png"
                },
                {
                    title: "Keep it off"
                }
            ]
        };

        var details = {
            type: "reactivate-request",
            rand: getRandom()
        };

        createNotification(JSON.stringify(details), options, function(notificationId) { });
        updateUserAttributes({
            reactivateRequestTime: getLocalDateAndSecondString(utcTimeGetter())
        });

    });
}

function showAdBlockersDisabledNotification() {
    var options = {
        type: "basic",
        iconUrl: "icons/48.png",
        title: "Perfect, other ad blockers were successfully disabled!",
        message: "",
        priority: 2,
        buttons: [
            {
                title: "Close"
            }
        ]
    };

    var details = {
        type: "ad-blockers-disabled-ack",
        rand: getRandom()
    };

    createNotification(JSON.stringify(details), options, function(notificationId) { });
}

function showEnableDisableStandsNotification() {
    var options = {
        type: "basic",
        iconUrl: "icons/48.png",
        title: stndz.settings.enabled ? "STANDS is back on" : "STANDS is turned off",
        message: "Refresh the page for this change to take effect",
        priority: 2,
        buttons: [
            {
                title: "Refresh",
                iconUrl: "/icons/refresh.png"
            },
            {
                title: "Close",
                iconUrl: "/icons/close.png"
            }
        ]
    };

    var details = {
        type: "enable-disable-stands",
        tabId: activeTabId,
        rand: getRandom()
    };

    createNotification(JSON.stringify(details), options, function(notificationId) { });
}

function showEnableDisableStandsCurrentSiteNotification(tabId, enable, host) {
    var options = {
        type: "basic",
        iconUrl: "icons/48.png",
        title: enable ? "Blocking resumed on " + host : "The site " + host + " was whitelisted",
        message: "Refresh for this change to take effect",
        priority: 2,
        buttons: [
            {
                title: "Refresh",
                iconUrl: "/icons/refresh.png"
            },
            {
                title: "Close"
            }
        ]
    };

    var details = {
        type: "enable-disable-stands-current-site",
        tabId: tabId,
        rand: getRandom()
    };

    createNotification(JSON.stringify(details), options, function(notificationId) { });
}

function showUnblockElementsNotification(elementsCount) {
    var options = {
        type: "basic",
        iconUrl: "icons/48.png",
        title: elementsCount > 0 ? "You've unblocked " + elementsCount + " element" + (elementsCount > 1 ? "s" : "") + " on this page" : "There were no blocked elements on this page",
        message: "",
        priority: 2,
        buttons: [
            {
                title: "Close"
            }
        ]
    };

    var details = {
        type: "unblock-elements",
        rand: getRandom()
    };

    createNotification(JSON.stringify(details), options, function(notificationId) { });
}

function showAdBlockWallNotification(tabId, host, goToUrl) {
    var options = {
        type: "basic",
        iconUrl: "icons/48.png",
        title: "This site blocks or shows a message to ad-blocking users",
        message: "Would you like to bypass it or whitelist this site?",
        priority: 2,
        buttons: [
            {
                title: "Bypass"
            },
            {
                title: "Whitelist"
            }
        ]
    };

    var details = {
        type: "ad-block-wall",
        tabId: tabId,
        host: host,
        goToUrl: goToUrl,
        rand: getRandom()
    };

    createNotification(JSON.stringify(details), options, function(notificationId) { });
}

function showBypassWithAdBlockerNotification(tabId, host, goToUrl, bypass) {
    var options = {
        type: "basic",
        iconUrl: "icons/48.png",
        title: bypass ? "Your other ad blocker prevents the bypass" : "Your other ad blocker still blocks ads",
        message: "Would you like to disable your other ad blocker?",
        priority: 2,
        buttons: [
            {
                title: "Disable other ad blocker"
            },
            {
                title: "Dismiss"
            }
        ]
    };

    var details = {
        type: "ad-block-wall-disable-adblock",
        tabId: tabId,
        host: host,
        goToUrl: goToUrl,
        rand: getRandom()
    };

    createNotification(JSON.stringify(details), options, function(notificationId) { });
}

function showFrequentClosedPopupsNotification(counter) {
    var options = {
        type: "basic",
        iconUrl: "icons/48.png",
        title: "Fair AdBlocker has closed " + counter + " Popups",
        message: "Would you like it to stop or continue?",
        priority: 2,
        requireInteraction: true,
        buttons: [
            {
                title: "Continue"
            },
            {
                title: "Stop Closing Popups"
            }
        ]
    };

    var details = {
        type: closePopupsSettings.notificationKey
    };

    createNotification(JSON.stringify(details), options, function(notificationId) { });
    updateUserAttributes({ closedPopupNotificationTime: getLocalDateAndSecondString(utcTimeGetter()) });
    extensionNotifications.markAsSeen(closePopupsSettings.notificationKey);
}

function onNotificationButtonClick(notificationId, buttonIndex) {
    var details = JSON.parse(notificationId);
    switch (details.type) {
        case "rate-request":
            if (buttonIndex == 0) {
                openTabWithUrl(details.url);
                updateUserAttributes({ rateRequestAgreeTime: getLocalDateAndSecondString(utcTimeGetter()) });
            } else if (buttonIndex == 1) {
                updateUserAttributes({ rateRequestCloseTime: getLocalDateAndSecondString(utcTimeGetter()) });
            }
            break;

        case "enable-disable-stands":
        case "enable-disable-stands-current-site":
            if (buttonIndex == 0) {
                reloadTab(details.tabId);
            }
            break;

        case "reactivate-request":
            if (buttonIndex == 0) {
                toggleStandsStateClicked("Notification");
            } else if (buttonIndex == 1) {
                setSingleStorageValue(stndz.constants.pauseConfirmedTime, true);
                updateUserAttributes({ pauseConfirmedTime: getLocalDateAndSecondString(utcTimeGetter()) });
            }
            break;

        case "ad-block-wall":
            if (buttonIndex == 0) {
                updateJsRuleParameters(details.host, {bypass:true});
                if (hasAdBlocker) {
                    showBypassWithAdBlockerNotification(details.tabId, details.host, details.goToUrl, true);
                } else {
                    setTimeout(function() {
                        if (details.goToUrl)
                            updateTabUrl(details.tabId, details.goToUrl, true);
                        else
                            reloadTab(details.tabId);
                    }, 500);
                }

                updateUserAttributes({
                    lastAdBlockWallBypass: getUtcDateAndMinuteString(utcTimeGetter())
                });

                reportAnonymousData('adblock-wall-bypass', {
                    host: details.host
                });

            } else if (buttonIndex == 1) {
                sendMessageToBackground({
                    type: stndz.messages.deactivatedSitesRequest,
                    hosts: [{
                        hostAddress: details.host,
                        deactivate: true
                    }]
                }, function() {
                    if (hasAdBlocker)
                        showBypassWithAdBlockerNotification(details.tabId, details.host, details.goToUrl, false);
                    else {
                        setTimeout(function() {
                            if (details.goToUrl)
                                updateTabUrl(details.tabId, details.goToUrl, true);
                            else
                                reloadTab(details.tabId);
                        }, 500);
                    }
                });

                updateUserAttributes({
                    lastAdBlockWallWhitelist: getUtcDateAndMinuteString(utcTimeGetter())
                });

                reportAnonymousData('adblock-wall-whitelist', {
                    host: details.host
                });
            }
            break;

        case "ad-block-wall-disable-adblock":
            if (buttonIndex == 0) {
                sendMessageToBackground({
                    type: stndz.messages.disableAdBlockers,
                    source: 'bypass'
                }, function(disabled) {
                    if (disabled) {
                        setTimeout(function() {
                            if (details.goToUrl)
                                updateTabUrl(details.tabId, details.goToUrl, true);
                            else
                                reloadTab(details.tabId);
                        }, 500);
                    }
                });
            }
            break;

        case closePopupsSettings.notificationKey:
            if (buttonIndex == 1) {
                sendMessageToBackground({
                    type: stndz.messages.updateUserSettings,
                    settings: { closePopups: false }
                });
            }
            break;

        case "custom":
            if (buttonIndex == 0) {
                openTabWithUrl(details.url);
            }
            break;
    }

    clearNotification(notificationId);
}

function onNotificationClick(notificationId) {
    var details = JSON.parse(notificationId);
    switch (details.type) {
        case "rate-request":
            openTabWithUrl(details.url);
            updateUserAttributes({ rateRequestAgreeTime: getLocalDateAndSecondString(utcTimeGetter()) });
            break;

        case "enable-disable-stands":
        case "enable-disable-stands-current-site":
            reloadTab(details.tabId);
            break;

        case "reactivate-request":
            toggleStandsStateClicked("Notification");
            break;

        case "ad-block-wall":
            updateJsRuleParameters(details.host, {dismiss: true});
            break;

        case "ad-block-wall-disable-adblock":
            updateJsRuleParameters(details.host, {dismiss: true});
            break;

        case "custom":
            openTabWithUrl(details.url);
            break;
    }

    clearNotification(notificationId);
}

function onNotificationClosed(notificationId, byUser) {
    var details = JSON.parse(notificationId);
    switch (details.type) {
        case "rate-request":
            byUser && updateUserAttributes({ rateRequestCloseTime: getLocalDateAndSecondString(utcTimeGetter()) });
            break;

        case "ad-block-wall":
            byUser && updateJsRuleParameters(details.host, {dismiss: true});
            break;
    }
}