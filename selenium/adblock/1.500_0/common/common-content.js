function hasAttribute(element, attributeName) {
    if (!element.getAttribute)
        return false;

    var attribute = element.getAttribute(attributeName);
    return attribute != null;
}

function setAttribute(element, attributeName, attributeValue) {
    element.setAttribute(attributeName, ifnull(attributeValue, ''));
}

function getAttribute(element, attributeName) {
    if (element.getAttribute)
        return element.getAttribute(attributeName);
    else
        return null;
}

var containerElementTags = ['iframe', 'div', 'section', 'td', 'ins']; // order matters, iframe must be first
var adHintRegex = /((^|\s|_|\.|-)([aA][dD]([sS])?|[a-zA-Z]*Ad(s)?|adtech|adtag|dfp|darla|adv|advertisement|(b|B)anner|adsbygoogle|adwrap|adzerk|safeframe|300[xX]250|160[xX]600|728[xX]90)(\s|$|_|\.|-|[A-Z0-9]))/;
function elementHasAdHints(element) {
    if (element.id && element.id.match(adHintRegex))
        return true;

    var elementClass = getAttribute(element, 'class');
    return elementClass && elementClass.match(adHintRegex);
}

var adText = /((^|\s)(([aA][dD]\s)|advertisement|sponsored))/i;
var adChoicesIcon = /(adchoices)/i;
function isContainingContent(element) {
    var elementText = element.innerText;
    if (elementText && (elementText.length > 30 || (elementText.length <= 30 && elementText.length >= 3 && !adText.test(elementText))))
        return true;

    var images = element.getElementsByTagName('img');
    for (var i = 0; i < images.length; i++) {
        var imageStyle = getComputedStyle(images[i]);
        var isHidden = imageStyle.visibility == 'hidden' || imageStyle.display == 'none';
        if (!isHidden && images[i].clientWidth * images[i].clientHeight > 100 && !adChoicesIcon.test(images[i].src))
            return true;
    }

    return false;
}

function createIframe(doc, id, src, width, height, style) {
    var iframe = doc.createElement('iframe');
    iframe.id = iframe.name = id;
    iframe.width = width;
    iframe.height = height;
    iframe.src = src;
    iframe.frameBorder = 0;
    iframe.scrolling = "no";
    iframe.marginWidth = 0;
    iframe.marginHeight = 0;

    style = (style ? style + ';' : '') + 'display: inline !important; width: ' + width + 'px !important; height: ' + height + 'px  !important;';
    iframe.setAttribute("style", style);

    return iframe;
}

stndz.adSizes = {
    list: [
        {
            width: 300,
            height: 250,
            isInSize: function(width, height) {
                return {
                    result: width >= 298 && width <= 325 && ((height >= 248 && height <= 270) || (height >= 0 && height <= 20)),
                    exact: width == 300 && height == 250
                };
            }
        },
        {
            width: 728,
            height: 90,
            isInSize: function(width, height) {
                return {
                    result: (width >= 720 && width <= 740 && ((height >= 88 && height <= 95) || (height >= 0 && height <= 20))) || (width >= 728 && width <= 1200 && height == 90),
                    exact: width == 728 && height == 90
                };
            }
        },
        {
            width: 160,
            height: 600,
            isInSize: function(width, height) {
                return {
                    result: width >= 158 && width <= 170 && ((height >= 600 && height <= 610) || (height >= 0 && height <= 20)),
                    exact: width == 160 && height == 600
                };
            }
        }
    ],
    getSize: function(element, exactSize) {
        var elementWidth = element.clientWidth || parseInt(element.width ? element.width : "0") || parseInt(element.style.width ? element.style.width.replace('px', '') : "0");
        var elementHeight = element.clientHeight || parseInt(element.height ? element.height : "0") || parseInt(element.style.height ? element.style.height.replace('px', '') : "0");
        var maxWidth = element.style.maxWidth ? element.style.maxWidth.indexOf('px') ? parseInt(element.style.maxWidth.replace('px','')) : false : null;
        var maxHeight = element.style.maxHeight ? element.style.maxHeight.indexOf('px') ? parseInt(element.style.maxHeight.replace('px','')) : false : null;

        for (var i = 0; i < stndz.adSizes.list.length; i++) {
            var isExactSize = element.clientWidth == stndz.adSizes.list[i].width && element.clientHeight == stndz.adSizes.list[i].height;
            var sizeResult = stndz.adSizes.list[i].isInSize(elementWidth, elementHeight);
            var isSizeInRange = sizeResult.result &&
                (maxWidth == null || maxWidth >= stndz.adSizes.list[i].width) &&
                (maxHeight == null || maxHeight >= stndz.adSizes.list[i].height);

            if ((exactSize && isExactSize) || (!exactSize && isSizeInRange))
                return {
                    width: stndz.adSizes.list[i].width,
                    height: stndz.adSizes.list[i].height,
                    exact: isExactSize || sizeResult.exact
                };
        }

        return null;
    }
};