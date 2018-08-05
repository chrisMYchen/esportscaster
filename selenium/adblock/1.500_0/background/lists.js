var blockingRules = new blockingRulesService();
var popupRules = new popupRulesService();
var cssRules = {};
var jsRules = {};
var whitelist = {};
var detectionSites = {};
var malwareFileDetectionSettings = {
    on: true,
    auth: {},
    authOn: {}
};

var blockingRulesUpdatingData = new updatingDataFromServer({
    dataName: 'blockingRules',
    expirationMinutes: 60,
    resourceUrl: stndz.resources.blockingRules,
    onUpdate: function(arr) {
        if (!arr || !arr.length) {
            updateUserAttributes({
                blockingRulesEmpty: getUtcDateAndMinuteString(utcTimeGetter())
            });
            return;
        }

        var result = new blockingRulesService();
        for (var i = 0; i < arr.length; i++) {
            var rule = arr[i];
            result.add(rule.host, rule.regex, rule.typeId, rule.collect, rule.keepCookies, rule.cancel ? true : false);
        }

        blockingRules = result;
    }
});

var cssRulesUpdatingData = new updatingDataFromServer({
    dataName: 'cssRules',
    expirationMinutes: 60,
    resourceUrl: stndz.resources.cssRules,
    onUpdate: function(arr) {
        if (arr.length == 0)
            return;

        var result = {};
        for (var i = 0; i < arr.length; i++) {
            result[arr[i].host] = arr[i].css;
        }

        cssRules = result;
    }
});

var popupRulesUpdatingData = new updatingDataFromServer({
    dataName: 'popupRules',
    expirationMinutes: 60,
    resourceUrl: stndz.resources.popupRules,
    onUpdate: function(arr) {
        if (arr.length == 0)
            return;

        var result = new popupRulesService();
        for (var i = 0; i < arr.length; i++) {
            var newVersion = typeof arr[i] != "string";
            result.addToList(newVersion ? arr[i].regex : arr[i]);
            newVersion && result.addRule(arr[i].regex, arr[i].typeId);
        }

        popupRules = result;
    }
});

var jsRulesUpdatingData = new updatingDataFromServer({
    dataName: 'jsRules',
    expirationMinutes: 60,
    resourceUrl: stndz.resources.jsRules,
    onUpdate: function(arr) {
        if (arr.length == 0)
            return;

        var result = {};
        for (var i = 0; i < arr.length; i++) {
            result[arr[i].host] = {
                code: arr[i].js,
                params: arr[i].params ? arr[i].params : jsRules[arr[i].host] && jsRules[arr[i].host].params ? jsRules[arr[i].host].params : {}
            };

            arr[i].params = result[arr[i].host].params;
        }

        jsRules = result;
    }
});

var whitelistUpdatingData = new updatingDataFromServer({
    dataName: 'whitelist',
    expirationMinutes: 60,
    resourceUrl: stndz.resources.whitelist,
    onUpdate: function(arr) {
        if (arr.length == 0)
            return;

        var result = {};
        for (var i = 0; i < arr.length; i++) {
            if (typeof arr[i] == "string") {
                result[arr[i]] = true;
            } else {
                result[arr[i].host] = true;
            }
        }

        whitelist = result;
    }
});

var malwareFileDetectionSettingsUpdatingData = new updatingDataFromServer({
    dataName: 'malwareFileDetectionSettings',
    expirationMinutes: 60,
    resourceUrl: stndz.resources.detectionSettings,
    onUpdate: function(obj) {
        malwareFileDetectionSettings.on = obj.on;
        malwareFileDetectionSettings.auth = obj.auth;
        malwareFileDetectionSettings.authOn = obj.authOn;
    }
});

