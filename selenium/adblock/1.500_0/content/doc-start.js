var currentWindow = window;
var currentDocument = currentWindow.document;
var iframeGuid = createGuid();
var pageData;
var pageDataReadyDelegates = [];
var pageDataUpdateDelegates = [];
var pageActionRunning = false;
var pageLoadedInDisabledState = false;
var pageActive = true;
var pubAdsKiller = 'if(window.googletag){var proxy=new Proxy(window.googletag,{get:function(a,b,c){return"pubads"==b||"display"==b?function(){return{}}:a[b]}});window.googletag=proxy}else{var pak;Object.defineProperty(window,"googletag",{configurable:!1,get:function(){return pak&&(pak.pubads=function(){return{}}),pak},set:function(a){return pak=a}})}';
var malwareKiller = 'var tmp;Object.defineProperty(window, "websredir",{configurable:false,get:function(){return tmp;},set:function(obj){if(obj instanceof Array)throw "";else tmp=obj;return tmp;}});';
var suppressUnloadScript = 'window.onbeforeunload=null;Object.defineProperty(window, "onbeforeunload",{configurable:false,get:function(){},set:function(){}});';
var basePageJs = '(function(){' + pubAdsKiller + malwareKiller + '})();';

sendMessageToBackground({ type: stndz.messages.pageData, url: location.href }, initPage, true);

if (window.top == window) {
    document.onreadystatechange = function() {
        if (document.readyState == "interactive") {
            document.onreadystatechange = null;
            callIn(reportPageInteractive, 0);
        }
    };
}

function reportPageInteractive() {
    sendMessageToBackground({
        type: stndz.messages.pageLoadCompleted,
        ms: window.performance.timing.domInteractive - window.performance.timing.navigationStart
    });
}

function onPageDataReady(delegate) {
    if (pageData) {
        delegate();
    } else {
        pageDataReadyDelegates.push(delegate);
    }
}

function onPageDataUpdate(delegate) {
    pageDataUpdateDelegates.push(delegate);
}

function initPage(message) {
    if (message) {
        message.isEnabled && !message.isDeactivated && !message.isStndzFrame && setPageData(message.pageData);
        message.isStndzFrame && clearLocalStorageIfExpired();
        pageLoadedInDisabledState = !message.pageData.hasStands;
    }
}

function setPageData(data) {
    pageData = data;
    while (pageDataReadyDelegates.length > 0) {
        runSafely(pageDataReadyDelegates.pop());
    }

    if (!pageData.isWhitelisted) {
        collapseBlockedElements();
    }

    currentWindow.styleElement = currentDocument.getElementById('stndz-style') || currentDocument.createElement('style');
    if (!currentWindow.styleElement.parentElement) {
        currentWindow.styleElement.id = 'stndz-style';
        addElementToHead(currentWindow.styleElement);
    }

    setPageCss(pageData, pageData.customCss);
    pageData.blockPopups && !pageData.isTested && blockPopups(pageData.showBlockedPopupNotification);

    var pageJs = (pageData.js ? "(function(iframeGuid, params){" + pageData.js + "})('" + iframeGuid + "', " + JSON.stringify(pageData.jsParams ? pageData.jsParams : {}) + ");" : "") + (pageData.suppressUnload ? suppressUnloadScript : "");
    addScriptToHead(basePageJs + pageJs);
}

function updatePageData(data) {
    var previousPageData = pageData;
    pageData = data;

    setPageCss(pageData, pageData.customCss);

    if (pageData.blockPopups && !previousPageData.blockPopups)
        blockPopups(pageData.showBlockedPopupNotification);
    else if (!pageData.blockPopups && previousPageData.blockPopups)
        stopBlockingPopups();

    for (var i = 0; i < pageDataUpdateDelegates.length; i++) {
        pageDataUpdateDelegates[i](pageData, previousPageData);
    }
}

