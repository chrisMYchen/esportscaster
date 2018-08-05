var fbIntervalId;
onPageDataReady(function() {
    if (pageData.blockAdsOnFacebook) {
        fbIntervalId = setInterval(blockFacebookFeedAdsInterval, 250);
    }
});

onPageDataUpdate(function(pageData, previousPageData) {
    if (pageData.blockAdsOnFacebook && previousPageData.blockAdsOnFacebook == false) {
        fbIntervalId = setInterval(blockFacebookFeedAdsInterval, 250);
    } else if (pageData.blockAdsOnFacebook == false && previousPageData.blockAdsOnFacebook) {
        clearInterval(fbIntervalId);
        unblockFacebookFeedAds();
    }
});

function blockFacebookFeedAdsInterval() {
    fbSetAdsVisibility('userContentWrapper', true);
    fbSetAdsVisibility('fbUserContent', true);
    fbSetAdsVisibility('pagelet-group', true);
    fbSetAdsVisibility('ego_column', true);
}

function unblockFacebookFeedAds() {
    fbSetAdsVisibility('userContentWrapper', false);
    fbSetAdsVisibility('fbUserContent', false);
    fbSetAdsVisibility('pagelet-group', false);
    fbSetAdsVisibility('ego_column', false);
}

function fbSetAdsVisibility(className, hide) {
    var elements = document.getElementsByClassName(className);
    for (var i = 0; i < elements.length; i++) {
        var currentElement = elements[i];
        var state = currentElement.getAttribute('stndz-state');
        if (state == (hide ? '1' : '0'))
            continue;

        var anchors = currentElement.getElementsByTagName('a');
        for (var j = 0; j < anchors.length; j++) {
            if (anchors[j].innerText.toLowerCase() == 'sponsored') {
                currentElement.style.display = hide ? 'none' : '';
                currentElement.setAttribute('stndz-state', hide ? '1' : '0');
                break;
            }
        }
    }
}