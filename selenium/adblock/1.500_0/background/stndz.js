stndz.constants = {
    pauseConfirmedTime: "pauseConfirmedTime"
};

stndz.resources = {
    log: 'https://log.standsapp.org/log3.gif',
    blockingRules: 'https://app.standsapp.org/lists/blocking-rules/2',
    cssRules: 'https://app.standsapp.org/lists/css-rules',
    popupRules: 'https://app.standsapp.org/lists/popup-rules/2',
    jsRules: 'https://app.standsapp.org/lists/js-rules/2',
    whitelist: 'https://app.standsapp.org/lists/whitelist/4',
    user: 'https://app.standsapp.org/user',
    deactivatedSites: 'https://app.standsapp.org/user/deactivatedsites/[USERID]',
    reportStats: 'https://app.standsapp.org/user/stats/hourly',
    geo: 'https://app.standsapp.org/geolookup',
    detectionSites: 'https://app.standsapp.org/lists/detection-sites',
    detectionSettings: 'https://app.standsapp.org/lists/detection-settings',
    setReadNotification: 'https://app.standsapp.org/user/notification/[USERID]/[ID]'
};

stndz.iconBadgeTypes = {
    Donations: 'Donations',
    Blocks: 'Blocks',
    LoadTime: 'LoadTime',
    SaveTime: 'SaveTime'
};

stndz.iconBadgePeriods = {
    CurrentPage: 'CurrentPage',
    Today: 'Today',
    Disabled: 'Disabled'
};

stndz.suspectedMalwareBotActivity = false;
stndz.isSettingsDirty = false;
stndz.settings = {
    blockAds: true,
    blockTracking: true,
    blockMalware: true,
    blockPopups: true,
    maxAdsPerPage: 6,
    blockAdsOnFacebook: false,
    blockAdsOnSearch: false,
    blockSponsoredStories: false,
    blockWebmailAds: false,
    showBlockedPopupNotification: true,
    adsEnabled: false,
    iconBadgeType: stndz.iconBadgeTypes.Blocks,
    iconBadgePeriod: stndz.iconBadgePeriods.CurrentPage,
    geo: null,
    enabled: true,
    closePopups: true
};

stndz.settingsMask = {
    blockAds: 1,
    blockTracking: 2,
    blockMalware: 4,
    blockPopups: 8,
    blockAdsOnFacebook: 16,
    blockAdsOnSearch: 32,
    blockSponsoredStories: 64,
    blockWebmailAds: 128,
    mask: 0,
    update: function() {
        stndz.settingsMask.mask =
            (stndz.settings.blockAds ? stndz.settingsMask.blockAds : 0) |
            (stndz.settings.blockTracking ? stndz.settingsMask.blockTracking : 0) |
            (stndz.settings.blockMalware ? stndz.settingsMask.blockMalware : 0) |
            (stndz.settings.blockPopups ? stndz.settingsMask.blockPopups : 0) |
            (stndz.settings.blockAdsOnFacebook ? stndz.settingsMask.blockAdsOnFacebook : 0) |
            (stndz.settings.blockAdsOnSearch ? stndz.settingsMask.blockAdsOnSearch : 0) |
            (stndz.settings.blockSponsoredStories ? stndz.settingsMask.blockSponsoredStories : 0) |
            (stndz.settings.blockWebmailAds ? stndz.settingsMask.blockWebmailAds : 0);
    }
};

stndz.premium = {
    enabled: false,
    newTab: false,
    newTabCustomRedirect: null
};

stndz.blockTypes = {
    adServer: 1,
    tracker: 2,
    malware: 3,
    sponsored: 4,
    popup: 5,
    collect: 6,
    collectPageView: 7
};

stndz.trailTypes = {
    opener: 0,
    user: 1,
    client: 2,
    server: 3,
    javascript: 4,
    app: 5
};

stndz.popupRuleTypes = {
    general: 1,
    generalAndClose: 2
};

stndz.transitions = {
    ignore: 1,
    newTabTakeover: 2,
    searchTakeover: 3
};

var $st = new function() {
    var that = this;
    this.timeGetter = utcTimeGetter;

    var userData = null;
    var userDataLocalStorageKey = 'userData';
    var userReadyDelegates = [];

    this.setUserData = function(data, callback) {
        data.lastUpdated = that.timeGetter();
        internalSetUserData(data, callback);
    };

    this.getUserData = function(callback) {
        if (userData) {
            callback && callback(userData);
        } else {
            getLayeredStorageValue(userDataLocalStorageKey, function(exists, data, errorMessage) {
                if (exists) {
                    internalSetUserData(data);
                    callback && callback(userData);
                } else {
                    callback && callback(null, errorMessage);
                }
            });
        }
    };

    this.onUserReady = function(callback) {
        if (userData) {
            callback && callback(userData);
        } else {
            userReadyDelegates.push(callback);
        }
    };

    function internalSetUserData(data, callback) {
        convertStringDatesToDates(data);
        userData = data;
        setSingleLayeredStorageValue(userDataLocalStorageKey, JSON.parse(JSON.stringify(data)), callback);

        if (userData.settings) {
            stndz.settings.blockAds = userData.settings.blockAds != null ?  userData.settings.blockAds : stndz.settings.blockAds;
            stndz.settings.blockTracking = userData.settings.blockTracking != null ?  userData.settings.blockTracking : stndz.settings.blockTracking;
            stndz.settings.blockMalware = userData.settings.blockMalware != null ?  userData.settings.blockMalware : stndz.settings.blockMalware;
            stndz.settings.maxAdsPerPage = userData.settings.maxAdsPerPage != null ?  userData.settings.maxAdsPerPage : stndz.settings.maxAdsPerPage;
            stndz.settings.blockAdsOnFacebook = userData.settings.blockAdsOnFacebook != null ?  userData.settings.blockAdsOnFacebook : stndz.settings.blockAdsOnFacebook;
            stndz.settings.blockAdsOnSearch = userData.settings.blockAdsOnSearch != null ?  userData.settings.blockAdsOnSearch : stndz.settings.blockAdsOnSearch;
            stndz.settings.blockSponsoredStories = userData.settings.blockSponsoredStories != null ?  userData.settings.blockSponsoredStories : stndz.settings.blockSponsoredStories;
            stndz.settings.blockWebmailAds = userData.settings.blockWebmailAds != null ?  userData.settings.blockWebmailAds : stndz.settings.blockWebmailAds;
            stndz.settings.blockPopups = userData.settings.blockPopups != null ? userData.settings.blockPopups : stndz.settings.blockPopups;
            stndz.settings.adsEnabled = userData.settings.adsEnabled != null ? userData.settings.adsEnabled : stndz.settings.adsEnabled;
            stndz.settings.iconBadgeType = userData.settings.iconBadgeType != null ? userData.settings.iconBadgeType : stndz.settings.iconBadgeType;
            stndz.settings.iconBadgePeriod = userData.settings.iconBadgePeriod != null ? userData.settings.iconBadgePeriod : stndz.settings.iconBadgePeriod;
            stndz.settings.enabled = userData.settings.enabled != null ? userData.settings.enabled : stndz.settings.enabled;
            stndz.settings.closePopups = userData.settings.closePopups != null ? userData.settings.closePopups : stndz.settings.closePopups;
            stndz.suspectedMalwareBotActivity = userData.settings.suspectedMalwareBotActivity != null ? userData.settings.suspectedMalwareBotActivity : false;
            stndz.settingsMask.update();

            delete userData.settings;
        }

        runEachSafely(userReadyDelegates, function(callback) {
            callback(userData);
        });
        userReadyDelegates = [];
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