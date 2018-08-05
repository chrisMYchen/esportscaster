onPageDataReady(function() {
    function blockYoutubeFunc(scriptId) {
        var scriptElement = document.getElementById(scriptId);

        try {
            if (window == window.top) {
                var cleanupConfig = function(config) {
                    if (config && config.args) {
                        for (var arg in config.args) {
                            if (arg == "allow_html5_ads")
                                config.args["allow_html5_ads"] = "0";
                            else if (/(^afv)|(^(afv_|_)?ad(s|sense|video|\d)?(_|$))|(dynamic_allocation_ad_tag)|(.*_vast)|(excluded_ads)|(pyv_ad_channel)/.test(arg))
                                delete config.args[arg];
                        }
                    }
                };

                if (window.ytplayer) {
                    var configMock = window.ytplayer.config;
                    Object.defineProperty(window.ytplayer, "config", {
                        configurable: false,
                        get: function() {
                            cleanupConfig(configMock);
                            return configMock;
                        },
                        set: function(obj) {
                            configMock = obj;
                            cleanupConfig(configMock);
                            return configMock;
                        }
                    });
                } else {
                    var playerMock = undefined;
                    Object.defineProperty(window, "ytplayer", {
                        configurable: false,
                        get: function() {
                            playerMock && cleanupConfig(playerMock.config);
                            return playerMock;
                        },
                        set: function(obj) {
                            playerMock = obj;
                            cleanupConfig(playerMock.config);
                            return playerMock;
                        }
                    });
                }
            }
        } catch(e) {
            scriptElement.setAttribute('failed', 'true');
        }
    }

    var identifySkipIntervalId = setInterval(identifyYouTubeAds, 1000);
    function identifyYouTubeAds() {
        var skipElements = currentDocument.getElementsByClassName('videoAdUiPreSkipContainer');
        var skipElement = skipElements.length > 0 ? skipElements[0] : null;
        if (skipElement) {
            var skipElementStyle = getComputedStyle(skipElement);
            var skipElementHidden = skipElementStyle.opacity == "0" || skipElementStyle.visibility == "hidden" || skipElementStyle.display == "none";
            if (skipElementHidden == false) {
                clearInterval(identifySkipIntervalId);
                sendMessageToBackground({
                    type: stndz.messages.reportAnonymousData,
                    data: {
                        reason: 'youtube-ad',
                        embedded: currentWindow != currentWindow.top,
                        failure: script.getAttribute('failed') == 'true'
                    }
                });
            }
        }
    }

    var script = currentDocument.createElement('script');
    script.id = getRandom();
    script.textContent = '(' + blockYoutubeFunc.toString() + ')(\"' + script.id + '\");';
    addElementToHead(script);
});