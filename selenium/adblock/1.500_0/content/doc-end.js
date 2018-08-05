window.onPageDataReady && onPageDataReady(function() {
	if (pageLoadedInDisabledState)
		return;

	var frameDepth = document.location.ancestorOrigins.length;
	var adSize = stndz.adSizes.getSize(document.body, true) || stndz.adSizes.getSize(document.documentElement, true);
	if (frameDepth >= 1 && adSize) {
		var isSameDomain = pageData.hostAddress == pageData.topHostAddress ||
			endsWith(pageData.hostAddress, "." + pageData.topHostAddress);
		if (!isSameDomain) {
			sendMessageToBackground({
				type: stndz.messages.possibleAdFrame,
				data: {
					topHost: pageData.topHostAddress,
					host: document.location.host,
					url: document.location.href
				}
			});
		}
	}
});