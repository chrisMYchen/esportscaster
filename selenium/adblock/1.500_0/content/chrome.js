var extensionId = chrome.runtime.id;

function sendMessageToBackground(message, callback, noPort) {
    try {
        if (callback && !noPort) {
            var port = chrome.runtime.connect();
            port.onMessage.addListener(function(msg) {
                callback && callIn(function() {
                    callback(msg);
                }, 0);

                port.disconnect();
            });

            port.postMessage(message);
        } else {
            chrome.runtime.sendMessage(message, callback);
        }
    } catch(e) { }
}

function registerToMessages(handler) {
    chrome.runtime.onMessage.addListener(handler);
}

function getExtensionRelativeUrl(path) {
    return 'chrome-extension://' + chrome.runtime.id + path;
}