registerToMessages(function(message, sender, sendResponse) {
    switch (message.type) {

        case stndz.messages.hideElement:
            var retry = 3;
            var hideInterval = setInterval(function() {
                retry--;
                var result = markAndHideElement(currentDocument, message.url, message.tag);
                if (!result) {
                    var iframes = currentDocument.getElementsByTagName('iframe');
                    forEach(iframes, function(iframe) {
                        try {
                            result = markAndHideElement(iframe.contentDocument, message.url, message.tag);
                        } catch(e) {}
                    });
                }

                if (result || retry == 0)
                    clearInterval(hideInterval);
            }, 300);
            break;

        case stndz.messages.reportIssueForm:
            currentWindow == currentWindow.top && openReportIssueForm(message.source);
            break;

        case stndz.messages.updatePageData:
            if (pageData) {
                updatePageData(message.pageData);
            } else {
                pageLoadedInDisabledState = true;
                initPage(message);
                hideAllRelevantElements(currentDocument);
            }
            break;
    }
});

var popupScriptEmbedded = false;
function blockPopups(showNotification) {
    var scriptContent = popupScriptEmbedded ? 'window.postMessage({type: "stndz-popup-update", iframeGuid: "' + iframeGuid + '", active: true}, "*");' :
        '(' + blockPopupsFunc.toString() + ')(' + JSON.stringify({ type: stndz.messages.popupUserAction, machineId: pageData.machineId, iframeGuid: iframeGuid }) + ',' + showNotification.toString() + ', \'' + extensionId + '\', ' + JSON.stringify(pageData.popupRules) + ');';
    addScriptToHead(scriptContent);
    popupScriptEmbedded = true;
}

function stopBlockingPopups() {
    addScriptToHead('window.postMessage({type: "stndz-popup-update", iframeGuid: "' + iframeGuid + '", active: false}, "*");');
}

function shutdownBlockingPopups() {
    addScriptToHead('window.postMessage({type: "stndz-popup-update", machineId: "' + pageData.machineId + '", iframeGuid: "' + iframeGuid + '", shutdown: true}, "*");');
}

function markAndHideElement(doc, url, tag) {
    var elements = doc.getElementsByTagName(tag);
    for (var i = 0; i < elements.length; i++) {
        var element = elements[i];
        if (isElementByUrl(element, url) && !hasAttribute(element, stndz.attributes.blockedAdElement)) {

            hideElement(element);
            if (element.parentNode && element.parentNode.tagName == 'A')
                hideElement(element.parentNode);

            return true;
        }
    }

    return false;
}

function collapseBlockedElements() {
    var blockedElements = currentDocument.querySelectorAll('[' + stndz.attributes.blockedAdElement + ']');
    for (var i = 0; i < blockedElements.length; i++) {
        setAttribute(blockedElements[i], 'style', 'display: none !important;' + ifnull(getAttribute(blockedElements[i], 'style'), ''));
    }
}

function hideElement(element) {
    var hideMethod = pageData && !pageData.isWhitelisted ? 'display: none !important' : 'visibility: hidden !important';
    setAttribute(element, 'style', hideMethod + ';' + ifnull(getAttribute(element, 'style'), ''));
    setAttribute(element, stndz.attributes.blockedAdElement);
}

function isElementByUrl(element, url) {
    try {
        switch (element.tagName) {
            case 'IMG':
            case 'IFRAME':
                return stripProtocolFromUrl(element.src) === stripProtocolFromUrl(url);
            default:
                return false;
        }
    } catch(e) {
        return false;
    }
}

function setPageCss(pageData, customCss) {
    var result = (pageData.css ? pageData.css : '') + (customCss ? customCss : '');

    if (pageData.blockAdsOnSearch && currentWindow == currentWindow.top)
        result += searchCss();

    if (pageData.isSponsoredStoriesBlocked)
        result += sponsoredStoriesCss();

    if (pageData.blockWebmailAds)
        result += webmailCss();

    currentWindow.styleElement.textContent = result;
}

function clearPageCss() {
    document.head.removeChild(currentWindow.styleElement);
}

function searchCss() {
    if (currentDocument.location.host.indexOf('google.') > -1) {
        return '.ads-ad, ._Ak { display: none !important; }';
    } else if (currentDocument.location.host.indexOf('search.yahoo.com') > -1) {
        return '#main > div > ol { display: none; } #main > div > ol[class*="searchCenterFooter"] { display: initial !important; } #right { display: none !important; } ';
    }

    return '';
}

