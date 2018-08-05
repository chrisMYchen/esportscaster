var dashboardLoaded = false;

var placeholderImage = document.getElementById('loading-placeholder');
var loadingImage = document.getElementById('loading-image');

setTimeout(function() {
    if (dashboardLoaded == false) {
        placeholderImage.src = 'placeholder.png';
        loadingImage.src = "loading.gif";
    }
}, 200);

chrome.runtime.sendMessage({
    type: stndz.messages.browserActionOpened
});

var iframe = document.getElementById('iframe');
setTimeout(function() {
    iframe.src = 'https://app-cdn.standsapp.org/modules/app/dashboard/v34/index.html?container=extension';
    //iframe.src = 'http://localhost.standsapp.org:8000/modules/app/dashboard/v34/index.html?container=extension';
    iframe.onload = onDashboardLoaded;
}, 0);

function onDashboardLoaded() {
    if (dashboardLoaded)
        return;

    placeholderImage.style.display = 'none';
    loadingImage.style.display = 'none';
    dashboardLoaded = true;
}

window.addEventListener("message", function(event) {
    if (!event.origin.match(/^http(s)?:\/\/(.*\.)?(localhost|standsapp.org|stndz.com)(:\d*)?/i))
        return;

    switch (event.data.type) {
        case 'open-url':
            chrome.tabs.create({
                url: event.data.url,
                active: true
            });
            break;

        case 'close-window':
            window.close();
            break;

        case 'window-loaded':
            onDashboardLoaded();
            break;

        default:
            chrome.runtime.sendMessage(event.data);
            break;
    }
}, false);