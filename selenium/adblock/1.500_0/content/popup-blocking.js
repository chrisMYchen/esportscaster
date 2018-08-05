function blockPopupsFunc(popupBlockMessage, showNotification, extensionId, rules) {
    var popupAllowedRegex = /^(http(s)?:)?\/\/([^\/]*\.)?(pinterest\.com|paid\.outbrain\.com|twitter\.com|paypal\.com|yahoo\.com|facebook\.com|linkedin\.com|salesforce\.com|amazon\.co|google\.co)/i;
    var popupAllowHosts = /^http(s):\/\/([^\/]*\.)?(search\.yahoo\.com|linkedin\.com|facebook\.com|drive\.google\.com)/i;
    var anchorPopupsExcludedHosts = { 'sh.st': true };
    var popupRegexRules = null;
    var stndz = {
        active: true,
        originalWindowOpen: window.open,
        originalDocumentCreateElement: document.createElement
    };

    function isPopup(url) {
        if (!url)
            return null;

        if (popupAllowedRegex.test(url))
            return false;

        if (popupRegexRules == null) {
            popupRegexRules = [];
            for (var i = 0; i < rules.length; i++) {
                popupRegexRules.push(new RegExp(rules[i], "i"));
            }
        }

        for (var i = 0; i < popupRegexRules.length; i++) {
            if (popupRegexRules[i].test(url))
                return true;
        }

        if (popupAllowHosts.test(location.href))
            return false;

        return null;
    }

    window.open = function() {
        if (stndz.active == false) {
            return stndz.originalWindowOpen.apply(window, arguments);
        }

        var popupArguments = arguments;
        var openPopupFunc = function() {
            return stndz.originalWindowOpen.apply(window, popupArguments);
        };

        var popupUrl = arguments.length >= 1 && arguments[0] && typeof arguments[0] == "string" ? arguments[0] : null;
        var block = isPopup(popupUrl);
        if (block) {
            showPopupNotificationWindow('ad-popup', popupUrl, openPopupFunc);
            return {};
        } else if (block == false) {
            return openPopupFunc();
        }

        if (popupUrl && popupUrl.indexOf('data:') == 0) {
            showPopupNotificationWindow('data-popup', popupUrl, openPopupFunc);
            return {};
        }

        var targetName = arguments.length >= 2 ? arguments[1] : null;
        if (targetName == '_parent' || targetName == '_self' || targetName == '_top')
            return openPopupFunc();

        if (!window.event)
            return openPopupFunc();

        if (popupUrl) {
            try {
                if (popupUrl.indexOf("/") == 0 && popupUrl.indexOf("//") != 0)
                    return openPopupFunc();

                var windowOpenUrl = new URL(popupUrl);
                if (windowOpenUrl.host.indexOf(window.location.host) > -1 || (windowOpenUrl.host != "" && window.location.host.indexOf(windowOpenUrl.host) > -1))
                    return openPopupFunc();
            } catch(e) { }
        }

        var currentTargetValid = window.event &&
            window.event.currentTarget &&
            window.event.currentTarget !== window &&
            window.event.currentTarget !== document &&
            window.event.currentTarget !== document.body;

        var targetValid = window.event &&
            window.event.target &&
            window.event.target.tagName == 'A' &&
            window.event.target.href.indexOf('http') == 0;

        if (currentTargetValid || targetValid)
            return openPopupFunc();

        if (showNotification)
            showPopupNotificationWindow('not-user-initiated', popupUrl, openPopupFunc);

        return {};
    };

    document.createElement = function() {
        var element = stndz.originalDocumentCreateElement.apply(document, arguments);
        if (element.tagName == 'A') {
            var createTime = new Date();
            var handleAnchorClick = function(event) {
                if (stndz.active == false)
                    return;

                if (anchorPopupsExcludedHosts[document.location.host]) {
                    element.target = "_top";
                } else {
                    var now = new Date();
                    var block = isPopup(element.href);
                    if (block || (now - createTime < 50 && block == null && window.location.hostname.indexOf(element.hostname || null) == -1)) {
                        event.preventDefault();
                        showPopupNotificationWindow('create-link', element.href, function() { element.click(); });
                    }
                }
            };

            element.addEventListener('click', handleAnchorClick, true);
        }

        return element;
    };

    window.addEventListener("message", function(event) {
        switch (event.data.type) {
            case 'stndz-show-popup-notification':
                if (window !== window.top || stndz.active == false || event.data.iframeGuid != popupBlockMessage.iframeGuid)
                    return;

                stndz.stndzPopupActionWindow = event.source;
                stndz.stndzPopupClicked = function(option) {
                    stndz.hidePopupNotification();
                    stndz.stndzPopupActionWindow.postMessage({type: 'stndz-popup-action', option: option}, event.origin);
                };

                if (stndz.popupNotificationOpen) {
                    stndz.highlightPopupNotification();
                } else if (stndz.popupNotificationOpen === false) { // if it was previously opened just show it, the delegate to open the new window was created above
                    stndz.showPopupNotification();
                } else {
                    var notificationElement = createNotificationOnPage();

                    stndz.showPopupNotification = function() {
                        stndz.popupNotificationOpen = true;

                        notificationElement.style.top = '0px';

                        var hidePopupNotificationId;
                        stndz.hidePopupNotification = function() {
                            stndz.popupNotificationOpen = false;
                            notificationElement.style.top = '-40px';
                            notificationElement.style.height = '30px';
                            clearTimeout(hidePopupNotificationId);
                        };

                        hidePopupNotificationId = setTimeout(stndz.hidePopupNotification, 30 * 1000);
                        notificationElement.onmouseover = function() {
                            clearTimeout(hidePopupNotificationId);
                        };
                    };

                    var helpOpen = false;
                    var originalBackground = notificationElement.style.background;
                    stndz.highlightPopupNotification = function() {
                        notificationElement.style.background = '#FFFBCC';
                        setTimeout(function() {
                            notificationElement.style.background = originalBackground;
                        }, 1000);

                        notificationElement.style.height = '120px';
                        helpOpen = true;
                    };

                    stndz.togglePopupNotificationHelp = function() {
                        notificationElement.style.height = helpOpen ? '30px' : '120px';
                        helpOpen = !helpOpen;
                    };

                    stndz.showPopupNotification();
                }

                break;

            case 'stndz-popup-action':
                stndz.stndzPopupAction && stndz.stndzPopupAction(event.data.option);
                break;

            case 'stndz-popup-update':
                if (event.data.shutdown && event.data.machineId == popupBlockMessage.machineId && event.data.iframeGuid != popupBlockMessage.iframeGuid) {
                    stndz.active = false;
                } else if (event.data.iframeGuid == popupBlockMessage.iframeGuid && event.data.active != null) {
                    stndz.active = event.data.active;
                }
                break;
        }
    }, false);

    function showPopupNotificationWindow(blockType, popupUrl, openPopupFunc) {
        if (!showNotification)
            return;

        var popupHost = null;
        try {
            if (popupUrl == "about:blank") {
                popupHost = "about:blank";
            } else {
                var urlDetails = new URL(popupUrl);
                popupHost = urlDetails.host.indexOf('www.') == 0 ? urlDetails.host.substring(4) : urlDetails.host;
            }
        } catch(e) { }

        stndz.stndzPopupAction = function(option) {
            window.postMessage({
                type: 'popup-user-action',
                iframeGuid: popupBlockMessage.iframeGuid,
                popupHost: popupHost,
                popupUrl: popupUrl,
                option: option,
                blockType: blockType
            }, '*');

            if (option == 'once' || option == 'allow') {
                stndz.active = false;
                openPopupFunc && openPopupFunc();
            } else {
                showNotification = false;
            }
        };

        window.top.postMessage({
            type: 'stndz-show-popup-notification',
            iframeGuid: popupBlockMessage.iframeGuid
        }, '*');

        window.postMessage({
            type: 'popup-blocked',
            iframeGuid: popupBlockMessage.iframeGuid,
            blockType: blockType,
            popupHost: popupHost,
            popupUrl: popupUrl
        }, '*');
    }

    function createNotificationOnPage() {
        var style = document.createElement('style');
        style.textContent = '.stndz-popup-notification {' +
        'width: 670px;' +
        'height: 30px;' +
        'position: fixed;' +
        'overflow: hidden;' +
        'top: -40px;' +
        'margin: 0 auto;' +
        'z-index: 2147483647;' +
        'left: 0px;' +
        'right: 0px;' +
        'background: rgb(240, 240, 240);' +
        'border-radius: 0px 0px 5px 5px;' +
        'border: solid 1px #999999;' +
        'box-shadow: 0px 2px 5px #444444;' +
        'border-top: none; ' +
        'line-height: 31px;' +
        'font-size: 12px;' +
        'font-family: sans-serif;' +
        'color: #59595c;' +
        'text-align: center;' +
        'direction: ltr;' +
        'transition-duration: 500ms;}' +
        '.stndz-button {' +
        'all: unset;' +
        'padding: 3px 15px !important;' +
        'border: solid 1px #a4a6aa !important;' +
        'height: 25px !important;' +
        'border-radius: 5px !important;' +
        'background-color: #3058b0 !important;' +
        'background: linear-gradient(#f5f5f5, #dfdfdf) !important;' +
        'box-shadow: inset 0px 1px 0px #ffffff, inset 0 -1px 2px #acacac !important;' +
        'color: #555555 !important;' +
        'font-size: 12px !important;' +
        'line-height: 16px !important;' +
        'font-family: sans-serif !important;' +
        'text-align: center !important;' +
        'background-repeat: no-repeat !important;' +
        'text-decoration: none !important;}' +
        '.stndz-button:hover{' +
        'all: unset;' +
        'background: linear-gradient(#eeeeee, #d1d1d1) !important;' +
        'text-decoration: none !important;' +
        'color: #555555 !important;}';
        document.documentElement.appendChild(style);

        var div = document.createElement('div');
        div.setAttribute('class', 'stndz-popup-notification');
        div.innerHTML = '<img src="chrome-extension://' + extensionId + '/views/web_accessible/images/icon.png" style="top: 5px; left: 5px;height: 20px; display: initial;position: absolute;">' +
        '&nbsp;<b>Site Popup Blocked:</b>' +
        '&nbsp;&nbsp;<a href="javascript:void(0)" id="stndz-popup-allow-once" class="stndz-button">Allow once</a>' +
        '&nbsp;&nbsp;<a href="javascript:void(0)" id="stndz-popup-allow" class="stndz-button">Allow always</a>' +
        '&nbsp;&nbsp;<a href="javascript:void(0)" id="stndz-popup-block" class="stndz-button">Block always</a>' +
        '&nbsp;&nbsp;&nbsp;&nbsp;<a href="javascript:void(0)" id="stndz-popup-help"><img src="chrome-extension://' + extensionId + '/views/web_accessible/images/help.png" style="opacity: 0.3; position: absolute; top: 7px; display: initial;right: 30px;" /></a>' +
        '&nbsp;<a href="javascript:void(0)" id="stndz-popup-close"><img src="chrome-extension://' + extensionId + '/views/web_accessible/images/close.png" style="opacity: 0.3; position: absolute; top: 7px; display: initial;right: 7px;" /></a>' +
        '<br /><div style="line-height: 22px; text-align: left; padding: 0px 5px 0px 5px; font-size: 11px;">The site tried to open a popup and Stands blocked it.' +
        '<br />if you don\'t trust this site you should click <b>"Block always"</b>, if you do click <b>"Allow always"</b>.' +
        '<br />If you\'re not sure click <b>"Allow once"</b> which will open the popup and pause popup blocking for the current page visit.' +
        '<br />You can always change your settings in the application window.</div>';
        document.body.appendChild(div);

        document.getElementById("stndz-popup-allow-once").addEventListener("click", function(event) { event.preventDefault(); stndz.stndzPopupClicked("once") }, true);
        document.getElementById("stndz-popup-allow").addEventListener("click", function(event) { event.preventDefault(); stndz.stndzPopupClicked("allow") }, true);
        document.getElementById("stndz-popup-block").addEventListener("click", function(event) { event.preventDefault(); stndz.stndzPopupClicked("block") }, true);
        document.getElementById("stndz-popup-help").addEventListener("click", function(event) { event.preventDefault(); stndz.togglePopupNotificationHelp() }, true);
        document.getElementById("stndz-popup-close").addEventListener("click", function(event) { event.preventDefault(); stndz.hidePopupNotification(); }, true);

        return div;
    }

    try {
        Object.defineProperty(window,"ExoLoader",{configurable:false,get:function(){return null;},set:function(){return null;}});
        Object.defineProperty(window,"_pao",{configurable:false,get:function(){throw '';},set:function(){throw '';}});

        Object.defineProperty(window,"BetterJsPop",{configurable:false,get:function(){throw '';},set:function(){throw '';}});
        Object.defineProperty(window,"popnsKiller",{configurable:false,get:function(){throw '';},set:function(){throw '';}});
        Object.defineProperty(window,"popns",{configurable:false,get:function(){return 'popnsKiller';},set:function(){return 'popnsKiller';}});
    } catch(e) {}
}