var extensionNotifications = new function() {
    var that = this;
    var suppressTime = new Date('2015-01-01');
    var lastNotification = null;
    var lsKey = "notifications";
    this.list = {};

    getLayeredStorageValue(lsKey, function(exists, data) {
        if (exists)
            loadNotification(data);
    });

    function loadNotification(data) {
        for (var key in data) {
            var notificationTime = new Date(data[key]);
            that.list[key] = notificationTime;
            lastNotification = lastNotification == null || notificationTime > lastNotification ? notificationTime : lastNotification;
        }
    }

    this.supressNotification = function(notificationKey) {
        that.list[notificationKey] = suppressTime;
    };

    this.markAsSeen = function(notificationKey) {
        var notificationTime = utcTimeGetter();
        that.list[notificationKey] = notificationTime;
        lastNotification = lastNotification == null || notificationTime > lastNotification ? notificationTime : lastNotification;

        var listToStore = {};
        for (var key in that.list) {
            listToStore[key] = getUtcDateAndMinuteString(that.list[key]);
        }

        setSingleLayeredStorageValue(lsKey, listToStore);
    };

    this.wasSeen = function(notificationKey) {
        return that.list[notificationKey] != null;
    };

    this.lastSeenInMinutes = function(notificationKey) {
        if (that.list[notificationKey]) {
            return Math.floor((new Date()-new Date(that.list[notificationKey]))/(1000*60));
        }

        return null;
    };

    this.canShowNotifications = function() {
        return lastNotification == null || !isLastMinutes(lastNotification, 60 * 24 * 3);
    }
};

var deactivatedSites = {
    add: function(host) {
        deactivatedSites.hosts[host] = true;
        deactivatedSites.save();
    },
    remove: function(host) {
        delete deactivatedSites.hosts[host];
        deactivatedSites.save();
    },
    init: function() {
        getLayeredStorageValue('deactivatedSites', function(exists, hosts) {
            if (exists)
                deactivatedSites.hosts = hosts;
        });
    },
    save: function() {
        setSingleLayeredStorageValue('deactivatedSites', deactivatedSites.hosts);
    },
    hosts: { }
};


// true means block a site's popups, false means allow popups
var popupSites = {
    add: function(host, block) {
        popupSites.hosts[host] = block;
        popupSites.save();
    },
    remove: function(host) {
        popupSites.hosts[host] = null;
        popupSites.save();
    },
    init: function() {
        getLayeredStorageValue('popupSites', function(exists, hosts) {
            if (exists)
                popupSites.hosts = hosts;
        });
    },
    save: function() {
        setSingleLayeredStorageValue('popupSites', popupSites.hosts);
    },
    hosts: { }
};

// custom blocking rules created by the user
var customCssRules = new function() {
    var that = this;
    var urlPatterns = null;
    var storageKey = 'customCssRules';
    this.hosts = {};

    function calculateUrlPatterns() {
        urlPatterns = [];
        if (Object.keys(that.hosts).length > 0) {
            for (var host in that.hosts) {
                urlPatterns.push("*://" + host + "/*");
                urlPatterns.push("*://www." + host + "/*");
            }
        }
    }

    this.add = function(host, selector) {
        if (!that.hosts[host])
            that.hosts[host] = [];

        that.hosts[host].push(selector);
        that.save();
    };

    this.remove = function(host, selector) {
        if (that.hosts[host]) {
            var index = that.hosts[host].indexOf(selector);
            index > -1 && that.hosts[host].splice(index, 1);

            if (that.hosts[host].length == 0)
                delete that.hosts[host];
        }

        that.save();
    };

    this.save = function() {
        calculateUrlPatterns();
        setSingleLayeredStorageValue(storageKey, that.hosts);
    };

    this.getUrlPatterns = function() {
        return urlPatterns;
    };

    this.hostExists = function(host) {
        return that.hosts[host] != null;
    };

    function loadCustomCssRules() {
        getLayeredStorageValue(storageKey, function(exists, data) {
            if (exists) {
                that.hosts = data;
                calculateUrlPatterns();
            }
        });
    }

    loadCustomCssRules();
};

