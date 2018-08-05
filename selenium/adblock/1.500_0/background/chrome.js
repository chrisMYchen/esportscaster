var fairAdsExtensionId = "gagfkmknmijppikpcikmbbkdkhggcmge";
var noneWindowId = chrome.windows.WINDOW_ID_NONE;
var extensionId = chrome.runtime.id;
var chromeAppId = "dcnofaichneijfbkdkghmhjjbepjmble";
var managementPermissionsExists;
var contextMenuPermissionsExists;

function registerToAllEvents() {
    try {
        chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, {urls: ["http://*/*", "https://*/*"]}, ["blocking"]);
        chrome.webRequest.onErrorOccurred.addListener(onRequestError, {urls: ["http://*/*", "https://*/*"]});
        chrome.webRequest.onBeforeRedirect.addListener(onBeforeRedirect, {urls: ["http://*/*", "https://*/*"]});
        chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, {urls: ["http://*/*", "https://*/*"]}, ["blocking", "responseHeaders"]);
        chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigate);
        chrome.webNavigation.onCommitted.addListener(onCommited);
        chrome.webNavigation.onCreatedNavigationTarget.addListener(onCreatedNavigationTarget);
        chrome.runtime.onMessage.addListener(onMessage);
        chrome.runtime.onInstalled.addListener(onInstalled);
        chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);
        chrome.tabs.onActivated.addListener(onTabActivated);
        chrome.tabs.onRemoved.addListener(onTabRemoved);
        chrome.tabs.onUpdated.addListener(onTabUpdated);
        chrome.tabs.onCreated.addListener(onTabCreated);
        chrome.tabs.onReplaced.addListener(onTabReplaced);
        chrome.runtime.onConnect.addListener(function(port) {
            var disconnected = false;
            port.onMessage.addListener(function(msg) {
                var callbackCalled = false;
                var callback = function(response) {
                    if (callbackCalled === false) {
                        callbackCalled = true;
                        disconnected == false && port.postMessage(response);
                    }
                };

                var waitForCallback = onMessage(msg, port.sender, callback);
                if (!waitForCallback) {
                    callback();
                }
            });

            port.onDisconnect.addListener(function() {
                disconnected = true;
            });
        });

        chrome.runtime.onConnectExternal.addListener(function(port) {
            if (port.sender.id != fairAdsExtensionId)
                return;

            var disconnected = false;
            port.onMessage.addListener(function(msg) {
                var callbackCalled = false;
                var callback = function(response) {
                    if (callbackCalled === false) {
                        callbackCalled = true;
                        disconnected == false && port.postMessage(response);
                    }
                };

                var waitForCallback = onMessage(msg, port.sender, callback);
                if (!waitForCallback) {
                    callback();
                }
            });

            port.onDisconnect.addListener(function() {
                disconnected = true;
            });
        });

        // listen to external app\extensions checking if extension exists
        chrome.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {
            if (sender.id == fairAdsExtensionId)
                setEnableAds(true);

            if (request && request.exists) {
                sendResponse({ exists: true });
            }
        });

        chrome.notifications.onButtonClicked.addListener(onNotificationButtonClick);
        chrome.notifications.onClosed.addListener(onNotificationClosed);
        chrome.notifications.onClicked.addListener(onNotificationClick);
    } catch(e) {
        serverLogger.log(stndz.logEventTypes.clientError, {
            source: 'registerEvents',
            message: encodeURIComponent((e.message || '').replace('\n', '')),
            stack: encodeURIComponent((e.stack || '').replace('\n', ''))
        }).flush();
        updateUserAttributes({ startFail: true });
    }
}

function sendMessageToBackground(message, callback) {
    try {
        onMessage(message, null, callback);
    } catch(e) { }
}

function executeCodeOnTab(tabId, code, matchAboutBlank, callback, allFrames) {
    chrome.tabs.executeScript(tabId, {
        code: code,
        allFrames: allFrames != null ? allFrames : true,
        matchAboutBlank: matchAboutBlank === true
    }, function(results) {
        if (!chrome.runtime.lastError)
            callback && callback(results);
        else
            callback && callback([]);
    });
}

