var guidSeed = createGuidSeed();
function createGuidSeed() {
	var str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	var seed = "";
	while (str.length > 0) {
		var index = Math.floor(Math.random() * str.length);
		var char = str.substring(index, index+1);
		str = str.replace(char, '');
		seed += char;
	}

	return seed;
}

function createGuid() {
	var guid = "";
	while (guid.length < 36) {
		guid += guidSeed[Math.floor(Math.random() * guidSeed.length)];
	}

	return guid;
}

function ifnull(str, alt) {
    if (str) {
        return str;
    }

    return alt;
}

function forEach(enumerable, delegate) {
    if (!enumerable || !enumerable.length) {
        return;
    }

    for (var i = 0; i < enumerable.length; i++) {
        var breakResult = delegate(enumerable[i]);
        if (breakResult === true) {
            break;
        }
    }
}

function runSafely(delegate, errorCallback) {
    try {
        return delegate();
    } catch(e) {
        errorCallback && errorCallback(e);
    }
}

function runEachSafely(arr, callback, onComplete) {
    if (arr && arr.length) {
        for (var i = 0; i < arr.length; i++) {
            runSafely(function() {
                callback(arr[i]);
            });
        }
    }

    onComplete && runSafely(onComplete);
}

function callIn(delegate, milliseconds) {
    return window.setTimeout(delegate, milliseconds);
}

function callEvery(delegate, milliseconds, startingNow) {
    if (startingNow) {
        try {
            delegate()
        } catch(e) { }
    }

    return window.setInterval(delegate, milliseconds);
}

function stopInterval(intervalId) {
    window.clearInterval(intervalId);
}

function getRandom() {
    return Math.floor(Math.random() * 10000000000000);
}

function getRandomWithinRange(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function utcTimeGetter() {
    return new Date();
}

function endsWith(str, suffix) {
    return str && suffix && str.length >= suffix.length && str.indexOf(suffix, str.length - suffix.length) > -1;
}

function daysDiff(date1, date2) {
    var day1 = new Date(date1 - date1.getHours()*60*60*1000 - date1.getMinutes()*60*1000 - date1.getSeconds()*1000);
    var day2 = new Date(date2 - date2.getHours()*60*60*1000 - date2.getMinutes()*60*1000 - date2.getSeconds()*1000);
    return Math.round((day2-day1)/(1000*60*60*24));
}

var urlParamsRegex = /https?:\/\/[^\?]*\?(.*)/;
function parseUrlParamsToObject(url) {
    var match = url ? url.match(urlParamsRegex) : null;
    var search = match && match.length == 2 ? match[1] : null;
    var params = {};
    if (search && search.length > 0) {
        var searchParts = search.split('&');
        for (var i = 0; i < searchParts.length; i++) {
            var keyValue = searchParts[i].split('=');
            if (keyValue.length == 2)
                params[keyValue[0]] = decodeURIComponent(keyValue[1]);
        }
    }

    return params;
}

var callUrlQueue = new Array();
var callUrlInProgress = false;
function callUrl(obj, successCallback, failCallback, finalCallback) {
    if (callUrlInProgress) {
        callUrlQueue.push(function() {
            callUrl(obj, successCallback, failCallback, finalCallback);
        });
        return;
    }

    callUrlInProgress = true;
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
        if (xhr.readyState != 4)
            return;

        obj.statusCode = xhr.status;
        obj.statusText = xhr.statusText;
        runSafely(function() {
            if (xhr.status == 200) {
                if (xhr.responseText.length > 0) {
                    var response = obj.raw === true ? xhr.responseText : JSON.parse(xhr.responseText);
                    successCallback && successCallback(response, obj);
                } else {
                    successCallback && successCallback(null, obj);
                }
            } else {
                failCallback && failCallback(new Error('Failed calling ' + obj.url + ', status: ' + xhr.status + ', text: ' + xhr.statusText), obj);
            }
        });

        finalCallback && runSafely(finalCallback);

        callUrlInProgress = false;
        if (callUrlQueue.length > 0) {
            var delegate = callUrlQueue.shift();
            runSafely(delegate);
        }
    };

    var method = obj.method ? obj.method : 'GET';
    xhr.open(method, obj.url.replace('[RAND]', getRandom()), true);
    xhr.send(obj.data ? JSON.stringify(obj.data) : null);
}

