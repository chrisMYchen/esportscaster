var serverLogger = new bulkEventLogger({ appId: 1 });
var frameDatas = {};
var pageDatas = {};
var popupTabs = {};
var tabOpeners = {};
var testWindows = {};
var allowNextCreatedTab;
var activeTabId, lastActiveTabId;
var cancelResponse = { cancel: true };
var emptyHtmlResponse = { redirectUrl: 'about:blank' };
var emptyGeneralResponse = { redirectUrl: 'data:text;charset=utf-8,' };
var pixelImageResponse = { redirectUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==' };
var goBackResponse = { redirectUrl: 'data:text/html;base64,PHNjcmlwdD5pZih3aW5kb3cuaGlzdG9yeS5sZW5ndGg+MSl3aW5kb3cuaGlzdG9yeS5iYWNrKCk7ZWxzZSB3aW5kb3cuY2xvc2UoKTs8L3NjcmlwdD4=' };
var appInstallPageHint = 'standsapp.org/pages/adblock-app';
var newTabUrl = "chrome://newtab/";
var hasAdBlocker = null;
var rateUrl = getRateUrl(extensionId);
var lastActivity;
var detectionSamples = {};
var detectionSamplesQuotas = {};
var experimentGroup;
var testGroup;
var installTime = null;
var dashboardStorageKey = 'dashboard';
var dashboardStorage = {};
var machineId;
var requestTypeToElementTag = { sub_frame: 'iframe', image: 'img' };
var timeSavingRequestTypes = { sub_frame: true, script: true };
var closePopupsSettings = {
	counter: 0,
	timer: null,
	notificationKey: 'frequent-closed-popup'
};

var eventHandlers = {
	tabActivated: []
};

function loadOrCreateUser(callback) {
	$st.getUserData(function(userData, errorMessage) {
		if (userData) {
			callback && callback();
		} else {
			var createUserOnInstall = function(retry) {
				var createUserData = { attributes: { } };

				if (errorMessage)
					createUserData.attributes.loadUserError = errorMessage;

				if (retry > 0)
					createUserData.attributes.createdFromRetry = true;

				setupUser(createUserData, function(result) {
					if (result.success) {
						if (result.storeUserError)
							updateUserAttributes({ storeUserError: result.storeUserError });
						callback && callback();
					} else {
						serverLogger.log(stndz.logEventTypes.clientError, {
							source: 'createUser',
							message: encodeURIComponent((result.reason.message || '').replace('\n', '')),
							stack: encodeURIComponent((result.reason.stack || '').replace('\n', '')),
							publicUserId: result.publicUserId,
							status: result.statusCode
						}).flush();

						var validFailure = result.statusCode < 400 || result.statusCode >= 500;
						if (validFailure && retry <= 2) {
							callIn(function() {
								createUserOnInstall(retry + 1);
							}, 500);
						}
					}
				});
			};

			createUserOnInstall(0);
		}
	});
}

function loadCoreVariables(callback) {
	getMultipleLayeredStorageValues([dashboardStorageKey,'machineId'], function(exists, items) {
		if (exists && items.machineId) {
			machineId = items.machineId;
		} else {
			machineId = createGuid();
			setSingleStorageValue('machineId', machineId);
		}

		if (exists && items[dashboardStorageKey]) {
			dashboardStorage = items[dashboardStorageKey];
		}

		$st.onUserReady(function(userData) {
			experimentGroup = userData.publicUserId ? userData.publicUserId.substring(userData.publicUserId.length - 1) : '';
			callback && callback();
		});
	});
}

function onBeforeNavigate(details) {
	if (!frameDatas[details.tabId] || details.frameId == 0)
		frameDatas[details.tabId] = {};

	if (frameDatas[details.tabId][details.frameId])
		return;

	frameDatas[details.tabId][details.frameId] = { authorized: false };
	if (details.frameId > 0 && frameDatas[details.tabId][details.parentFrameId] && frameDatas[details.tabId][details.parentFrameId].authorized) {
		frameDatas[details.tabId][details.frameId].authorized = true;
	}
}

function onBeforeRequest(details) {
	try {

		// background calls like address bar auto complete and browser action windows
		if (details.tabId == -1) {
			if (stndz.signals.is(details.url, stndz.signals.base)) {
				return pixelImageResponse;
			} else {
				return;
			}
		}

		var currentHost = getUrlHost(details.url);
		if (!currentHost)
			return;

		var pageData,previousPageData;
		var isMainFrame = details.type == 'main_frame';
		var isDeactivated = false;
		var isTested = testWindows[details.tabId] ? true : false;

		if (isMainFrame) {
			previousPageData = pageDatas[details.tabId];
			pageData = tabNavigated(details.tabId, details.url, currentHost);
			isDeactivated = pageData.isDeactivated;

			pageData.isPopupToClose = popupRules.shouldClose(currentHost);
			if (pageData.isPopupToClose && stndz.settings.blockPopups && stndz.settings.closePopups && !isTested && !popupTabs[details.tabId]) {
				if (activeTabId != details.tabId) {
					var popupOpenerUrl = previousPageData ? previousPageData.pageUrl : pageData.openerUrl;
					closeTab(details.tabId);
					onClosedPopup(currentHost, details.url, popupOpenerUrl, false);
					return cancelResponse;
				} else if (previousPageData == null && Object.keys(pageDatas).length > 1) {
					updateTab(lastActiveTabId, { active: true });
					closeTab(details.tabId);
					onClosedPopup(currentHost, details.url, pageData.openerUrl, true);
					return cancelResponse;
				}
			}
		} else if (pageDatas[details.tabId]) {
			pageData = pageDatas[details.tabId];
			isDeactivated = pageData.isDeactivated || (details.type == 'sub_frame' && isHostDeactivated(currentHost));
		} else {
			return;
		}

		var blockingResponse = blockingRules.check(currentHost, details.url);
		var collect = blockingResponse.collect && blockingResponse.typeId != stndz.blockTypes.collectPageView;
		collect = collect || blockingResponse.collect && blockingResponse.typeId == stndz.blockTypes.collectPageView && isMainFrame;
		collect && fillDetectionSample("collect", pageData.hostAddress, currentHost, details.url, details.tabId, details.frameId, pageData.trail, pageData.openerUrl);
		if (isTested)
			blockingResponse.block = false;

		// allow all calls if this is a stndz frame
		// or the page itself is of an ad server (handling click redirects, going to the ad server site, etc.)
		// or the site is deactivated
		var isStndzHost = currentHost == stndz.signals.host;
		var isStndzFrameCall = isStndzHost && stndz.signals.is(details.url, stndz.signals.placeholderFrame + "?pageId=" + pageData.pageId);
		if (isStndzFrameCall || (blockingResponse.block && isMainFrame && blockingResponse.typeId != stndz.blockTypes.malware && !pageData.isPopupToClose)) {
			if (!frameDatas[details.tabId])
				frameDatas[details.tabId] = {};

			frameDatas[details.tabId][details.frameId] = { authorized: true };

			if (isStndzFrameCall)
				return { redirectUrl: 'data:text/javascript;charset=utf-8,' + encodeURIComponent('document.getElementById("frame-script").setAttribute("frame-id", "' + details.frameId + '");') };

			if (blockingResponse.block)
				return;
		}

		if (stndz.settings.enabled === false || isDeactivated)
			blockingResponse.block = false;

		if (frameDatas[details.tabId] && frameDatas[details.tabId][details.frameId] && frameDatas[details.tabId][details.frameId].authorized && blockingResponse.typeId != stndz.blockTypes.malware)
			blockingResponse.block = false;

		if (blockingResponse.block) {
			var tag = requestTypeToElementTag[details.type];
			if (tag) {
				var message = {
					type: stndz.messages.hideElement,
					tag: tag,
					url: details.url
				};

				var frameId = getBrowserVersion() < 41 ? null : tag == 'iframe' ? details.parentFrameId : details.frameId;
				sendMessageToContent(details.tabId, message, null, frameId);
			}

			$stats.incrementBlock(blockingResponse.typeId, details.type);
			pageData.blocks += 1;
			updateIconBadgeBlocks(details.tabId);

			if (blockingResponse.typeId == stndz.blockTypes.adServer) {
				pageData.hasAdServers = true;
				pageData.adServersBlocks += 1;
			} else if (blockingResponse.typeId == stndz.blockTypes.tracker)
				pageData.trackersBlocks += 1;
			else if (blockingResponse.typeId == stndz.blockTypes.malware) {
				pageData.adwareBlocks += 1;
				fillDetectionSample("samples", pageData.hostAddress, currentHost, details.url, details.tabId, details.frameId, pageData.trail, pageData.openerUrl);
				if (details.type == "main_frame") {
					reportAnonymousData('main-frame-malware', {
						hostAddress: currentHost,
						url: encodeURIComponent(pageData.pageUrl),
						trail: getTrailText(pageData.trail),
						opener: encodeURIComponent(pageData.openerUrl || ""),
						openerHost: pageData.openerUrl ? getUrlHost(pageData.openerUrl) : ""
					});
				}
			} else if (blockingResponse.typeId == stndz.blockTypes.sponsored)
				pageData.sponsoredBlocks += 1;

			if (timeSavingRequestTypes[details.type])
				pageData.timeSavingBlocks += 1;

			if (details.type == "image")
				return blockingResponse.cancel ? cancelResponse : pixelImageResponse;
			if (details.type == "main_frame") {
				if (testGroup && (getRandomWithinRange(1,100) <= 5 || (previousPageData && previousPageData.isTested))) {
					var testTabId = previousPageData ? details.tabId : pageData.openerTabId;
					try {
						var urlDetails = new URL(details.url);
						if (urlDetails.protocol == "http:" || urlDetails.protocol == "https:")
							testUrl(urlDetails.href, testTabId);
					} catch(e) {}
				}
				return goBackResponse;
			} else if (details.type == "sub_frame")
				return blockingResponse.cancel ? cancelResponse : emptyHtmlResponse;

			return blockingResponse.cancel ? cancelResponse : emptyGeneralResponse;

		} else if (detectionSites[pageData.detectionSite] && details.type != "image" && pageData.detectionSite) {
			var isSameHostCall = currentHost == pageData.detectionSite || endsWith(currentHost, "." + pageData.detectionSite);
			if (isSameHostCall == false) {
				var isAuthorized = false;
				for (var authorizedHost in detectionSites[pageData.detectionSite].authorizedHosts) {
					isAuthorized = currentHost == authorizedHost || endsWith(currentHost, "." + authorizedHost);
					if (isAuthorized) {
						break;
					}
				}

				if (isAuthorized == false) {
					fillDetectionSampleUrl("detection", pageData.hostAddress, currentHost, details.url);
				}
			}
		}

	} catch (e) {
		if (getRandomWithinRange(1, 100) == 1) {
			sendMessageToBackground({
				type: stndz.messages.clientError,
				eventTypeId: stndz.logEventTypes.clientError,
				data: {
					source: 'requestProcessing',
					message: encodeURIComponent(ifnull(e.message, '').replace('\n', '')),
					stack: encodeURIComponent(ifnull(e.stack, '').replace('\n', ''))
				}
			});
		}
	}
}

function onCommited(details) {
	if (details.frameId == 0 && pageDatas[details.tabId]) {
		setTrailType(details.tabId, details.transitionType, details.transitionQualifiers);

		if (testWindows[details.tabId]) {
			var pageId = pageDatas[details.tabId].pageId;
			callIn(function() {
				if (pageDatas[details.tabId] && pageDatas[details.tabId].pageId == pageId) {
					reportSample(pageDatas[details.tabId].hostAddress, pageDatas[details.tabId].pageUrl, pageDatas[details.tabId].trail);
					var windowId = testWindows[details.tabId];
					removeWindow(windowId);
				}
			}, 2000);
		}
	}
}

function setTrailType(tabId, transitionType, transitionQualifiers) {
	var trailType = getTrailType(transitionType, transitionQualifiers);
	var pageData = pageDatas[tabId];
	if (pageData.trail.length > 0) {
		// filling the latest one that is null is done to handle cases where you click a link that takes to a domain
		// that redirects and the onCommited doesn't trigger for them
		for (var i = pageData.trail.length - 1; i >= 0; i--) {
			if (pageData.trail[i].type == null) {
				pageData.trail[i].type = trailType;
				return trailType;
			}
		}
	}
}

function getTrailType(transitionType, transitionQualifiers) {
	if (transitionType == "auto_bookmark" || transitionType == "typed")
		return stndz.trailTypes.user;

	var qualifiers = transitionQualifiers.toString();
	if (qualifiers.indexOf('forward_back') > -1 || qualifiers.indexOf('from_address_bar') > -1)
		return stndz.trailTypes.user;

	if (transitionType == "link")
		return qualifiers.indexOf('server_redirect') > -1 ? stndz.trailTypes.javascript : stndz.trailTypes.client;

	if (qualifiers.indexOf('server_redirect') > -1)
		return stndz.trailTypes.server;

	return stndz.trailTypes.client;
}

function onRequestError(details) {
	var pageData = pageDatas[details.tabId];
	if (!pageData)
		return;

	if (details.type == "main_frame" && testWindows[details.tabId]) {
		var windowId = testWindows[details.tabId];
		removeWindow(windowId);
	}

	if (stndz.signals.is(details.url, stndz.signals.base)) {
		if (stndz.signals.is(details.url, stndz.signals.adBlockersTest) && details.error.indexOf('ERR_BLOCKED_BY_CLIENT') > -1)
			adBlockerDetector.notifyAdBlockDetected();
		return;
	}

	if (!frameDatas[details.tabId] || !frameDatas[details.tabId][details.frameId] || !frameDatas[details.tabId][details.frameId].authorized)
		return;

	if (!details.error || details.error.indexOf('ERR_BLOCKED_BY_CLIENT') == -1)
		return;

	executeCodeOnTab(details.tabId, 'var frameScript=document.getElementById("frame-script");\
		if(frameScript && frameScript.getAttribute("frame-id")=="' + details.frameId +  '") { \
		var stndzDataElement = document.getElementById("stndz-data");\
		stndzDataElement && stndzDataElement.setAttribute("requests-failed", "true"); }', true);
}

function onBeforeRedirect(details) {
	var pageData = pageDatas[details.tabId];
	if (!pageData)
		return;

	if (stndz.signals.is(details.url, stndz.signals.base))
		return;

	if (!frameDatas[details.tabId] || !frameDatas[details.tabId][details.frameId] || !frameDatas[details.tabId][details.frameId].authorized)
		return;

	if (!details.statusLine || details.statusLine.indexOf('307 Internal Redirect') == -1)
		return;

	executeCodeOnTab(details.tabId, 'var frameScript=document.getElementById("frame-script");\
		if(frameScript && frameScript.getAttribute("frame-id")=="' + details.frameId +  '") { \
		var stndzDataElement = document.getElementById("stndz-data");\
		stndzDataElement && stndzDataElement.setAttribute("requests-failed", "true"); }', true);
}

function onHeadersReceived(details) {
	var pageData = pageDatas[details.tabId];
	if (pageData) {
		if ((details.type == "main_frame" || details.type == "sub_frame") && pageData.isWhitelisted && pageData.isDeactivated == false && stndz.settings.enabled) {
			for (var i = 0; i < details.responseHeaders.length; i++) {
				if (details.responseHeaders[i].name.toLowerCase() == 'content-security-policy') {
					details.responseHeaders.splice(i, 1);
					return {responseHeaders: details.responseHeaders};
				}
			}
		}

		if (details.type == "main_frame" && pageData.trail.length > 0) {
			for (var i = 0; i < details.responseHeaders.length; i++) {
				if (details.responseHeaders[i].name.toLowerCase() == 'location') {
					pageData.redirectResponse = true;
					break;
				}
			}
		}
	}
}

function tabNavigated(tabId, url, host, trailType) {
	if (url == goBackResponse.redirectUrl) {
		host = "stands";
		trailType = stndz.trailTypes.app;
	}

	// TODO: when changing something here consider changing onTabReplaced as well
	// trail is used to collect the previous hosts the page has gone through so when someone reports the page
	// we'll be able to see what domains led to it and block them, data is sent anonymously
	var trail = [];
	var openerUrl,openerTabId;
	if (tabOpeners[tabId]) {
		openerUrl = tabOpeners[tabId].url;
		openerTabId = tabOpeners[tabId].tabId;
		trailType = stndz.trailTypes.opener;
		trail.push({host: getUrlHost(openerUrl)});
		delete tabOpeners[tabId];
	}

	var previousPageData = removeTabIfExists(tabId, false);
	if (previousPageData) {
		if (previousPageData.trail)
			trail = previousPageData.trail;

		if (trail.length == 0)
			trail.push({host: previousPageData.hostAddress});

		if (previousPageData.redirectResponse)
			trailType = stndz.trailTypes.server;

		openerUrl = previousPageData.openerUrl;
		openerTabId = previousPageData.openerTabId;
	}

	var pageData = createPageData(tabId, url, host);
	pageData.hasStands = true;

	if (trail.length == 0 || trail[trail.length - 1].host != pageData.hostAddress || trailType != null)
		trail.push({host: pageData.hostAddress, type: trailType});
	pageData.trail = trail;

	if (openerUrl) {
		pageData.openerUrl = openerUrl;
		pageData.openerTabId = openerTabId;
	}

	if (previousPageData) {
		pageData.previousUrl = pageData.hostAddress != previousPageData.hostAddress ? previousPageData.pageUrl : previousPageData.previousUrl;
		pageData.previousHost = pageData.hostAddress != previousPageData.hostAddress ? previousPageData.hostAddress : previousPageData.previousHost;
	}

	lastActivity = utcTimeGetter();
	if (tabId == activeTabId) {
		updateCurrentTabContextMenus();
		updateIcon(tabId);
	}

	return pageData;
}

function createPageData(tabId, url, host) {
	var pageData = createPageDataObject(url, host);
	pageData.isTested = testGroup && getRandomWithinRange(1,100) <= 5;
	for (var detectionSite in detectionSites) {
		var isDetectionSite = pageData.hostAddress == detectionSite ||
			(detectionSites[detectionSite].checkOnSubdomains && endsWith(pageData.hostAddress, "." + detectionSite));

		if (isDetectionSite) {
			pageData.detectionSite = detectionSite;
		}
	}

	pageDatas[tabId] = pageData;
	return pageData;
}

function createPageDataObject(url, host) {
	var isValidSite = url.indexOf('http') == 0;
	var hostSettings = isValidSite ? getHostSettings(host) : null;
	return {
		pageId: createGuid(),
		pageUrl: url,
		machineId: machineId,
		hostAddress: host,
		topHostAddress: host,
		site: isValidSite ? hostSettings.site : host,
		isDonationsDisabled: hasAdBlocker !== false || stndz.settings.adsEnabled !== true,
		isWhitelisted: isValidSite ? hostSettings.isWhitelisted : false,
		isPartner: isValidSite ? hostSettings.isPartner : false,
		isDeactivated: isValidSite ? hostSettings.isDeactivated : false,
		isEnabled: stndz.settings.enabled,
		blockPopups: isValidSite ? hostSettings.blockPopups : false,
		popupRules: isValidSite && hostSettings.blockPopups ? popupRules.list : null,
		showBlockedPopupNotification: isValidSite ? hostSettings.showBlockedPopupNotification : true,
		isValidSite: isValidSite,
		donations: 0,
		blocks: 0,
		adServersBlocks: 0,
		trackersBlocks: 0,
		adwareBlocks: 0,
		popupBlocks: 0,
		sponsoredBlocks: 0,
		timeSavingBlocks: 0,
		injectRequests: 0,
		loadTime: utcTimeGetter(),
		hasAdServers: false,
		isSponsoredStoriesBlocked: stndz.settings.enabled ? stndz.settings.blockSponsoredStories : false,
		blockAdsOnFacebook: stndz.settings.enabled ? stndz.settings.blockAdsOnFacebook : false,
		blockAdsOnSearch: stndz.settings.enabled ? stndz.settings.blockAdsOnSearch : false,
		blockWebmailAds: stndz.settings.enabled ? stndz.settings.blockWebmailAds : false,
		geo: stndz.settings.geo,
		tags: isValidSite ? hostSettings.tags : null,
		css: isValidSite ? hostSettings.css : null,
		customCss: isValidSite ? hostSettings.customCss : null,
		js: isValidSite ? hostSettings.js : null,
		jsParams: isValidSite ? hostSettings.jsParams : null,
		experimentGroup: experimentGroup,
		trail: []
	};
}

function refreshPageData(tabId) {
	if (pageDatas[tabId]) {
		var hostSettings = getHostSettings(pageDatas[tabId].hostAddress);
		pageDatas[tabId].blockPopups = hostSettings.blockPopups;
		pageDatas[tabId].showBlockedPopupNotification = hostSettings.showBlockedPopupNotification;
		pageDatas[tabId].isDeactivated = hostSettings.isDeactivated;
		pageDatas[tabId].isSponsoredStoriesBlocked = stndz.settings.enabled ? stndz.settings.blockSponsoredStories : false;
		pageDatas[tabId].blockAdsOnFacebook = stndz.settings.enabled ? stndz.settings.blockAdsOnFacebook : false;
		pageDatas[tabId].blockAdsOnSearch = stndz.settings.enabled ? stndz.settings.blockAdsOnSearch : false;
		pageDatas[tabId].blockWebmailAds = stndz.settings.enabled ? stndz.settings.blockWebmailAds : false;
		updateIcon(tabId);
	}
}

function getFramePageDataMessage(tabId, frameId, frameHost, frameUrl) {
	var pageData = pageDatas[tabId];
	var pageDataResponse = pageData;

	if (pageData) {
		if (frameId != 0 && frameHost && pageData.hostAddress != frameHost) {
			pageDataResponse = createPageDataObject(frameUrl, frameHost);
			pageDataResponse.pageId = pageData.pageId;
			pageDataResponse.topHostAddress = pageData.hostAddress;
			pageDataResponse.blockPopups = pageData.blockPopups;
			pageDataResponse.showBlockedPopupNotification = pageData.showBlockedPopupNotification;
			pageDataResponse.isDeactivated = pageData.isDeactivated;
		}
	} else {
		pageDataResponse = createPageDataObject(frameUrl, frameHost);
		pageDataResponse.isWhitelisted = pageDataResponse.isPartner = false;
	}

	pageDataResponse.suppressUnload = testWindows[tabId] ? true : false;
	return {
		pageData: pageDataResponse,
		isStndzFrame: frameDatas[tabId] && frameDatas[tabId][frameId] && frameDatas[tabId][frameId].authorized,
		isDeactivated: (pageData && pageData.isDeactivated) || pageDataResponse.isDeactivated,
		isEnabled: stndz.settings.enabled
	};
}

function setActiveTab(tabId) {
	if (activeTabId != tabId)
		lastActiveTabId = activeTabId;

	activeTabId = tabId;
	updateCurrentTabContextMenus();
	updateIcon(tabId);
}

function onTabRemoved(tabId, removeInfo) {
	removeTabIfExists(tabId, true);
	if (testWindows[tabId])
		delete testWindows[tabId];
}

function onTabReplaced(addedTabId, removedTabId) {
	if (pageDatas[removedTabId]) {
		if (pageDatas[addedTabId]) {
			var trail = pageDatas[removedTabId].trail;
			if (trail.length == 0 || trail[trail.length - 1].host != pageDatas[removedTabId].hostAddress)
				trail.push({host:pageDatas[removedTabId].hostAddress});

			if (trail[trail.length - 1].host != pageDatas[addedTabId].hostAddress)
				trail.push({host:pageDatas[addedTabId].hostAddress, type: stndz.trailTypes.user});

			pageDatas[addedTabId].trail = trail;

			if (pageDatas[removedTabId].openerUrl) {
				pageDatas[addedTabId].openerUrl = pageDatas[removedTabId].openerUrl;
				pageDatas[addedTabId].openerTabId = pageDatas[removedTabId].openerTabId;
			}
		}
	}

	deleteTab(removedTabId);
}

function onTabActivated(details) {
	if (testWindows[details.tabId]) {
		var windowId = testWindows[details.tabId];
		removeWindow(windowId);
	} else {
		lastActivity = utcTimeGetter();
		setActiveTab(details.tabId);

		callIfTabExists(details.tabId, function(currentTab) {
			var pageData = pageDatas[details.tabId];
			if (pageData && pageData.isValidSite && !pageData.hasStands) {
				executeFileOnTab(details.tabId, "common/common.js", false, function() {
					executeFileOnTab(details.tabId, "common/common-content.js", false, function() {
						executeFileOnTab(details.tabId, "content/chrome.js", false, function() {
							executeFileOnTab(details.tabId, "content/popup-blocking.js", false, function() {
								executeFileOnTab(details.tabId, "content/doc-start.js", false, function () {
									executeFileOnTab(details.tabId, "content/messaging.js", false, function () {

										var callWhenAddedToExistingPage = function(machineId, appInstallPageHint) {
											window.onAddedToExistingPage && window.onAddedToExistingPage(machineId);
											window.location.href.indexOf(appInstallPageHint) > -1 && addScriptToHead('window.installedFromStore && window.installedFromStore();');
										};
										executeCodeOnTab(details.tabId, "(" + callWhenAddedToExistingPage.toString() + ")('" + machineId + "', '" + appInstallPageHint + "');");

										if (pageData.hostAddress == 'facebook.com') {
											executeFileOnTab(details.tabId, "content/sites/fb.js", false, null, false);
										} else if (pageData.hostAddress == 'youtube.com') {
											executeFileOnTab(details.tabId, "content/sites/yt.js", false, null, false);
										}

										pageData.hasStands = true;
									});
								});
							});
						});
					});
				});
			}

			if (currentTab.url && currentTab.url.indexOf("chrome://extensions") == 0) {
				$stats.flush();
				updateUserAttributes({
					extensionsLastVisited: getUtcDateAndMinuteString(utcTimeGetter())
				});
			}

			runEventHandlers(eventHandlers.tabActivated, currentTab);
		});
	}
}

function onWindowFocusChanged(windowId) {
	if (windowId != noneWindowId) {
		runOnActiveTab(function(tab) {
			tab && onTabActivated({
				tabId: tab.id
			});
		});
	}
}

function onTabUpdated(tabId, changeInfo, tab) {
	if (changeInfo.url && changeInfo.url.indexOf('http') != 0 && changeInfo.url != newTabUrl) {
		var host = getUrlHost(changeInfo.url);
		tabNavigated(tabId, changeInfo.url, host);
	}
}

function onTabCreated(tab) {
	if (tab.url == newTabUrl) {
		var host = getUrlHost(tab.url);
		tabNavigated(tab.id, tab.url, host, stndz.trailTypes.user);
	}
}

function onCreatedNavigationTarget(details) {
	if (pageDatas[details.sourceTabId]) {
		tabOpeners[details.tabId] = {
			url: pageDatas[details.sourceTabId].pageUrl,
			tabId: details.sourceTabId
		};
	}

	if (allowNextCreatedTab && isLastSeconds(allowNextCreatedTab, 1))
		popupTabs[details.tabId] = true;
	else
		allowNextCreatedTab = null;
}

function removeTabIfExists(tabId, isClosing) {
	var pageData = pageDatas[tabId];
	if (pageData) {
		var pageData = pageDatas[tabId];
		var timeOnPage = utcTimeGetter() - pageData.loadTime;
		if (timeOnPage >= 2000) {
			$stats.incrementPageView();
			if (stndz.suspectedMalwareBotActivity && !pageData.isWhitelisted && getRandomWithinRange(1, 100) <= 10) {
				sendMessageToBackground({
					type: stndz.messages.suspectedMalwareBotActivity,
					eventTypeId: stndz.logEventTypes.suspectedMalwareBotActivity,
					data: {
						hostAddress: pageData.hostAddress,
						trail: getTrailText(pageData.trail),
						url: encodeURIComponent(pageData.pageUrl)
					}
				});
			}

			if (getRandomWithinRange(1, 100) <= 3 && pageData.isValidSite && pageData.pageUrl != newTabUrl && pageData.previousHost != 'newtab' && pageData.host != 'about:blank' && !testWindows[tabId]) {
				sendMessageToBackground({
					type: stndz.messages.sampleSiteForReview,
					eventTypeId: stndz.logEventTypes.sampleSiteForReview,
					data: {
						hostAddress: pageData.hostAddress,
						site: pageData.site,
						trail: getTrailText(pageData.trail),
						settings: stndz.settingsMask.mask,
						adServers: pageData.adServersBlocks || 0,
						trackers: pageData.trackersBlocks || 0,
						malware: pageData.adwareBlocks || 0
					}
				});
			}
		}
	}

	deleteTab(tabId);
	return pageData;
}

function deleteTab(tabId) {
	if (pageDatas[tabId])
		delete pageDatas[tabId];

	if (frameDatas[tabId])
		delete frameDatas[tabId];

	if (popupTabs[tabId])
		delete popupTabs[tabId];

	if (tabOpeners[tabId])
		delete tabOpeners[tabId];
}

function cleanupTabs() {
	var currentTabs = {};
	runOnAllTabs(function(tab) {
		currentTabs[tab.id] = true;
	}, function() {
		for (var tabId in pageDatas) {
			if (!currentTabs[tabId])
				deleteTab(tabId);
		}
	});
}

function onInstalled(details) {
	if (details.reason == 'install') {
		installTime = utcTimeGetter();
		updateUserAttributes({ installTime: getUtcDateAndMinuteString(installTime) });
		serverLogger.log(stndz.logEventTypes.extensionInstalled).flush();

		var isStoreInstall = false;
		var isStoreDetailPageInstall = false;
		var storeTitle = null;
		var postInstallPageTabId;
		var standsSiteOpen = false;

		runOnAllTabs(function(tab) {
			var host = getUrlHost(tab.url);
			standsSiteOpen = standsSiteOpen || host.indexOf("standsapp.org") > -1;

			if (tab.url.indexOf("chrome.google.com/webstore") > -1) {
				isStoreInstall = true;
				if (isStoreDetailPageInstall)
					return;

				if (tab.active) {
					storeTitle = tab.title;
					isStoreDetailPageInstall = tab.url.indexOf("://chrome.google.com/webstore/detail") > -1 && tab.url.indexOf(extensionId) > -1;
				} else if (tab.url.indexOf("://chrome.google.com/webstore/detail") > -1 && tab.url.indexOf(extensionId) > -1) {
					storeTitle = tab.title;
				} else if (!storeTitle) {
					storeTitle = tab.title;
				}
			}

			if (tab.url.indexOf(appInstallPageHint) > -1) {
				postInstallPageTabId = tab.id;
			}
		}, function() {
			updateUserAttributes({
				storeTitle: decodeURI(storeTitle),
				standsSite: standsSiteOpen,
				appLp: postInstallPageTabId ? true : false
			});

			checkAppExists(function(exists) {
				runOnActiveTab(function(tab) {
					if (exists) {
						if (postInstallPageTabId && tab && tab.id != postInstallPageTabId) {
							updateTab(postInstallPageTabId, {active: true});
						}
					} else if (isStoreInstall || standsSiteOpen == false) {
						openTabWithUrl("https://app-cdn.standsapp.org/pages/store-post-install/");
					}
				});
			});
		});
	} else if (details.reason == 'update') {
		updateUserAttributes({ previousVersion: details.previousVersion });
	}
}

function onMessage(request, sender, callback) {
	try {
		switch (request.type) {
			case stndz.messages.extensionInstalled:
			case stndz.messages.extensionUpdated:
			case stndz.messages.clientError:
			case stndz.messages.whitelistSiteWithoutDonations:
			case stndz.messages.nonWhitelistedSiteWithAdServers:
			case stndz.messages.sendSample:
			case stndz.messages.adOptionsClicked:
			case stndz.messages.suspectedMalwareBotActivity:
			case stndz.messages.sampleSiteForReview:

				if (request.type == stndz.messages.adOptionsClicked) {
					request.eventTypeId = stndz.logEventTypes.adOptionsClicked;
					updateUserAttributes({
						adOptionsLastOpened: getUtcDateAndMinuteString(utcTimeGetter())
					});
				}

				serverLogger.log(request.eventTypeId, request.data);
				break;

			case stndz.messages.popupBlocked:
				$stats.incrementBlock(stndz.blockTypes.popup);
				serverLogger.log(request.eventTypeId, request.data);

				var tabId = sender && sender.tab ? sender.tab.id : null;
				if (tabId) {
					var pageData = pageDatas[tabId];
					if (pageData) {
						pageData.blocks += 1;
						pageData.popupBlocks += 1;
					}
				}

				if (testGroup && (getRandomWithinRange(1,100) <= 5 || (pageDatas[tabId] && pageDatas[tabId].isTested))) {
					try {
						var popupUrl = new URL(decodeURIComponent(request.data.popupUrl));
						if (popupUrl.protocol == "http:" || popupUrl.protocol == "https:")
							testUrl(popupUrl.href, tabId);
					} catch(e) {}
				}
				break;

			case stndz.messages.reportAnonymousData:
				if (request.data && request.data.reason == 'youtube-ad') {
					request.data.enabled = stndz.settings.enabled;
					request.data.settings = stndz.settingsMask.mask;
					request.data.rulesCount = blockingRules.count;
				}

				serverLogger.log(stndz.logEventTypes.reportAnonymousData, request.data);
				break;

			case stndz.messages.pageData:
				if (sender.tab && pageDatas[sender.tab.id]) {
					var frameHost = getUrlHost(request.url);
					var pageDataMessage = getFramePageDataMessage(sender.tab.id, sender.frameId, frameHost, request.url);
					callback && callback(pageDataMessage);
				}
				break;

			case stndz.messages.externalPageData:
				if (sender.tab && pageDatas[sender.tab.id]) {
					var frameHost = getUrlHost(sender.url);
					var pageDataMessage = getFramePageDataMessage(sender.tab.id, sender.frameId, frameHost, sender.url);
					pageDataMessage.pageData = {
						pageId: pageDataMessage.pageData.pageId,
						pageUrl: pageDataMessage.pageData.pageUrl,
						isWhitelisted: pageDataMessage.pageData.isWhitelisted,
						isPartner: pageDataMessage.pageData.isPartner,
						isDonationsDisabled: pageDataMessage.pageData.isDonationsDisabled,
						tags: pageDataMessage.pageData.tags,
						geo: pageDataMessage.pageData.geo,
						hostAddress: pageDataMessage.pageData.hostAddress,
						topHostAddress: pageDataMessage.pageData.topHostAddress,
						site: pageDataMessage.pageData.site,
						experimentGroup: experimentGroup,
						maxAllowedAds: stndz.settings.maxAdsPerPage
					};

					callback && callback(pageDataMessage);
				}
				break;

			case stndz.messages.adImpression:
				if (sender.tab && sender.tab.id) {
					$st.onUserReady(function(userData) {
						$stats.runWhenStarted(function() {
							var standId = 0, causeId = 0;
							if (userData && userData.stands && userData.stands.length > 0) {
								var stand = userData.stands[getRandomWithinRange(0, userData.stands.length - 1)];
								standId = stand.standId;
								causeId = stand.causes[getRandomWithinRange(0, stand.causes.length - 1)].causeId;
							}

							request.data.standId = standId;
							request.data.causeId = causeId;

							$stats.incrementDonation(standId, causeId, sender.tab.id, request.data.tagId, request.data.adLoaded, request.data.failed);
							serverLogger.log(request.eventTypeId, request.data);

							if (!request.data.failed) {
								if (pageDatas[sender.tab.id])
									pageDatas[sender.tab.id].donations += 1;

								updateIconBadge(sender.tab.id);
							}
						});
					});
					return true;
				}
				break;

			case stndz.messages.getAppData:
				$st.onUserReady(function(userData) {
					$stats.runWhenStarted(function() {
						runOnActiveTab(function(tab) {
							var data = $stats.getSummary();
							data.today = data.today.toString();
							data.donationsCurrentTab = tab && pageDatas[tab.id] ? pageDatas[tab.id].donations : 0;
							data.bonusDonation = userData.bonusDonations ? userData.bonusDonations : 0;
							data.donationsTotal += data.bonusDonation;
							data.currentPageData = tab ? pageDatas[tab.id] : null;
							data.rateUrl = rateUrl;
							if (data.currentPageData && data.currentPageData.isValidSite) {
								data.currentHostSettings = getHostSettings(data.currentPageData.hostAddress);
							}

							data.deactivatedSites = [];
							for (var host in deactivatedSites.hosts) {
								if (deactivatedSites.hosts[host])
									data.deactivatedSites.push(host);
							}

							data.popupsWhitelist = [];
							for (var host in popupSites.hosts) {
								if (popupSites.hosts[host] === false) { // only sites that we don't block popups on
									data.popupsWhitelist.push(host);
								}
							}

							callback && callback(data);
						});
					});
				});
				return true;

			case stndz.messages.getDashboardData:
				callback && callback(dashboardStorage);
				break;

			case stndz.messages.setDashboardData:
				for (var key in request.data) {
					dashboardStorage[key] = request.data[key];
				}
				setSingleStorageValue(dashboardStorageKey, dashboardStorage);
				break;

			case stndz.messages.getBlockingData:
				$stats.runWhenStarted(function() {
					var data = $stats.getBlockingData();
					callback && callback(data);
				});
				return true;

			case stndz.messages.getUserData:
				$st.onUserReady(function(userData) {
					var userDataCopy = JSON.parse(JSON.stringify(userData));
					userDataCopy.createdOn = userDataCopy.createdOn.toString();
					userDataCopy.lastUpdated = userDataCopy.lastUpdated.toString();
					callback && callback(userDataCopy);
				});
				return true;

			case stndz.messages.updateUser:
				if (request.userData.settings) {
					for (var key in request.userData.settings) {
						if (stndz.settings[key] != null)
							stndz.settings[key] = request.userData.settings[key];
					}
				}

				// don't get back user and update if it's only attributes
				var onlyAttributes = request.userData.attributes != null && Object.keys(request.userData).length == 1;
				updateUser(request.userData, function(result) {
					if (onlyAttributes && result.success == false && request.retry > 0) {
						updateUserAttributes(request.userData.attributes, request.retry - 1);
					} else {
						callback && callback(result);
					}
				}, onlyAttributes);
				return true;

			case stndz.messages.getUserSettings:
				callback && callback(stndz.settings);
				break;

			case stndz.messages.updateUserSettings:
				var enabledStateChanged = request.settings.enabled != null && request.settings.enabled != stndz.settings.enabled;
				if (enabledStateChanged && request.settings.enabled === false && pageDatas[activeTabId]) {
					reportAnonymousData('pause-stands', {
						host: pageDatas[activeTabId].hostAddress
					});
				}

				for (var key in request.settings) {
					if (stndz.settings[key] != null)
						stndz.settings[key] = request.settings[key];
				}

				if (request.settings.iconBadgeType || request.settings.iconBadgePeriod || enabledStateChanged) {
					updateIcon();
				}

				if (enabledStateChanged) {
					updateCurrentTabContextMenus();

					if (stndz.settings.enabled) {
						removeStorageValue(stndz.constants.pauseConfirmedTime);
						updateUserAttributes({
							resumeSource: request.source ? request.source : "Dashboard",
							lastResumed: getUtcDateAndSecondString(utcTimeGetter())
						});
					} else {
						callIn(showReactivateNotification, 30 * 60 * 1000);
						updateUserAttributes({
							pauseSource: request.source ? request.source : "Dashboard",
							lastPaused: getUtcDateAndSecondString(utcTimeGetter())
						});
					}
				}

				updateUser({ settings: request.settings }, null, false);
				callback && callback({ success: true });
				applyNewSettingsOnAllTabs();
				break;

			case stndz.messages.canInjectPlaceholder:
				if (sender.tab && pageDatas[sender.tab.id]) {
					pageDatas[sender.tab.id].injectRequests += 1;
					var underLimit = pageDatas[sender.tab.id].injectRequests <= stndz.settings.maxAdsPerPage;
					callback && callback(underLimit);
				}
				break;

			case stndz.messages.browserActionOpened:
				$stats.openedBrowserAction();
				break;

			case stndz.messages.cleanCookies:
				cleanupCookies();
				break;

			case stndz.messages.userDataUpdated:
				updateIcon();
				break;

			case stndz.messages.refreshUserData:
				refreshUserData(callback);
				return true;

			case stndz.messages.deactivatedSitesRequest:
				$st.onUserReady(function(userData) {
					for (var i = 0; i < request.hosts.length; i++) {
						if (request.hosts[i].deactivate === true) {
							deactivatedSites.add(request.hosts[i].hostAddress);
						} else {
							deactivatedSites.remove(request.hosts[i].hostAddress);
						}
					}

					reportAnonymousData('deactivatedSites', request.hosts);

					if (request.refresh) {
						runOnActiveTab(function(tab) {
							tab && reloadTab(tab.id);
						});
					}

					callback && callback(true);
				});
				break;

			case stndz.messages.popupSitesRequest:
				for (var i = 0; i < request.hosts.length; i++) {
					if (request.hosts[i].add === true) {
						popupSites.add(request.hosts[i].hostAddress, false); // don't block popups on the site
					} else if (request.hosts[i].add === false) {
						popupSites.add(request.hosts[i].hostAddress, true); // always block popups on the site
					} else {
						popupSites.remove(request.hosts[i].hostAddress); // fallback to settings
					}
				}

				callback && callback(true);
				applyNewSettingsOnTab(activeTabId);
				break;

			case stndz.messages.popupUserAction:
				if (request.option == 'block' || request.option == 'allow') {
					var blockPopups = request.option == 'block';
					popupSites.add(request.topHostAddress, blockPopups);
					if (sender.tab && sender.tab.id)
						applyNewSettingsOnTab(sender.tab.id);
				}

				if (request.option == 'once' || request.option == 'allow')
					allowNextCreatedTab = utcTimeGetter();

				delete request.type;
				serverLogger.log(stndz.logEventTypes.sampleOfBlockedPopup, request);
				break;

			case stndz.messages.getAdBlocker:
				checkHasAdBlocker(function() {
					callback && callback({
						exists: hasAdBlocker
					});
				});
				return true;

			case stndz.messages.refreshCurrentTab:
				reloadTab(activeTabId);
				break;

			case stndz.messages.reportIssue:
				if (request.data.includeCurrentUrlInReport) {
					getTab(activeTabId, function(tab) {
						reportIssueOnCurrentTab(tab, request.data.source ? request.data.source : "Dashboard", request.data.email, request.data.feedback, request.data.opener, request.data.issueType);
					});
				} else {
					reportIssue(request.data.source ? request.data.source : "Dashboard", null, null, request.data.email, request.data.feedback, "Dashboard", "");
				}
				break;

			case stndz.messages.reportAd:
				var pageData = pageDatas[sender.tab.id];
				if (!pageData)
					return;

				sendEmail('Report Ad', 'Ad options',
					'Geo: ' + stndz.settings.geo +
					'\nVersion: ' + getAppVersion() +
					'\nTag ID: ' + request.tagId +
					'\nReason: ' + request.reason +
					'\nUrl: ' + pageData.pageUrl);
				break;

			case stndz.messages.emptyAdClicked:
				updateUserAttributes({
					emptyAdLastClicked: getUtcDateAndMinuteString(utcTimeGetter())
				});
				break;

			case stndz.messages.possibleAdFrame:
				sender.tab && fillDetectionSample("frames", request.data.topHost, request.data.host, request.data.url, sender.tab.id, sender.frameId);
				break;

			case stndz.messages.disableAdBlockers:
				var disableAdBlockers = function(managementPermissionsExisted) {
					adBlockerDetector.disable(function() {
						hasAdBlocker = false;
						updateUserAttributes({
							hasManagement: true,
							hasAdBlocker: false,
							adBlockerRemoved: true,
							adBlockerRemovedTime: getUtcDateAndMinuteString(utcTimeGetter()),
							adBlockerRemovedSource: request.source
						});

						if (request.source == 'extension' && !managementPermissionsExisted) {
							showAdBlockersDisabledNotification();
						}

						callback && callback(true);
					});
				};

				hasManagamenetPermissions(function(exists) {
					if (exists) {
						disableAdBlockers(true);
					} else {
						updateUserAttributes({
							managementRequested: getUtcDateAndMinuteString(utcTimeGetter()),
							managementRequestSource: request.source
						});

						requestPermission('management', function(granted) {
							if (granted) {
								disableAdBlockers(false);
							} else {
								updateUserAttributes({ hasManagement: false });
								callback && callback(false);
							}
						});
					}
				});
				return true;

			case stndz.messages.blockElement:
				blockElementsOnPage(activeTabId, request.source, 'right');
				break;

			case stndz.messages.exitBlockElement:
				exitBlockElementOnPage(sender.tab.id);
				break;

			case stndz.messages.editBlockElement:
				var anonyReport = [];
				for (var i in request.changes) {
					if (request.changes[i].add) {
						customCssRules.add(request.changes[i].host, request.changes[i].cssSelector);
					} else {
						customCssRules.remove(request.changes[i].host, request.changes[i].cssSelector);
					}

					runSafely(function() {
						anonyReport.push({
							add: request.changes[i].add,
							host: request.changes[i].host,
							selector: encodeURIComponent(request.changes[i].cssSelector),
							isStandsAd: request.changes[i].isStandsAd
						});
					});
				}

				updateCurrentTabContextMenus();
				reportAnonymousData('block-element', anonyReport);
				break;

			case stndz.messages.executeScriptOnCurrentTab:
				executeCodeOnTab(sender.tab.id, request.code);
				break;

			case stndz.messages.adBlockWall:
				handleAdBlockWall(sender.tab.id, request.host, request.url);
				break;

			case stndz.messages.pageLoadCompleted:
				if (sender.tab) {
					var pageData = pageDatas[sender.tab.id];
					if (pageData) {
						var factor = pageData.timeSavingBlocks * 250;
						pageData.timeSaved = parseFloat((((1+(factor/request.ms)) * factor)/1000).toFixed(2));
						pageData.pageLoadTime = parseFloat((request.ms/1000).toFixed(2));
						$stats.pageLoadCompleted(pageData.pageLoadTime, pageData.timeSaved);

						/*
						 if (stndz.settings.iconBadgeType == stndz.iconBadgeTypes.LoadTime || stndz.settings.iconBadgeType == stndz.iconBadgeTypes.SaveTime)
						 updateIcon(sender.tab.id);
						 */
					}
				}
				break;

			case stndz.messages.undoBlockedElements:
				unblockElementsOnPage(activeTabId, "Dashboard", callback);
				return true;

			case stndz.messages.countBlockedElements:
				var pageData = pageDatas[activeTabId];
				if (pageData && customCssRules.hostExists(pageData.hostAddress)) {
					countBlockedElementsOnPage(activeTabId, callback);
					return true;
				}

				callback && callback(0);
				break;

			case stndz.messages.sendExtensionsForAnalysis:
				serverLogger.log(stndz.logEventTypes.sendExtensionsForAnalysis, request.data);
				break;
		}
	} catch(e) {
		serverLogger.log(stndz.logEventTypes.clientError, {
			source: 'onMessage',
			message: encodeURIComponent((e.message || '').replace('\n', '')),
			stack: encodeURIComponent((e.stack || '').replace('\n', ''))
		}).flush();
		callback && callback();
	}
}

function cleanupCookiesInterval() {
	if (stndz.settings.enabled == false)
		return;

	var lsKey = 'cookiesLastCleaned';
	var now = utcTimeGetter();

	getStorageValue(lsKey, function(exists, lastCleanedString) {
		if (!lastCleanedString || isNaN(Date.parse(lastCleanedString)) || daysDiff(new Date(Date.parse(lastCleanedString)), now) >= 1) {
			cleanupCookies();
			setSingleStorageValue(lsKey, now.toString());
		}
	});
}

function cleanupCookies() {
	removeCookiesByHosts(blockingRules.getHosts());
}

function removeCookiesByHosts(hosts) {
	getAllCookies(function(cookies) {
		for (var cookieIndex in cookies) {
			var cookie = cookies[cookieIndex];
			for (var hostIndex in hosts) {
				var host = hosts[hostIndex];

				if (cookie.domain == host || cookie.domain.indexOf("." + host) > -1) {
					var cookieHostSettings = getHostSettings(host);
					if (cookieHostSettings.isDeactivated == false) {
						var url = (cookie.secure ? "https://" : "http://") + cookie.domain;
						removeCookie(url, cookie.name);
					}
				}
			}
		}
	});
}

function updateIcon(tabId) {
	$st.onUserReady(function(userData) {
		if (tabId && (tabId != activeTabId || !pageDatas[tabId]))
			return;

		if (!activeTabId || !pageDatas[activeTabId])
			return;

		setAppIcon(pageDatas[activeTabId].isDeactivated || stndz.settings.enabled == false, userData.notificationsCount > 0);
		updateIconBadge(activeTabId, userData.notificationsCount);
	});
}

function updateIconBadgeBlocks(tabId) {
	if (tabId != activeTabId)
		return;

	if (stndz.settings.iconBadgeType != "Blocks")
		return;

	updateIconBadge(tabId);
}

function updateIconBadge(tabId, notificationCount) {
	if (stndz.settings.enabled == false) {
		setAppIconBadgeText("off");
		setAppIconBadgeTitle("STANDS is paused on all sites");
		return;
	}

	if (tabId != activeTabId)
		return;

	var pageData = tabId && pageDatas[tabId] ? pageDatas[tabId] : null;
	$stats.runWhenStarted(function() {
		var badgeCounter = stndz.settings.iconBadgePeriod == stndz.iconBadgePeriods.Disabled ? "" : stndz.settings.iconBadgePeriod == stndz.iconBadgePeriods.Today ? $stats.getBlocksToday() : (pageData ? pageData.blocks : 0);
		var badgeTitle = stndz.settings.iconBadgePeriod == stndz.iconBadgePeriods.Disabled ? "" : stndz.settings.iconBadgePeriod == stndz.iconBadgePeriods.Today ? badgeCounter + " Blocks today" : badgeCounter + " Blocks on this page";
		var badgeText = badgeCounter > 0 ? badgeCounter.toLocaleString() : "";
		badgeTitle = notificationCount > 0 ? "You have " + notificationCount + " unread notifications" : badgeCounter > 0 ? badgeTitle : "Stands";

		setAppIconBadgeText(badgeText);
		setAppIconBadgeTitle(badgeTitle);
	});
}

function getHostSettings(host) {
	var response = {
		isWhitelisted: null,
		isPartner: null,
		tags: [],
		isDeactivated: null,
		blockPopups: null,
		showBlockedPopupNotification: null,
		site: host,
		css: null,
		customCss: null,
		js: null,
		jsParams: null
	};

	if (stndz.settings.enabled == false) {
		response.isWhitelisted = false;
		response.isPartner = false;
		response.isDeactivated = true;
		response.blockPopups = false;
		response.showBlockedPopupNotification = false;
		return response;
	}

	var tmpHost = host;
	while (true) {
		if (response.isWhitelisted == null && whitelist[tmpHost]) {
			response.isWhitelisted = response.isPartner = true;
			response.tags = [];
			response.site = tmpHost;
		}

		if (response.isDeactivated == null && deactivatedSites.hosts[tmpHost] !== undefined) {
			response.isDeactivated = deactivatedSites.hosts[tmpHost];
		}

		if (response.blockPopups == null && popupSites.hosts[tmpHost] != null) {
			response.blockPopups = popupSites.hosts[tmpHost];
			response.showBlockedPopupNotification = false;
		}

		if (response.css == null && cssRules[tmpHost])
			response.css = cssRules[tmpHost];

		if (response.customCss == null && customCssRules.hosts[host] && customCssRules.hosts[host].length > 0) {
			var customCss = null;
			for (var i in customCssRules.hosts[host]) {
				customCss = (i > 0 ? customCss + ',' : '') + customCssRules.hosts[host][i];
			}

			customCss += blockCssValue;
			response.customCss = customCss;
		}

		if (response.js == null && jsRules[tmpHost]) {
			response.js = jsRules[tmpHost].code;
			response.jsParams = jsRules[tmpHost].params;
		}

		var dotIndex = tmpHost.indexOf('.');
		if (dotIndex == -1)
			break;

		tmpHost = tmpHost.substring(dotIndex + 1);
	}

	if (response.isWhitelisted == null || isHostInDomain(host, "mail.yahoo.com") || isHostInDomain(host, "mail.live.com")) {
		response.isWhitelisted = false;
		response.isPartner = false;
	}

	if (response.isDeactivated == null) {
		response.isDeactivated = false;
	}

	if (response.blockPopups == null) {
		response.blockPopups = stndz.settings.blockPopups;
	}

	if (response.showBlockedPopupNotification == null) {
		response.showBlockedPopupNotification = stndz.settings.showBlockedPopupNotification;
	}

	return response;
}

function isHostInDomain(host, domain) {
	return host == domain || endsWith(host, "." + domain);
}

// detect if user has an ad blocker
var adBlockerDetector = new function() {
	var lastDetectedTime = null;
	var adBlockers = {
		adBlockPlus: 'cfhdojbkjhnklbpkdaibdccddilifddb',
		adBlock: 'gighmmpiobklfepjocnamgkkbiglidom',
		adGuard: 'bgnkhhnnamicmpeenaelnjfhikgbkllg',
		adBlockPro: 'ocifcklkibdehekfnmflempfgjhbedch',
		uBlock: 'cjpalhdlnbpafiamejdnhcphjbkeiagm',
		disconnect: 'jeoacafpbcihiomhlakheieifhpjdfeo',
		adBlockSimple: 'nhfjefnfnmmnkcckbjjcganphignempo'
	};

	this.detect = function(callback) {
		hasManagamenetPermissions(function(exists) {
			if (exists) {

				getAllExtensions(function(extensions) {
					for (var i = 0; i < extensions.length; i++) {
						for (var adBlocker in adBlockers) {
							if (extensions[i].id == adBlockers[adBlocker] && extensions[i].enabled) {
								callback(true);
								return;
							}
						}
					}

					callback(false);
				});

			} else {
				queryTabs({ windowType: 'normal' }, function(tabs) {
					if (tabs.length == 0)
						return;

					var testAdBlockersOnTab = function(tabId, callback) {
						executeCodeOnTab(tabId, '(function() { document.createElement("img").src="' + stndz.signals.adBlockersTest + '?rand=' + getRandom() + '"; return true; })();', false, function(results) {
							callback && callback(results.length > 0 && results[0]);
						}, false);
					};

					var tabIds = tabs.map(function(tab) { return tab.id; });
					var runTestTillSuccess = function() {
						if (tabIds.length > 0) {
							testAdBlockersOnTab(tabIds.splice(getRandomWithinRange(0, tabs.length - 1), 1)[0], function(testSuccess) {
								if (testSuccess) {
									callIn(function() {
										callback && callback(lastDetectedTime != null && utcTimeGetter() - lastDetectedTime <= 500);
									}, 150);
								} else {
									runTestTillSuccess();
								}
							});
						} else {
							callback && callback(false);
						}
					};

					runTestTillSuccess();
				});
			}
		});
	};

	this.disable = function(callback) {
		var disableCount = Object.keys(adBlockers).length;
		for (var adBlocker in adBlockers) {
			extensionExists(adBlockers[adBlocker], function(extensionId, exists) {
				if (exists) {
					disableExtension(extensionId, function() {
						disableCount--;
						disableCount == 0 && callback && callback();
					});
				} else {
					disableCount--;
					disableCount == 0 && callback && callback();
				}
			});
		}
	};

	this.notifyAdBlockDetected = function() {
		lastDetectedTime = utcTimeGetter();
	};
};

function checkHasAdBlocker(callback) {
	adBlockerDetector.detect(function(exists) {
		if (exists != hasAdBlocker) {
			var attributes = {
				hasAdBlocker: exists
			};

			if (hasAdBlocker != null && exists != hasAdBlocker) {
				if (exists) {
					attributes.adBlockerAdded = true;
					attributes.adBlockerAddedTime = getUtcDateAndMinuteString(utcTimeGetter());
				} else {
					attributes.adBlockerRemoved = true;
					attributes.adBlockerRemovedTime = getUtcDateAndMinuteString(utcTimeGetter());
					attributes.adBlockerRemovedSource = 'independent';
				}
			}

			hasAdBlocker = exists;
			updateUserAttributes(attributes);
		}

		callback && callback();
	});
}

function toggleStandsStateClicked(source) {
	sendMessageToBackground({
		type: stndz.messages.updateUserSettings,
		settings: {
			enabled: !stndz.settings.enabled
		},
		source: source
	}, function() {
		showEnableDisableStandsNotification();
	});
}

function uninstallExtension() {
	runOnActiveTab(function(tab) {
		$st.onUserReady(function(userData) {
			$stats.flush();
			var url = tab ? tab.url : null;
			var host = url ? getUrlHost(url) : null;
			reportAnonymousData('uninstall', {
				host: host,
				url: encodeURIComponent(url),
				hasAdBlocker: hasAdBlocker,
				dashboardOpen: $stats.getBrowserActionCounter(),
				blocks: $stats.getBlocksTotal(),
				donations: $stats.getTotalDonations(),
				ttl: (utcTimeGetter() - userData.createdOn) / (1000 * 60)
			});

			uninstallSelf();
		});
	});
}

function toggleStandsOnCurrentSiteClicked(tabId) {
	if (pageDatas[tabId]) {
		var deactivate = isHostDeactivated(pageDatas[tabId].hostAddress) == false;
		sendMessageToBackground({
			type: stndz.messages.deactivatedSitesRequest,
			hosts: [{
				hostAddress: pageDatas[tabId].hostAddress,
				deactivate: deactivate
			}]
		}, function() {
			updateCurrentTabContextMenus();
			showEnableDisableStandsCurrentSiteNotification(tabId, !deactivate, pageDatas[tabId].hostAddress);
			applyNewSettingsOnTab(tabId);
		});
	}
}

function updateCurrentTabContextMenus() {
	updateContextMenu("disable", (stndz.settings.enabled ? "Turn off blocking everywhere" : "Turn on blocking"), true);
	updateContextMenu("disable-page", (stndz.settings.enabled ? "Turn off blocking everywhere" : "Turn on blocking"), true);
	if (pageDatas[activeTabId]) {
		var menuEnabled = pageDatas[activeTabId].isValidSite && stndz.settings.enabled;
		var disabledHost = pageDatas[activeTabId] && pageDatas[activeTabId].hostAddress && isHostDeactivated(pageDatas[activeTabId].hostAddress);
		updateContextMenu("site-disable", disabledHost ? "Resume blocking on this site" : "Whitelist this site", menuEnabled);
		updateContextMenu("site-disable-page", disabledHost ? "Resume blocking on this site" : "Whitelist this site", menuEnabled);

		var currentHostMenuEnabled = menuEnabled && !disabledHost;
		updateContextMenu("report-url", null, currentHostMenuEnabled);
		updateContextMenu("report-url-page", null, currentHostMenuEnabled);
		updateContextMenu("block-elements", null, currentHostMenuEnabled);
		updateContextMenu("block-elements-page", null, currentHostMenuEnabled);
		updateContextMenu("unblock-elements", null, currentHostMenuEnabled && customCssRules.hostExists(pageDatas[activeTabId].hostAddress));
		updateContextMenu("unblock-elements-page", null, currentHostMenuEnabled, customCssRules.getUrlPatterns());
	}
}

function isHostDeactivated(host) {
	var tmpHost = host;
	while (true) {
		if (deactivatedSites.hosts[tmpHost] !== undefined) {
			return deactivatedSites.hosts[tmpHost] === true;
		}

		var dotIndex = tmpHost.indexOf('.');
		if (dotIndex == -1)
			break;

		tmpHost = tmpHost.substring(dotIndex + 1);
	}

	return false;
}

function testUrl(url, openerTabId) {
	var currentWindowId = getCurrentWindowId();
	createWindow({
		url: url,
		left: 100000,
		top: 100000,
		width: 1,
		height: 1,
		focused: false
	}, function(win) {
		var tabId = win.tabs[0].id;
		if (openerTabId)
			tabOpeners[tabId] = { url: pageDatas[openerTabId].pageUrl };
		testWindows[tabId] = win.id;
		updateWindow(currentWindowId, { focused: true });
		updateWindow(win.id, { width: 800, height: 600, left: 100000, top: 100000, focused: false });
		updateTab(tabId, { muted: true });
	});
}

function openIssueFormOnCurrentTab(tab, source) {
	sendMessageToContent(tab.id, {
		type: stndz.messages.reportIssueForm,
		source: source
	});
}

function reportIssueOnCurrentTab(tab, source, email, feedback, formOpener, issueType) {
	var trail = getTrailText(pageDatas[tab.id].trail);
	reportIssue(source, tab.url, pageDatas[tab.id].openerUrl, email, feedback, formOpener, issueType, trail);
}

function reportIssue(source, url, openerUrl, email, feedack, formOpener, issueType, trail) {
	sendEmail('Report Issue', source,
		'\nEmail: ' + email +
		'\nGeo: ' + stndz.settings.geo +
		'\nApp Version: ' + getAppVersion() +
		'\nBrowser: ' + getBrowserName() +
		'\nBrowser Version: ' + getBrowserVersion() +
		'\nOperating System: ' + operatingSystem +
		'\nApp Enabled: ' + stndz.settings.enabled +
		'\nIssue: ' + issueType +
		'\nUrl: ' + url +
		'\nOpener: ' + (openerUrl || "") +
		'\nTrail: ' + trail +
		'\nForm Opener: ' + formOpener +
		'\nFeedback: ' + feedack);
}

function canFillDetectionSample(type, hostAddress, detectionHost) {
	createNestedObjectIfNotExists(detectionSamplesQuotas, [type, hostAddress, detectionHost], 0);
	if (detectionSamplesQuotas[type][hostAddress][detectionHost] >= 4)
		return false;

	detectionSamplesQuotas[type][hostAddress][detectionHost]++;
	return true;
}

function fillDetectionSample(type, hostAddress, detectionHost, detectionUrl, tabId, frameId, trail, opener) {
	if (canFillDetectionSample(type, hostAddress, detectionHost)) {
		getNestings(tabId, frameId, function(nestingData) {
			createNestedObjectIfNotExists(detectionSamples, [type, hostAddress], []);
			detectionSamples[type][hostAddress].push({
				host: detectionHost,
				url: encodeURIComponent(detectionUrl),
				nesting: nestingData.nesting,
				nestingUrls: nestingData.nestingUrls,
				trail: getTrailText(trail),
				opener: encodeURIComponent(opener || ""),
				openerHost: opener ? getUrlHost(opener) : ""
			});
		});
	}
}

function fillDetectionSampleUrl(type, hostAddress, detectionHost, detectionUrl) {
	if (canFillDetectionSample(type, hostAddress, detectionHost)) {
		createNestedObjectIfNotExists(detectionSamples, [type, hostAddress, detectionHost], []);
		detectionSamples[type][hostAddress][detectionHost].push(encodeURIComponent(detectionUrl));
	}
}

function createNestedObjectIfNotExists(obj, props, value) {
	for (var i = 0; i < props.length; i++) {
		if (!obj[props[i]])
			obj[props[i]] = i+1 < props.length ? {} : value;
		obj = obj[props[i]];
	}
}

function getNestings(tabId, frameId, callback) {
	var response = {
		nesting: "",
		nestingUrls: ""
	};

	if (frameId > 0) {
		var retries = 5;
		var collectNesting = function() {
			getAllFrames(tabId, function(frames) {
				try {
					var currentFrameId = frameId;
					var found = false;
					for (var i = 0; i < frames.length; i++) {
						var frame = frames[i];
						if (frame.frameId == currentFrameId) {
							response.nesting = getUrlHost(frame.url) + (response.nesting == "" ? "" : " > " + response.nesting);
							response.nestingUrls = encodeURIComponent(frame.url) + (response.nestingUrls == "" ? "" : " > " + response.nestingUrls);
							currentFrameId = frame.parentFrameId;

							if (currentFrameId == 0) {
								found = true;
								break;
							} else {
								i = -1;
							}
						}
					}

					if (found) {
						callback && callback(response);
					} else if (retries > 0) {
						retries--;
						callIn(collectNesting, 200);
					} else {
						response.nesting = response.nestingUrls = "NA";
						callback && callback(response);
					}
				} catch(e) {
					response.nesting = response.nestingUrls = "Error";
					callback && callback(response);
				}
			});
		};

		callIn(collectNesting, 200);
	} else {
		callback && callback(response);
	}
}

function reportSuspectedDomains() {
	if (Object.keys(detectionSamples).length > 0) {
		for (var type in detectionSamples) {
			reportAnonymousData('report-' + type, detectionSamples[type]);
		}

		detectionSamples = {};
	}
}

function reportAnonymousData(reason, data) {
	sendMessageToBackground({
		type: stndz.messages.reportAnonymousData,
		data: {
			reason: reason,
			data: data,
			settings: stndz.settingsMask.mask
		}
	});
}

function blockElementsOnPage(tabId, source, location) {
	executeCodeOnTab(tabId, '(' + blockElementsFunc.toString() + ')(\'' + blockCssValue + '\', ' + (source == 'report-url') + ',\'' + (location ? location : '') + '\')');
	updateUserAttributes({
		blockElement: getUtcDateAndMinuteString(utcTimeGetter())
	});
}

function exitBlockElementOnPage(tabId) {
	getCssRulesForTab(tabId, function(customCssRulesOnTab) {
		executeCodeOnTab(tabId, '(' + exitBlockElementFunc.toString() + ')(' + JSON.stringify(customCssRulesOnTab) + ', \'' + blockCssValue + '\')');
	});
}

function unblockElementsOnPage(tabId, source, callback) {
	getCssRulesForTab(tabId, function(customCssRulesOnTab) {
		executeCodeOnTab(tabId, '(' + unblockElementsFunc.toString() + ')(' + JSON.stringify(customCssRulesOnTab) + ')', false, function(results) {
			var elementsCount = 0;
			for (var i in results) {
				elementsCount += results[i];
			}

			callback && callback(elementsCount);
			if (source != "Dashboard")
				showUnblockElementsNotification(elementsCount);
		});
	});
}

function countBlockedElementsOnPage(tabId, callback) {
	getCssRulesForTab(tabId, function(customCssRulesOnTab) {
		executeCodeOnTab(tabId, '(' + countBlockedElementsFunc.toString() + ')(' + JSON.stringify(customCssRulesOnTab) + ');', false, function(results) {
			var elementsCount = 0;
			for (var i in results) {
				elementsCount += results[i];
			}

			callback && callback(elementsCount);
		});
	});
}

function getCssRulesForTab(tabId, callback) {
	getAllFrames(tabId, function(frames) {
		var hostsInTab = {};
		runEachSafely(frames, function(frame) {
			var frameHost = getUrlHost(frame.url);
			if (frameHost)
				hostsInTab[frameHost] = true;
		}, function() {
			var customCssRulesOnTab = [];
			for (var host in hostsInTab) {
				if (customCssRules.hosts[host]) {
					for (var i in customCssRules.hosts[host]) {
						customCssRulesOnTab.push({
							host: host,
							cssSelector: customCssRules.hosts[host][i]
						});
					}
				}
			}

			callback && callback(customCssRulesOnTab);
		});
	});
}

function applyNewSettingsOnAllTabs() {
	runOnAllTabs(function(tab) {
		applyNewSettingsOnTab(tab.id);
	});
}

function applyNewSettingsOnTab(tabId) {
	if (getBrowserVersion() < 41)
		return;

	if (!pageDatas[tabId])
		return;

	refreshPageData(tabId);
	getAllFrames(tabId, function(frames) {
		runEachSafely(frames, function(frame) {
			var frameHost = getUrlHost(frame.url);
			if (frameHost) {
				var framePageData = getFramePageDataMessage(tabId, frame.frameId, frameHost, frame.url);
				framePageData.type = stndz.messages.updatePageData;
				sendMessageToContent(tabId, framePageData, null, frame.frameId);
			}
		});
	});
}

function handleAdBlockWall(tabId, host, goToUrl) {
	var pageData = pageDatas[tabId];
	if (!pageData)
		return;

	if (pageData.adBlockWall != null)
		return;

	pageData.adBlockWall = true;
	var handle = function() {
		pageData.adBlockWall = false;
		setTimeout(function() {
			showAdBlockWallNotification(tabId, host, goToUrl);
			updateUserAttributes({
				lastAdBlockWallMessage: getUtcDateAndMinuteString(utcTimeGetter())
			});

			reportAnonymousData('adblock-wall', {
				host: host
			});
		}, 1000);
	};

	if (tabId == activeTabId) {
		handle();
	} else {
		eventHandlers.tabActivated.push(function(tab) {
			if (tab.id == tabId && pageDatas[tabId] && pageDatas[tabId].pageId == pageData.pageId && pageData.adBlockWall) {
				handle();
				return false;
			}

			return true;
		});
	}
}

function updateJsRuleParameters(host, params) {
	var tmpHost = host;
	while (true) {
		if (jsRules[tmpHost]) {
			for (var key in params) {
				jsRules[tmpHost].params[key] = params[key];
			}
			break;
		}

		var dotIndex = tmpHost.indexOf('.');
		if (dotIndex == -1)
			break;

		tmpHost = tmpHost.substring(dotIndex + 1);
	}

	jsRulesUpdatingData.forceUpdate();
}

function runEventHandlers(handlers, param) {
	if (handlers.length == 0)
		return;

	var handlersList = [];
	while (handlers.length > 0) {
		handlersList.push(handlers.pop());
	}

	for (var i = 0; i < handlersList.length; i++) {
		var keep = false;
		runSafely(function() {
			keep = handlersList[i](param);
		});

		keep && handlers.push(handlersList[i]);
	}
}

function onClosedPopup(host, url, openerUrl, active) {
	var openerHost = getUrlHost(openerUrl);
	sendMessageToBackground({
		type: stndz.messages.popupBlocked,
		eventTypeId: stndz.logEventTypes.popupBlocked,
		data: {
			hostAddress: openerHost,
			site: openerHost,
			topHostAddress: openerHost,
			url: encodeURIComponent(url),
			blockType: 'closed-' + (active ? 'popup' : 'popunder'),
			popupHost: host,
			popupUrl: encodeURIComponent(url)
		}
	});

	if (active) {
		if (extensionNotifications.wasSeen(closePopupsSettings.notificationKey))
			return;

		if (closePopupsSettings.timer && isLastMinutes(closePopupsSettings.timer, 1)) {
			closePopupsSettings.counter++;
			if (closePopupsSettings.counter > 5) {
				showFrequentClosedPopupsNotification(closePopupsSettings.counter);
			}
		} else {
			closePopupsSettings.counter = 0;
			closePopupsSettings.timer = utcTimeGetter();
		}
	}
}

function checkAppExists(callback) {
	$st.onUserReady(function(userData) {
		sendMessageToExtension(chromeAppId, { exists: true, privateUserId: userData.privateUserId }, function(response) {
			var exists = response && response.exists ? true : false;
			callback && callback(exists);
		});
	});
}

function checkFairAds(callback) {
	sendMessageToExtension(fairAdsExtensionId, { exists: true, extensionId: extensionId }, function(response) {
		var enable = response != null && response.exists === true;
		setEnableAds(enable);
		callback && callback(enable);
	});
}

function setEnableAds(enable) {
	if (enable != stndz.settings.adsEnabled) {
		stndz.settings.adsEnabled = enable;
		var data = { settings: { adsEnabled: enable }, attributes: {} };
		data.attributes[enable ? 'adsEnabledTime' : 'adsDisabledTime'] = getUtcDateAndSecondString(utcTimeGetter());
		updateUser(data, null, false);
	}

	if (enable == false) {
		rateUrl = getRateUrl(extensionId);
	}
}

var testWebRequestsInterceptedFailed = false;
function testWebRequestsIntercepted() {
	var testImage = new Image();

	testImage.onerror = function() {
		testWebRequestsInterceptedFailed = true;
		updateUserAttributes({
			interceptNotWorking: getUtcDateAndMinuteString(utcTimeGetter())
		});
	};

	testImage.onload = function() {
		if (testWebRequestsInterceptedFailed) {
			testWebRequestsInterceptedFailed = false;
			updateUserAttributes({
				interceptNotWorking: null
			});
		}
	};

	testImage.src = "https://stands-app/test-web-request-intercepted.png?rand=" + getRandom();
}

function getTrailText(trail) {
	var result = "";
	if (trail) {
		for (var i = 0; i < trail.length; i++) {
			if (i > 0) {
				result += (trail[i].type == stndz.trailTypes.opener ? "*" : trail[i].type == stndz.trailTypes.user ? ">" : trail[i].type == stndz.trailTypes.client ? "#" : trail[i].type == stndz.trailTypes.server ? "!" : trail[i].type == stndz.trailTypes.javascript ? "~" : trail[i].type == stndz.trailTypes.app ? "<" : "?") + trail[i].host;
			} else {
				result += trail[i].host;
			}
		}
	}

	return result;
}

function reportSample(host, url, trail) {
	var urlResponse = blockingRules.check(host, url);
	if (urlResponse.block)
		return;

	sendMessageToBackground({
		type: stndz.messages.sendSample,
		eventTypeId: stndz.logEventTypes.sendSample,
		data: {
			hostAddress: host,
			site: host,
			pageUrl: encodeURIComponent(url),
			trail: getTrailText(trail)
		}
	});
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