function executeFileOnTab(tabId, file, matchAboutBlank, callback, allFrames) {
    chrome.tabs.executeScript(tabId, {
        file: file,
        allFrames: allFrames != null ? allFrames : true,
        matchAboutBlank: matchAboutBlank === true
    }, function(results) {
        if (!chrome.runtime.lastError)
            callback && callback(results);
    });
}

function getStorageValue(key, callback) {
    try {
        chrome.storage.local.get(key, function(items) {
            if (chrome.runtime.lastError) {
                callback && callback(false, null, chrome.runtime.lastError.message);
            } else if (items[key] != null) {
                callback && callback(true, items[key]);
            } else {
                callback && callback(false);
            }
        });
    } catch(e) {
        callback && callback(false, null, e.message);
    }
}

function getLayeredStorageValue(key, callback) {
    getStorageValue(key, function(exists, value, error) {
        if (exists) {
            callback && callback(exists, value);
        } else {
            var lsValue = localStorageService.readJson(key);
            if (lsValue != null)
                callback && callback(true, lsValue);
            else
                callback && callback(false, null, error);
        }
    });
}

function getMultipleStorageValues(keys, callback) {
    try {
        chrome.storage.local.get(keys, function(items) {
            if (chrome.runtime.lastError) {
                callback && callback(false, null, chrome.runtime.lastError.message);
            } else {
                callback && callback(true, items);
            }
        });
    } catch (e) {
        callback && callback(false, null, e.message);
    }
}

function getMultipleLayeredStorageValues(keys, callback) {
    getMultipleStorageValues(keys, function(exists, items, error) {
        if (error) {
            callback && callback(false, null, error);
        } else {
            var itemsResponse = {};
            for (var key in keys) {
                if (items && items[key] != null) {
                    itemsResponse[key] = items[key];
                } else {
                    itemsResponse[key] = localStorageService.readJson(key);
                }
            }

            callback && callback(true, itemsResponse);
        }
    });
}

function setSingleStorageValue(key, value, callback) {
    var obj = {};
    obj[key] = value;
    setStorageValue(obj, callback);
}

function setSingleLayeredStorageValue(key, value, callback) {
    setSingleStorageValue(key, value, function(success, error) {
        if (success) {
            callback && callback(true);
        } else if (localStorageService.writeJson(key, value)) {
            callback && callback(true);
        } else {
            callback && callback(false, error);
        }
    });
}

var setStorageValueInProgress = false;
var setStorageValueQueue = [];
function setStorageValue(obj, callback) {
    if (setStorageValueInProgress) {
        setStorageValueQueue.push(function() {
            setStorageValue(obj, callback);
        });
        return;
    }

    var onFinish = function() {
        setStorageValueInProgress = false;
        if (setStorageValueQueue.length > 0) {
            var delegate = setStorageValueQueue.shift();
            runSafely(delegate);
        }
    };

    try {
        setStorageValueInProgress = true;
        chrome.storage.local.set(obj, function() {
            // run this first, so if the callback writes to storage it will be queued and data will be written to storage sequentially
            try {
                if (chrome.runtime.lastError) {
                    callback && callback(false, chrome.runtime.lastError.message);
                } else {
                    callback && callback(true);
                }
            } catch(e) { }

            onFinish();
        });
    } catch(e) {
        try {
            callback && callback(false, e.message);
        } catch(e2) {}

        onFinish();
    }
}

function removeStorageValue(key, callback) {
    try {
        chrome.storage.local.remove(key, function() {
            if (chrome.runtime.lastError) {
                callback && callback(false, chrome.runtime.lastError.message);
            } else {
                callback && callback(false);
            }
        });
    } catch(e) {
        callback && callback(false, e.message);
    }
}

function getSyncStorageValue(key, callback) {
    try {
        chrome.storage.sync.get(key, function(items) {
            if (chrome.runtime.lastError) {
                callback && callback(false, null, chrome.runtime.lastError.message);
            } else if (items[key]) {
                callback && callback(true, items[key]);
            } else {
                callback && callback(false);
            }
        });
    } catch(e) {
        callback && callback(false, null, e.message);
    }
}

