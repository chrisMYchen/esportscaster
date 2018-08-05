window.addEventListener("message", handleWindowMessages, false);
function stopHandlingWindowMessages() {
    window.removeEventListener("message", handleWindowMessages, false);
}

function handleWindowMessages(event) {
    if (event.data && event.data.type == stndz.messages.contentScriptVersionUpgrade && event.data.machineId == pageData.machineId && event.data.iframeGuid != iframeGuid) {
        shutdownBecauseOfUpgrade();
        return;
    }

    if (event.data && event.data.iframeGuid == iframeGuid) {
        if (event.data.type == stndz.messages.popupUserAction) {

            sendMessageToBackground({
                type: stndz.messages.popupUserAction,
                hostAddress: pageData.hostAddress,
                site: pageData.site,
                topHostAddress: pageData.topHostAddress,
                url: encodeURIComponent(window.location.href),
                popupHost: event.data.popupHost,
                popupUrl: event.data.popupUrl ? encodeURIComponent(event.data.popupUrl) : null,
                option: event.data.option,
                blockType: event.data.blockType
            });

        } else if (event.data.type == stndz.messages.popupBlocked) {

            sendMessageToBackground({
                type: stndz.messages.popupBlocked,
                eventTypeId: stndz.logEventTypes.popupBlocked,
                data: {
                    hostAddress: pageData.hostAddress,
                    site: pageData.site,
                    topHostAddress: pageData.topHostAddress,
                    url: encodeURIComponent(window.location.href),
                    blockType: event.data.blockType,
                    popupHost: event.data.popupHost,
                    popupUrl: event.data.popupUrl ? encodeURIComponent(event.data.popupUrl) : null
                }
            });

        } else if (event.data.type == 'ad-block-wall') {
            sendMessageToBackground({
                type: stndz.messages.adBlockWall,
                host: pageData.hostAddress,
                url: event.data.url
            });
        }

        return;
    }

    if (!event.origin.match(/^http(s)?:\/\/(.*\.)?(localhost|lgblnfidahcdcjddiepkckcfdhpknnjh|lngjmaohjfjlmbggeodkgpokfbdemejg|standsapp.org|stndz.com)(:\d*)?/i))
        return;

    switch (event.data.type) {
        case 'check-stands-request':
            window.postMessage({ type: 'check-stands-response' }, '*');
            break;

        case stndz.messages.updateUser:
            sendMessageToBackground(event.data, function(result) {
                window.postMessage({ type: 'update-user-response', requestId: event.data.requestId, result: result }, '*');
            });
            break;

        case stndz.messages.getUserData:
            sendMessageToBackground(event.data, function(userData) {
                window.postMessage({ type: stndz.messages.getUserData + '-response', userData: userData }, '*');
            });
            break;

        case stndz.messages.getUserSettings:
            sendMessageToBackground(event.data, function(settings) {
                window.postMessage({ type: stndz.messages.getUserSettings + '-response', settings: settings }, '*');
            });
            break;

        case stndz.messages.updateUserSettings:
            sendMessageToBackground(event.data, function(result) {
                window.postMessage({ type: stndz.messages.updateUserSettings + '-response', requestId: event.data.requestId, result: result }, '*');
            });
            break;

        case stndz.messages.getAppData:
            sendMessageToBackground(event.data, function(stats) {
                window.postMessage({ type: stndz.messages.getAppData + '-response', stats: stats }, '*');
            });
            break;

        case stndz.messages.getDashboardData:
            sendMessageToBackground(event.data, function(data) {
                window.postMessage({ type: stndz.messages.getDashboardData + '-response', data: data }, '*');
            });
            break;

        case stndz.messages.setDashboardData:
            sendMessageToBackground(event.data, function() {
                window.postMessage({ type: stndz.messages.setDashboardData + '-response' }, '*');
            });
            break;

        case stndz.messages.getBlockingData:
            sendMessageToBackground(event.data, function(data) {
                window.postMessage({ type: stndz.messages.getBlockingData + '-response', data: data }, '*');
            });
            break;

        case stndz.messages.disableAdBlockers:
            sendMessageToBackground(event.data, function(disabled) {
                window.postMessage({ type: stndz.messages.disableAdBlockers + '-response', requestId: event.data.requestId, disabled: disabled }, '*');
            });
            break;

        case stndz.messages.getAdBlocker:
            sendMessageToBackground(event.data, function(data) {
                window.postMessage({ type: stndz.messages.getAdBlocker + '-response', adBlockerData: data }, '*');
            });
            break;

        case stndz.messages.deactivatedSitesRequest:
            sendMessageToBackground(event.data, function(success) {
                window.postMessage({ type: 'deactivated-sites-response', requestId: event.data.requestId, success: success }, '*');
            });
            break;

        case stndz.messages.popupSitesRequest:
            sendMessageToBackground(event.data, function(success) {
                window.postMessage({ type: 'popup-sites-response', requestId: event.data.requestId, success: success }, '*');
            });
            break;

        case stndz.messages.refreshUserData:
            sendMessageToBackground(event.data, function() {
                window.postMessage({ type: stndz.messages.refreshUserData + '-response', requestId: event.data.requestId }, '*');
            });
            break;

        case stndz.messages.undoBlockedElements:
            sendMessageToBackground(event.data, function() {
                window.postMessage({ type: stndz.messages.undoBlockedElements + '-response', requestId: event.data.requestId }, '*');
            });
            break;

        case stndz.messages.countBlockedElements:
            sendMessageToBackground(event.data, function(count) {
                window.postMessage({ type: stndz.messages.countBlockedElements + '-response', count: count }, '*');
            });
            break;

        case stndz.messages.refreshCurrentTab:
        case stndz.messages.reportIssue:
        case stndz.messages.blockElement:
            sendMessageToBackground(event.data);
            break;
    }
}