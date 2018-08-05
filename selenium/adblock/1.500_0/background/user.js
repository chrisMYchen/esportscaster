function setupUser(userData, callback) {
    if (!userData)
        userData = { };

    if (!userData.attributes)
        userData.attributes = {};

    userData.privateUserId = createGuid();
    userData.publicUserId = createGuid().substring(0, 10);

    callUrl({
        url: stndz.resources.user,
        method: 'POST',
        data: userData
    }, function(data, obj) {
        if (data && data.privateUserId) {
            $st.setUserData(data, function(success, errorMessage) {
                callback && runSafely(function() {
                    callback({ success: true, publicUserId: data.publicUserId, storeUserError: errorMessage });
                });
            });
        } else {
            callback && runSafely(function() {
                callback({ success: false, reason: { message: 'bad data from server on create' }, publicUserId: userData.publicUserId, statusCode: obj.statusCode });
            });
        }
    }, function(reason, obj) {
        callback && runSafely(function() {
            callback({ success: false, reason: reason, publicUserId: userData.publicUserId, statusCode: obj.statusCode });
        });
    });
}

var failedUserAttributesUpdate = localStorageService.readJson('failedUserAttributesUpdate') || {};
var updateUserQueue = [];
var updateUserInProgress = false;
function updateUser(userData, callback, dontGetBackUser) {
    if (updateUserInProgress) {
        updateUserQueue.push(function() {
            updateUser(userData, callback, dontGetBackUser);
        });
        return;
    }

    updateUserInProgress = true;
    $st.onUserReady(function(currUserData) {
        userData.attributes = mergeObjects(userData.attributes || {}, failedUserAttributesUpdate);
        userData.privateUserId = currUserData.privateUserId;
        userData.publicUserId = currUserData.publicUserId;
        userData.attributes.mem = window.performance.memory.totalJSHeapSize/1000000;

        dontGetBackUser = dontGetBackUser == true;
        userData.dontGetBackUser = dontGetBackUser;

        // close settings object to make sure the right settings are sent
        // because it might change between the time the function was called to the time it was sent to the server
        // because call url runs one request at a time and it can be queued
        if (stndz.isSettingsDirty) {
            stndz.isSettingsDirty = false;
            userData.settings = JSON.parse(JSON.stringify(stndz.settings));
        } else if (userData.settings) {
            userData.settings = JSON.parse(JSON.stringify(userData.settings));
        }

        userData.settings && stndz.settingsMask.update();

        callUrl({
            url: stndz.resources.user,
            method: 'PUT',
            data: userData
        }, function(data, obj) {
            failedUserAttributesUpdate = {};
            localStorageService.remove('failedUserAttributesUpdate');
            stndz.isSettingsDirty = false;

            if (dontGetBackUser == false) {
                if (data && data.privateUserId) {
                    $st.setUserData(data);
                } else {
                    // bad data returned - fire callback with error
                    callback && runSafely(function() {
                        callback({ success: false, reason: { message: 'bad data from server on update' }, statusCode: obj.statusCode });
                    });
                    return;
                }
            }

            callback && runSafely(function() {
                callback({ success: true, publicUserId: userData.publicUserId });
            });
        }, function(reason, obj) {
            if (obj.statusCode == 0 && userData.attributes && Object.keys(userData.attributes).length > 0) {
                failedUserAttributesUpdate = mergeObjects(userData.attributes, failedUserAttributesUpdate);
                localStorageService.writeJson('failedUserAttributesUpdate', failedUserAttributesUpdate);
            }

            if (userData.settings)
                stndz.isSettingsDirty = true;

            callback && runSafely(function() {
                callback({ success: false, reason: reason, statusCode: obj.statusCode });
            });
        }, function() {
            updateUserInProgress = false;
            if (updateUserQueue.length > 0) {
                var delegate = updateUserQueue.shift();
                runSafely(delegate);
            }
        });
    });
}

function refreshUserDataIfExpired() {
    $st.onUserReady(function(userData) {
        if (isLastMinutes(userData.lastUpdated, 180) == false) {
            refreshUserData();
        }
    });
}

function refreshUserData(callback) {
    updateUser({}, function(result) {
        if (result.success) {
            sendMessageToBackground({ type: stndz.messages.userDataUpdated });
            callback && callback();
        }
    }, false);
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