function setSyncStorageValue(obj, callback) {
    try {
        chrome.storage.sync.set(obj, function() {
            if (chrome.runtime.lastError) {
                callback && callback(false, chrome.runtime.lastError.message);
            } else {
                callback && callback(true);
            }
        });
    } catch(e) {
        callback && callback(false, e.message);
    }
}

function getAllCookies(callback) {
    chrome.cookies.getAll({}, callback);
}

function removeCookie(url, name) {
    chrome.cookies.remove({ url: url, name: name });
}

function runOnActiveTab(callback) {
    chrome.tabs.query({
        active:true,
        currentWindow:true
    }, function(tabs) {
        callback && callback(tabs.length == 1 ? tabs[0] : null);
    });
}

var isNotificationAnimationRunning = false;
var notificationAnimationIntervalId;
function setAppIcon(disabled, notification) {
    if (notification) {
        showNotificationAnimation(disabled);
    } else {
        stopNotificationAnimationIfRunning();
        chrome.browserAction.setIcon({
            path: {
                19: "icons/19" + (disabled ? "_gray" : "") + ".png",
                38: "icons/38" + (disabled ? "_gray" : "") + ".png"
            }
        });
    }
}

function showNotificationAnimation(disabled) {
    stopNotificationAnimationIfRunning();
    isNotificationAnimationRunning = true;
    var animationDuration = 5800000;
    var animationIntervalDuration = 100;
    var animationStep = 0;
    notificationAnimationIntervalId = callEvery(function() {

        chrome.browserAction.setIcon({
            path: {
                19: "icons/animations/19" + (disabled ? "_gray" : "") + "_notification_" + animationStep + ".png",
                38: "icons/animations/38" + (disabled ? "_gray" : "") + "_notification_" + animationStep + ".png"
            }
        });

        animationStep = animationStep == 8 ? 0 : animationStep + 1;
        animationDuration -= animationIntervalDuration;
        if (animationDuration == 0) {
            stopNotificationAnimationIfRunning(disabled);
        }

    }, animationIntervalDuration);
}

function stopNotificationAnimationIfRunning(disabled) {
    if (isNotificationAnimationRunning && notificationAnimationIntervalId) {
        stopInterval(notificationAnimationIntervalId);
        isNotificationAnimationRunning = false;
        notificationAnimationIntervalId = null;
        setAppIcon(disabled, false);
    }
}

function setAppIconBadgeBackgroundColor() {
    chrome.browserAction.setBadgeBackgroundColor({ color: '#F04E30' });
}

function setAppIconBadgeTitle(title) {
    chrome.browserAction.setTitle({ title: title });
}

function setAppIconBadgeText(text) {
    chrome.browserAction.setBadgeText({ text: text });
}

function callIfTabExists(tabId, callback) {
    getTab(tabId, function(tab) {
        tab != null && callback(tab);
    });
}

function getTab(tabId, callback) {
    chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError) {
            callback();
        } else {
            callback(tab);
        }
    });
}

function queryTabs(filter, callback) {
    chrome.tabs.query(filter, callback);
}

function runOnAllTabs(func, callback) {
    queryTabs({ windowType: 'normal' }, function(tabs) {
        runEachSafely(tabs, func);
        callback && callback();
    });
}

function openTabWithUrl(url) {
    chrome.tabs.create({
        url: url,
        active: true
    });
}

function sendMessageToExtension(extensionId, message, callback) {
    chrome.runtime.sendMessage(extensionId, message, callback);
}

function createNotification(notificationId, options, callback) {
    chrome.notifications.create(notificationId, options, callback);
}

function clearNotification(notificationId, callback) {
    chrome.notifications.clear(notificationId, callback);
}

function updateTabUrl(tabId, url, active) {
    var props = { url: url };
    if (active != null)
        props.active = active;

    updateTab(tabId, props);
}

function updateTab(tabId, props, callback) {
    chrome.tabs.update(tabId, props, callback);
}

function reloadTab(tabId) {
    chrome.tabs.reload(tabId);
}

function closeTab(tabId, callback) {
    chrome.tabs.remove([tabId], function() {
        var error = chrome.runtime.lastError; // silent error
        callback && callback();
    });
}

function createContextMenu(details) {
    chrome.contextMenus.create(details);
}