var stndz = {
    logEventTypes: {
        adImpression: 2,
        clientError: 3,
        extensionInstalled: 4,
        extensionUpdated: 5,
        whitelistSiteWithoutDonations: 6,
        nonWhitelistedSiteWithAdServers: 7,
        reserved: 8,
        sampleOfBlockedPopup: 9,
        popupBlocked: 10,
        reportAnonymousData: 11,
        adOptionsClicked: 12,
        suspectedMalwareBotActivity: 13,
        sendExtensionsForAnalysis: 14,
        sendSample: 15,
        sampleSiteForReview: 16,
        extensionReload: 17
    },
    messages: {
        hideElement: 'hide-element',
        pageData: 'page-data',
        externalPageData: 'external-page-data',
        updatePageData: 'update-page-data',
        updateUser: 'update-user-request',
        adImpression: 'ad-impression',
        clientError: 'client-error',
        extensionInstalled: 'extension-installed',
        extensionUpdated: 'extension-updated',
        getAppData: 'get-app-data',
        getDashboardData: 'get-dashboard-data',
        setDashboardData: 'set-dashboard-data',
        getUserData: 'get-user-data',
        canInjectPlaceholder: 'can-inject-ad',
        cleanCookies: 'clean-cookies',
        notificationPopup: 'notification-popup',
        browserActionOpened: 'browser-action-opened',
        whitelistSiteWithoutDonations: 'whitelist-site-without-donations',
        nonWhitelistedSiteWithAdServers: 'non-whitelisted-site-with-ad-servers',
        userDataUpdated: 'user-data-updated',
        refreshUserData: 'refresh-user-data',
        deactivatedSitesRequest: 'deactivated-sites-request',
        getUserSettings: 'get-user-settings',
        updateUserSettings: 'update-user-settings',
        popupUserAction: 'popup-user-action',
        popupSitesRequest: 'popup-sites-request',
        popupBlocked: 'popup-blocked',
        getAdBlocker: 'get-ad-blocker',
        reportAnonymousData: 'report-anonymous-data',
        refreshCurrentTab: 'refresh-current-tab',
        adOptionsClicked: 'ad-options-clicked',
        getBlockingData: 'get-blocking-data',
        reportIssue: 'report-issue',
        reportAd: 'report-ad',
        emptyAdClicked: 'empty-ad-clicked',
        possibleAdFrame: 'possible-ad-frame',
        disableAdBlockers: 'disable-ad-blockers',
        reportIssueForm: 'report-issue-form',
        blockElement: 'block-element',
        exitBlockElement: 'exit-block-element',
        editBlockElement: 'edit-block-element',
        undoBlockedElements: 'undo-blocked-elements',
        countBlockedElements: 'count-blocked-elements',
        executeScriptOnCurrentTab: 'execute-script-on-current-tab',
        adBlockWall: 'ad-block-wall',
        getParentExtensionId: 'parent-ext-id',
        pageLoadCompleted: 'page-load-completed',
        suspectedMalwareBotActivity: 'suspected-malware-bot-activity',
        contentScriptVersionUpgrade: 'content-script-version-upgrade',
        sendExtensionsForAnalysis: 'send-extensions-for-analysis',
        sendSample: 'send-sample',
        sampleSiteForReview: 'sample-site-for-review'
    },
    attributes: {
        blockedAdElement: 'stndz-blocked',
        placeholderContainer: 'stndz-container'
    },
    signals: {
        host: "stands-app",
        base: "//stands-app/",
        placeholderFrame: "//stands-app/placeholder.js",
        adBlockersTest: '//stands-app/ads.png.test-adblockers-exists',
        tag: "//stands-app/tag.js",
        is: function(url, signalUrl) {
            return url.indexOf(signalUrl) > -1;
        }
    },
    elements: {
        iframeIdPrefix: '__stndz__'
    }
};

// for some reason Chrome sometimes doesn't load all files of the extension and it doesn't work, as reported by users
// this will check that the extension works and if not it will restart it
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