function blockingRulesService() {
    var that = this;
    this.count = 0;
    this.hosts = {};
    this.generic = [];

    this.add = function(host, regex, typeId, collectRegex, keepCookies, cancel) {
        var dotIndex = host.indexOf(".");
        var isHost = dotIndex > 0 && dotIndex < host.length-1;
        if (isHost) {
            var hostRegex = '^http(s)?:\\/\\/([^\\/]*\\.)?' + host.replace(/\./g, '\\.');
            var isHostMatch = !regex || regex == hostRegex ? true : false;

            that.hosts[host] = {
                expression: isHostMatch ? null : new RegExp(regex, 'i'),
                hostMatch: isHostMatch,
                typeId: typeId,
                collect: collectRegex ? new RegExp(collectRegex, 'i') : null,
                keepCookies: keepCookies === true,
                cancel: cancel
            };
        } else if (regex && regex.length >= 10) {
            that.generic.push({
                expression: new RegExp(regex, 'i'),
                typeId: typeId,
                collect: collectRegex ? new RegExp(collectRegex, 'i') : null,
                cancel: cancel
            });
        }

        that.count++;
    };

    this.check = function(host, url) {
        var key = host;
        var rule;
        while (true) {
            rule = that.hosts[key];
            if (rule && (rule.hostMatch || (rule.expression && rule.expression.test(url)))) {
                var collect = rule.typeId == stndz.blockTypes.collect || rule.typeId == stndz.blockTypes.collectPageView;
                collect = collect || (rule.collect ? rule.collect.test(url) : false);

                return {
                    block: ((stndz.settings.blockAds && rule.typeId == stndz.blockTypes.adServer) ||
                            (stndz.settings.blockTracking && rule.typeId == stndz.blockTypes.tracker) ||
                            (stndz.settings.blockMalware && rule.typeId == stndz.blockTypes.malware) ||
                            (stndz.settings.blockSponsoredStories && rule.typeId == stndz.blockTypes.sponsored)),
                    typeId: rule.typeId,
                    collect: collect,
                    cancel: rule.cancel
                };
            }

            var dotIndex = key.indexOf('.');
            if (dotIndex == -1)
                break;

            key = key.substring(dotIndex + 1);
        }

        for (var i in that.generic) {
            rule = that.generic[i];
            if (rule.expression.test(url))
                return {
                    block: ((stndz.settings.blockAds && rule.typeId == stndz.blockTypes.adServer) ||
                            (stndz.settings.blockTracking && rule.typeId == stndz.blockTypes.tracker) ||
                            (stndz.settings.blockMalware && rule.typeId == stndz.blockTypes.malware) ||
                            (stndz.settings.blockSponsoredStories && rule.typeId == stndz.blockTypes.sponsored)),
                    typeId: rule.typeId,
                    collect: rule.typeId == stndz.blockTypes.collect ? true : (rule.collect ? rule.collect.test(url) : false),
                    cancel: rule.cancel
                };
        }

        return {
            block: false
        };
    };

    this.getHosts = function() {
        var result = [];
        for (var host in that.hosts) {
            if (!that.hosts[host].keepCookies)
                result.push(host);
        }

        return result;
    };
}

function popupRulesService() {
    var that = this;
    this.list = [];
    this.rules = [];
    this.closeRules = [];

    this.addToList = function(regex) {
        that.list.push(regex);
    };

    this.addRule = function(regex, typeId) {
        var rule = {
            regex: new RegExp(regex, "i"),
            typeId: typeId
        };

        that.rules.push(rule);
        typeId == stndz.popupRuleTypes.generalAndClose && that.closeRules.push(rule);
    };

    this.shouldClose = function(host) {
        for (var i = 0; i < that.closeRules.length; i++) {
            if (that.closeRules[i].regex.test(host))
                return true;
        }
        return false;
    };
}

function loadLists() {
    blockingRulesUpdatingData.start();
    cssRulesUpdatingData.start();
    popupRulesUpdatingData.start();
    jsRulesUpdatingData.start();
    whitelistUpdatingData.start();
    malwareFileDetectionSettingsUpdatingData.start();
    deactivatedSites.init();
    popupSites.init();

    jobRunner.run('detection-sites', function() {
        callUrl({ url: stndz.resources.detectionSites }, function(data) {
            for (var host in detectionSites) {
                if (data[host]) {
                    data[host].hostsToReport = detectionSites[host].hostsToReport;
                }
            }

            for (var host in data) {
                if (!data[host].hostsToReport) {
                    data[host].hostsToReport = {};
                }
            }

            detectionSites = data;
        });
    }, 60 * 60, true);
}


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