function sponsoredStoriesCss() {
    if (endsWith(currentDocument.location.host, '.yahoo.com')) {
        return '.moneyball-ad, .js-stream-ad, .js-stream-featured-ad, .featured-ads, .media-native-ad, #td-applet-ads_container, div[class*="js-sidekick-item"][data-type="ADS"] { display: none !important; } ';
    }

    var css = 'div[class*="item-container-obpd"], a[data-redirect*="paid.outbrain.com"], a[onmousedown*="paid.outbrain.com"] { display: none !important; } a div[class*="item-container-ad"] { height: 0px !important; overflow: hidden !important; position: absolute !important; } '; // outbrain
    css += 'div[data-item-syndicated="true"] { display: none !important; } '; // taboola
    css += '.grv_is_sponsored { display: none !important; } '; // gravity
    css += '.zergnet-widget-related { display: none !important; } '; // zergnet

    return css;
}

function webmailCss() {
    if (currentDocument.location.host.indexOf('mail.google.') > -1) {
        return 'div[class=aKB] { display: none !important; } ';
    } else if (currentDocument.location.host.indexOf('mail.yahoo.') > -1) {
        return '#shellcontent { right: 0px !important; } #theAd { display: none !important; } .ml-bg .mb-list-ad { display: none !important; position: absolute !important; visibility: hidden !important; } ';
    }

    return '';
}

function stripProtocolFromUrl(url) {
    return url.indexOf('http:') == 0 ? url.substring('http:'.length) : url.indexOf('https:') == 0 ? url.substring('https:'.length) : url;
}

function onAddedToExistingPage(machineId) {
    pageData.machineId = machineId; // in case the page data was created before machine id was set
    window.postMessage({ type: stndz.messages.contentScriptVersionUpgrade, machineId: machineId, iframeGuid: iframeGuid }, "*");
    hideAllRelevantElements(currentDocument);
}

function hideAllRelevantElements(doc) {
    for (var i = 0; i < containerElementTags.length; i++) {
        var tagName = containerElementTags[i];
        var elements = doc.getElementsByTagName(tagName);

        for (var k = 0; k < elements.length; k++) {
            var element = elements[k];
            if (elementHasAdHints(element) && element.clientWidth * element.clientHeight > 1000 && !isContainingContent(element) && element.children.length > 0) {
                setAttribute(element, 'style', 'display: none !important;' + ifnull(getAttribute(element, 'style'), ''));
            }
        }
    }
}

function addScriptToHead(textContent) {
    var removeScriptElement = ';(function(){document.currentScript.parentElement.removeChild(document.currentScript);})();';
    var script = currentDocument.createElement('script');
    script.textContent = textContent + removeScriptElement;
    addElementToHead(script);
}

function addElementToHead(element) {
    if (document.head) {
        document.head.insertBefore(element, document.head.firstChild);
    } else {
        callIn(function() {
            addElementToHead(element);
        }, 10);
    }
}

function openReportIssueForm(source) {
    if (pageActionRunning)
        return;

    pageActionRunning = true;
    var style = currentDocument.createElement('style');
    style.textContent = "body {overflow: hidden !important;} body>*:not(#stndz-report) { -webkit-filter:blur(5px) !important; }";
    currentDocument.body.appendChild(style);

    var iframe = createIframe(currentDocument, "stndz-report", getExtensionRelativeUrl('/views/web_accessible/report/report-issue.html') + "?source=" + source, "100%", "100%", "position: fixed; top: 0px; left: 0px; z-index: 2147483647;");
    iframe.onload = function() {
        try {
            var doc = iframe.contentDocument;
            currentDocument.body.removeChild(style);
            currentDocument.body.removeChild(iframe);
            pageActionRunning = false;
        } catch (e) { }
    };

    currentDocument.body.appendChild(iframe);
}

function clearLocalStorageIfExpired() {
    try {
        if (window.location.href == 'about:blank')
            return;

        var key = 'lastLsTimeStamp';
        if (localStorage.length > 0 && (localStorage[key] == null || daysDiff(new Date(localStorage[key]), new Date()) >= 1)) {
            localStorage.clear();
            localStorage[key] = (new Date()).toString();
        }
    } catch(e) {}
}

function shutdownBecauseOfUpgrade() {
    if (pageActive) {
        stopHandlingWindowMessages();
        shutdownBlockingPopups();
        clearPageCss();
        pageActive = false;
    }
}