function updateContextMenu(menuId, title, enabled, documentUrlPatterns) {
    hasContextMenuPermissions(function(exists) {
        if (exists) {
            var props = {
                enabled: enabled
            };

            if (title)
                props.title = title;

            if (documentUrlPatterns)
                props.documentUrlPatterns = documentUrlPatterns;

            chrome.contextMenus.update(menuId, props, function() {
                var error = chrome.runtime.lastError; // silent error
            });
        }
    });
}

function setUninstallUrlParams(txt) {
    if (chrome.runtime.setUninstallURL) {
        $st.onUserReady(function(userData) {
            chrome.runtime.setUninstallURL('https://app.standsapp.org/uninstall/' + userData.privateUserId + (txt ? "/?" + txt : "/"));
        });
    }
}

function hasManagamenetPermissions(callback) {
    if (managementPermissionsExists && chrome.management.getAll) {
        callback && callback(true);
        return;
    }

    hasPermission("management", function(exists) {
        managementPermissionsExists = exists;
        callback && callback(exists);
    });
}

function hasContextMenuPermissions(callback) {
    if (contextMenuPermissionsExists) {
        callback && callback(true);
        return;
    }

    hasPermission("contextMenus", function(exists) {
        contextMenuPermissionsExists = exists;
        callback && callback(exists);
    });
}

function hasPermission(permission, callback) {
    chrome.permissions.getAll(function(details) {
        for (var i in details.permissions) {
            if (details.permissions[i] == permission) {
                callback && callback(true);
                return;
            }
        }

        callback && callback(false);
    });
}

function requestPermission(permission, callback) {
    chrome.permissions.request({
        permissions: [permission]
    }, callback);
}

function getAllExtensions(callback) {
    chrome.management.getAll(callback);
}

function extensionExists(id, callback) {
    chrome.management.get(id, function() {
        if (chrome.runtime.lastError)
            callback && callback(id, false);
        else
            callback && callback(id, true);
    });
}

function disableExtension(id, callback) {
    chrome.management.setEnabled(id, false, callback);
}

function getAllFrames(tabId, callback) {
    chrome.webNavigation.getAllFrames({
        tabId: tabId
    }, callback);
}

function uninstallSelf() {
    chrome.management.uninstallSelf({
        showConfirmDialog: true
    });
}

function sendMessageToContent(tabId, message, callback, frameId) {
    setTimeout(function () {
        if (frameId != null)
            chrome.tabs.sendMessage(tabId, message, {frameId: frameId}, callback);
        else
            chrome.tabs.sendMessage(tabId, message, callback);
    }, 0);
}

function getRateUrl(id) {
    return "https://chrome.google.com/webstore/detail/" + id + "/reviews";
}

function getExtensionRelativeUrl(path) {
    return 'chrome-extension://' + chrome.runtime.id + path;
}

function getAppVersion() {
    return chrome.app.getDetails().version;
}

function getOperatingSystem(callback) {
    chrome.runtime.getPlatformInfo(function(details) {
        callback && callback(details.os);
    });
}

function getCurrentWindow(callback) {
    chrome.windows.getCurrent({windowTypes: ["normal"]}, function(win) {
        if (chrome.runtime.lastError)
            callback && callback();
        else
            callback && callback(win);
    });
}

function onFirstNormalWindowCreated(callback) {
    var firstNormalWindowCreatedCalled = false;
    chrome.windows.onCreated.addListener(function() {
        if (firstNormalWindowCreatedCalled == false) {
            firstNormalWindowCreatedCalled = true;
            callback && callback();
        }
    }, { windowTypes: [ "normal" ] });
}

function createWindow(details, callback) {
    chrome.windows.create(details, function(win) {
        if (!chrome.runtime.lastError)
            callback && callback(win);
    });
}

function updateWindow(id, details, callback) {
    chrome.windows.update(id, details, function(win) {
        if (!chrome.runtime.lastError)
            callback && callback(win);
    });
}

function removeWindow(id, callback) {
    chrome.windows.remove(id, function() {
        if (!chrome.runtime.lastError)
            callback && callback();
    });
}

function getCurrentWindowId() {
    return chrome.windows.WINDOW_ID_CURRENT;
}