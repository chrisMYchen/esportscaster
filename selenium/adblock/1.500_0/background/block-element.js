var blockCssValue = '{display:none !important; visibility:hidden !important; opacity:0 !important; position:absolute !important; width:0px !important; height:0px !important;}';

function blockElementsFunc(blockCssValue, forceOpen, location) {
    if (!window.pageData)
        return;

    var minWindowSize = 120000;
    if (currentDocument.documentElement.clientWidth * currentDocument.documentElement.clientHeight < minWindowSize)
        return;

    if (pageActionRunning && !forceOpen)
        return;

    pageActionRunning = true;
    var blockElementsActive = true;
    var helperWindow;
    var helperWindowContainer;
    var helperWindowMoving;
    var elementToOverlay = null;
    window.selectedElementsDetails = [];
    window.allowSelectElement = true;

    var overlayStyle = currentDocument.createElement('style');
    overlayStyle.textContent = '#stndz-element-overlay{all: unset; position: absolute !important; z-index: 2147483646 !important; display: none !important; background-color: rgba(0,155,255,0.3) !important; border: solid 1px rgb(0,155,255) !important; transition-duration: 200ms !important;}';
    overlayStyle.textContent += '.stndz-element-overlay-standard::before{all: unset; content: "Click to block this element";position: absolute;font-family: "Roboto";left: 50%;transform: translateX(-50%);font-size:13px;text-align: center;width: 170px;height: 20px;line-height: 20px;border-radius: 5px;background-color: rgb(0,155,255);color: rgb(245,245,245);top: -30px;box-shadow: 0px 1px 1px 0px rgba(0,0,0,0.5);}';
    overlayStyle.textContent += '.stndz-element-overlay-standard::after{all: unset; content: "▾";font-family: "Roboto";color: rgb(0,155,255);left: 0px;right: 0px;margin: 0 auto;width: 20px;position: absolute;top: -22px;font-size: 25px;line-height: 28px;text-shadow: 0px 1px 1px rgba(0,0,0,0.5);}';
    overlayStyle.textContent += '.stndz-element-overlay-stands::before{all: unset; content: "This ad pays the website for its content and generates a micro-donation towards your cause - served by STANDS";position: absolute;font-size:13px;font-family: "Roboto";text-align: center;width: 340px;height: 40px;line-height: 20px;border-radius: 5px;background-color: rgb(0,155,255);color: rgb(245,245,245);top: -50px;box-shadow: 0px 1px 1px 0px rgba(0,0,0,0.5);left: 50%;transform: translateX(-50%);}';
    overlayStyle.textContent += '.stndz-element-overlay-stands::after{all: unset; content: "▾";font-family: "Roboto";color: rgb(0,155,255);left: 0px;right: 0px;margin: 0 auto;width: 20px;position: absolute;top: -22px;font-size: 25px;line-height: 28px;text-shadow: 0px 1px 1px rgba(0,0,0,0.5);}';
    currentDocument.documentElement.appendChild(overlayStyle);

    var overlayElement = currentDocument.createElement('div');
    overlayElement.id = 'stndz-element-overlay';
    currentDocument.documentElement.appendChild(overlayElement);

    startElementSelection();
    window.exitChooseElementToBlock = function() {
        blockElementsActive = false;
        overlayElement.parentNode.removeChild(overlayElement);
        overlayStyle.parentNode.removeChild(overlayStyle);

        if (helperWindow) {
            helperWindow.setAttribute('class', 'stndz-block-element-close-window');
            setTimeout(function() {
                helperWindowContainer.parentNode.removeChild(helperWindowContainer);
            }, 250);
        }

        stopElementSelection();
        window.exitChooseElementToBlock = null;
        pageActionRunning = false;
    };

    window.blockElements = function() {
        deselectElementToOverlay();

        var css = '';
        for (var i in window.selectedElementsDetails) {
            if (pageData.hostAddress == window.selectedElementsDetails[i].host) {
                css += window.selectedElementsDetails[i].cssSelector + blockCssValue;
            }
        }

        setPageCss(pageData, ifnull(pageData.customCss, '') + css);
    };

    window.peakElement = function(index) {
        var css = '';
        for (var i in window.selectedElementsDetails) {
            if (pageData.hostAddress == window.selectedElementsDetails[i].host) {
                if (i == index)
                    css += window.selectedElementsDetails[i].cssSelector + '{opacity:0.4 !important}';
                else
                    css += window.selectedElementsDetails[i].cssSelector + blockCssValue;
            }
        }

        setPageCss(pageData, ifnull(pageData.customCss, '') + css);
    };

    window.unblockElements = function() {
        setPageCss(pageData, ifnull(pageData.customCss, ''));
    };

    function addViewAndControllerToPage() {
        helperWindowContainer = currentDocument.createElement('div');
        helperWindowContainer.id = 'stndz-block-element-window-container';
        helperWindowContainer.setAttribute('style', 'all: initial; position: fixed; z-index: 2147483647; top: 0px; left: 0px; border: none; padding: 0px; margin: 0px; width: 100%; display: block !important;');
        currentDocument.documentElement.appendChild(helperWindowContainer);

        callUrl({url: getExtensionRelativeUrl('/views/web_accessible/block-element/view.html'), raw: true}, function(response) {
            response = response.replace(/{{path}}/g, getExtensionRelativeUrl('/views/web_accessible')).replace(/{{location}}/g, location == "right" ? "right" : "left");
            helperWindowContainer.innerHTML = response;

            helperWindow = currentDocument.getElementById('stndz-block-element-window');
            currentDocument.getElementById('stndz-block-element-close').addEventListener("click", function(event) { event.preventDefault(); exitBlockElement(); }, true);
            currentDocument.getElementById('stndz-block-element-cancel').addEventListener("click", function(event) { event.preventDefault(); exitBlockElement(); }, true);
            currentDocument.getElementById('stndz-block-element-save').addEventListener("click", function(event) { event.preventDefault(); saveBlockedElement(); }, true);
            currentDocument.getElementById('stndz-block-element-undo').addEventListener("click", function(event) { event.preventDefault(); undoSelectElement(); }, true);
            currentDocument.getElementById('stndz-block-element-done').addEventListener("click", function(event) { event.preventDefault(); exitBlockElement(); }, true);

            var helperTitle = currentDocument.getElementById('stndz-block-element-title');
            helperTitle.addEventListener("mousedown", function(event) {
                event.preventDefault();
                startDragging(event.x, event.y);
            }, true);

            setViewActions();
        });
    }

    function onMouseMove(event) {
        if (isDragging()) {
            helperWindow.style.setProperty('top', (event.y + helperWindowMoving.topDiff) + 'px', 'important');
            helperWindow.style.setProperty('left', (event.x + helperWindowMoving.leftDiff) + 'px', 'important');
        } else if (window.allowSelectElement) {
            var elements = currentDocument.elementsFromPoint(event.x, event.y);
            var target = elements.length == 0 ? null : elements[0] == overlayElement ? elements[1] : elements[0];
            if (target && isSelectableElement(target) == false)
                target = null;

            if (!target) {
                deselectElementToOverlay();
            } else if (target != overlayElement && target != elementToOverlay) {
                elementToOverlay = target;

                var isStandsAd = elementToOverlay.tagName == 'IFRAME' && elementToOverlay.id && elementToOverlay.id.indexOf(stndz.elements.iframeIdPrefix) == 0;
                overlayElement.setAttribute('class', isStandsAd ? 'stndz-element-overlay-stands' : 'stndz-element-overlay-standard');

                var position = getElementPosition(elementToOverlay);
                updateOverlayPosition(position.x, position.y, elementToOverlay.clientWidth, elementToOverlay.clientHeight, true);
            }
        }
    }

    function onMouseOut() {
        deselectElementToOverlay();
    }

    function onKeyUp(event) {
        if (event.keyCode == 27) { // escape
            exitBlockElement()
        }
    }

    function onMouseDown(event) {
        event.preventDefault();

        if (event.which == 1) {
            elementToOverlay && selectElement(elementToOverlay);
        } else if (event.which == 3) {
            exitBlockElement();
        }

        return false; // cancel selection
    }

    function onMouseUp() {
        endDragging();
    }

    function exitBlockElement() {
        sendMessageToBackground({
            type: stndz.messages.exitBlockElement
        });
    }

    function isDragging() {
        return helperWindowMoving != null;
    }

    function startDragging(x, y) {
        var rect = helperWindow.getBoundingClientRect();
        helperWindowMoving = { leftDiff: rect.left - x, topDiff: rect.top - y };
    }

    function endDragging() {
        if (helperWindowMoving) {
            helperWindowMoving = null;
        }
    }

    function updateOverlayPosition(left, top, width, height, visible) {
        overlayElement.style.setProperty('left', (left - 1) + 'px', 'important');
        overlayElement.style.setProperty('top', (top - 1) + 'px', 'important');
        overlayElement.style.setProperty('width', width + 'px', 'important');
        overlayElement.style.setProperty('height', height + 'px', 'important');
        overlayElement.style.setProperty('display', visible ? 'block' : 'none', 'important');
    }

    function selectElement(element) {
        var isStandsAd = element.tagName == 'IFRAME' && element.id && element.id.indexOf(stndz.elements.iframeIdPrefix) == 0;
        if (isStandsAd) {
            element = element.parentElement;
        }

        var elementRect = element.getBoundingClientRect();
        var topmostElement = element.parentElement;
        while (topmostElement.tagName != 'BODY') {
            if (topmostElement.clientWidth == elementRect.width && topmostElement.clientHeight == elementRect.height) {
                var topmostElementRect = topmostElement.getBoundingClientRect();
                if (topmostElementRect.left == elementRect.left && topmostElementRect.top == elementRect.top) {
                    element = topmostElement;
                }
            }

            topmostElement = topmostElement.parentElement;
        }

        var elementDetails = getElementDetails(element);
        elementDetails.isStandsAd = isStandsAd;

        helperWindow && animateOverlayElement();
        var code = (function() {
            if (window.selectedElementsDetails)
                window.selectedElementsDetails.push(elementDetails);
            window.applyElementSelectionOnView && window.applyElementSelectionOnView();
            window.blockElements && window.blockElements();
        }).toString().replace(/elementDetails/g, JSON.stringify(elementDetails));
        executeOnTab('(' + code + ')();');
    }

    function unselectElement(index) {
        var code = (function() {
            if (window.selectedElementsDetails)
                window.selectedElementsDetails.splice(index, 1);

            window.applyElementSelectionOnView && window.applyElementSelectionOnView();
            window.blockElements && window.blockElements();
        }).toString().replace(/index/g, index);
        executeOnTab('(' + code + ')();');
    }

    function undoSelectElement() {
        var code = (function() {
            if (window.selectedElementsDetails)
                window.selectedElementsDetails = [];
            window.undoElementSelectionOnView && window.undoElementSelectionOnView();
            window.unblockElements && window.unblockElements();
        }).toString();
        executeOnTab('(' + code + ')();');
    }

    function saveBlockedElement() {
        var changes = [];
        for (var i in window.selectedElementsDetails) {
            changes.push({
                add: true,
                host: window.selectedElementsDetails[i].host,
                cssSelector: window.selectedElementsDetails[i].cssSelector,
                isStandsAd: window.selectedElementsDetails[i].isStandsAd
            });
        }

        sendMessageToBackground({
            type: stndz.messages.editBlockElement,
            changes: changes
        });

        var code = (function() {
            if (window.selectedElementsDetails) {
                window.selectedElementsDetails = [];
                window.allowSelectElement = false;
            }

            window.applySavedOnView && window.applySavedOnView();
        }).toString();
        executeOnTab('(' + code + ')();');
    }

    function startElementSelection() {
        currentWindow == currentWindow.top && addViewAndControllerToPage();
        currentDocument.addEventListener("mousemove", onMouseMove);
        currentDocument.addEventListener("mouseout", onMouseOut);
        currentDocument.addEventListener("mousedown", onMouseDown, true);
        currentDocument.addEventListener("mouseup", onMouseUp);
        currentDocument.addEventListener("keyup", onKeyUp);
    }

    function stopElementSelection() {
        currentWindow == currentWindow.top && clearViewActions();
        currentDocument.removeEventListener("mousemove", onMouseMove);
        currentDocument.removeEventListener("mouseout", onMouseOut);
        currentDocument.removeEventListener("mousedown", onMouseDown);
        currentDocument.removeEventListener("mouseup", onMouseUp);
        currentDocument.removeEventListener("keyup", onKeyUp);
    }

    function setViewActions() {
        var pickContainer = currentDocument.getElementById('stndz-block-element-pick');
        var chosenContainer = currentDocument.getElementById('stndz-block-element-chosen');
        var savedContainer = currentDocument.getElementById('stndz-block-element-saved');
        var listContainer = currentDocument.getElementById('stndz-block-element-list');

        window.applyElementSelectionOnView = function() {
            if (window.selectedElementsDetails.length > 0) {
                pickContainer.style.setProperty('display', 'none', 'important');
                chosenContainer.style.setProperty('display', 'block', 'important');

                var addingElement = listContainer.children.length < window.selectedElementsDetails.length;
                while (listContainer.firstChild) {
                    listContainer.removeChild(listContainer.firstChild);
                }

                helperWindow.style.setProperty('height', (120 + (window.selectedElementsDetails.length * 20)) + 'px', 'important');
                for (var i = 0; i < window.selectedElementsDetails.length; i++) {
                    var item = currentDocument.createElement('li');
                    item.innerHTML = 'Blocked Element ' + (i + 1);
                    item.setAttribute('index', i.toString());

                    if (addingElement && i + 1 == window.selectedElementsDetails.length) {
                        item.style.setProperty('animation-name', 'stndz-highlight-animation', 'important');
                        item.style.setProperty('animation-duration', '2s', 'important');
                    }

                    item.addEventListener('mouseenter', function(event) {
                        var code = (function() {
                            window.peakElement && window.peakElement(i);
                        }).toString().replace('(i)', '(' + event.target.getAttribute('index') + ')');
                        executeOnTab('(' + code + ')();');
                    });

                    var remove = currentDocument.createElement('div');
                    remove.addEventListener("click", function(event) {
                        event.preventDefault();
                        unselectElement(event.target.parentElement.getAttribute('index'));
                    }, true);

                    item.appendChild(remove);
                    listContainer.appendChild(item);
                }

                listContainer.addEventListener('mouseleave', function(event) {
                    var code = (function() {
                        window.blockElements && window.blockElements();
                    }).toString();
                    executeOnTab('(' + code + ')();');
                });
            } else {
                window.undoElementSelectionOnView();
            }
        };

        window.undoElementSelectionOnView = function() {
            while (listContainer.firstChild) {
                listContainer.removeChild(listContainer.firstChild);
            }

            pickContainer.style.setProperty('display', 'block', 'important');
            chosenContainer.style.setProperty('display', 'none', 'important');
            helperWindow.style.setProperty('height', '95px', 'important');
        };

        window.applySavedOnView = function() {
            var doneSeconds = 5;
            var doneButton = currentDocument.getElementById('stndz-block-element-done');
            var doneCountdown = function() {
                if (blockElementsActive == false)
                    return;

                doneButton.innerHTML = 'DONE (' + doneSeconds + ')';
                doneSeconds > 0 && setTimeout(doneCountdown, 1000);
                doneSeconds == 0 && exitBlockElement();
                doneSeconds--;
            };

            doneCountdown();
            savedContainer.style.setProperty('display', 'block', 'important');
            chosenContainer.style.setProperty('display', 'none', 'important');
            helperWindow.style.setProperty('height', '120px', 'important');
        };
    }

    function clearViewActions() {
        window.applyElementSelectionOnView = null;
        window.undoElementSelectionOnView = null;
        window.applySavedOnView = null;
    }

    function deselectElementToOverlay() {
        if (window.allowSelectElement && elementToOverlay) {
            elementToOverlay && updateOverlayPosition(0, 0, 0, 0, false);
            elementToOverlay = null;
        }
    }

    function isSelectableElement(element) {
        if (element.tagName == 'BODY' || element.tagName == 'HTML')
            return false;

        if (element.tagName == 'IFRAME' && element.id && element.id.indexOf(stndz.elements.iframeIdPrefix) == 0)
            return true;

        var isStandsObject = function(object) {
            if (object.id && object.id.indexOf('stndz') > -1)
                return true;

            var elementClass = object.getAttribute('class');
            if (elementClass && elementClass.indexOf('stndz') > -1)
                return true;

            return false;
        };

        if (isStandsObject(element) || isStandsObject(element.parentElement) || isStandsObject(element.parentElement.parentElement))
            return false;

        if (element.clientWidth * element.clientHeight < 100)
            return false;

        if (currentWindow.top == currentWindow) {
            var parentElement = element.parentElement;
            while (parentElement != currentDocument.body) {
                if (parentElement == helperWindowContainer)
                    return false;

                parentElement = parentElement.parentElement;
            }
        }

        var isDocumentSize = (element.offsetWidth >= currentDocument.documentElement.offsetWidth - 5 && element.offsetHeight >= currentDocument.documentElement.offsetHeight - 5) ||
            (element.offsetWidth >= currentDocument.documentElement.clientWidth - 5 && element.offsetHeight >= currentDocument.documentElement.clientHeight - 5);
        return isDocumentSize == false;
    }

    function getElementDetails(element) {
        var details = {
            cssSelector: '',
            elementCount: 0,
            host: pageData.hostAddress
        };

        var forceClimbToParent = false;
        var currentElement = element;
        while (details.cssSelector == '' || forceClimbToParent || currentDocument.querySelectorAll(details.cssSelector).length != 1) {
            forceClimbToParent = false;

            var elementSelector = getElementCssSelector(currentElement);
            var weakIdentification = elementSelector == currentElement.tagName.toLowerCase();

            if (weakIdentification) {
                // if parent is body and the selector is weak add more identifications
                if (currentElement.parentElement.tagName == 'BODY') {
                    if (currentElement.getAttribute('style'))
                        elementSelector = currentElement.tagName.toLowerCase() + '[style="' + currentElement.getAttribute('style') + '"]';
                    else if (currentElement.tagName == 'IMG' && currentElement.src)
                        elementSelector = 'img[src="' + currentElement.src + '"]';
                } else {
                    forceClimbToParent = true;
                }
            }

            // if the element is not unique for the parent element - use the child's location
            var newCssSelector = elementSelector + (details.cssSelector ? '>' + details.cssSelector : '');
            if (currentElement.parentElement.querySelectorAll(newCssSelector).length > 1) {
                var sameTagElements = currentElement.parentElement.querySelectorAll(currentElement.tagName.toLowerCase());
                var directChildrenCounter = 0;
                for (var i = 0; i < sameTagElements.length; i++) {
                    if (sameTagElements[i].parentElement == currentElement.parentElement) {
                        directChildrenCounter++;
                        if (sameTagElements[i] == currentElement) {
                            newCssSelector = currentElement.tagName.toLowerCase() + ':nth-of-type(' + directChildrenCounter + ')' + (details.cssSelector ? '>' + details.cssSelector : '');
                            forceClimbToParent = true;
                            break;
                        }
                    }
                }
            }

            details.cssSelector = newCssSelector;
            if (currentElement.parentElement.tagName != 'BODY') {
                currentElement = currentElement.parentElement;
            } else {
                details.cssSelector = 'body>' + details.cssSelector;
                break;
            }
        }

        details.elementCount = currentDocument.querySelectorAll(details.cssSelector).length;
        return details;
    }

    var elementIdCleanup = /(((\d|-|_){3,})|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))$/g;
    function getElementCssSelector(element) {
        var css = element.tagName.toLowerCase();

        // if element has id and it is legal
        if (element.id && element.id.length > 0 && /^[0-9]{1}/.test(element.id) == false) {
            // clean element id from random\guid
            var cleanId = element.id.replace(elementIdCleanup, '');
            if (cleanId.length == element.id.length) {
                return '#' + element.id;
            } else {
                css += '[id*="' + cleanId + '"]';
            }
        }

        var elementClass = element.getAttribute('class');
        if (elementClass) {
            if (/\n/.test(elementClass)) {
                var classes = elementClass.replace(/\n/g, ' ').split(' ');
                for (var i in classes) {
                    if (classes[i])
                        css += '[class*="' + classes[i] + '"]';
                }
            } else {
                css += '[class="' + elementClass + '"]';
            }
        }

        return css;
    }

    function executeOnTab(code) {
        sendMessageToBackground({
            type: stndz.messages.executeScriptOnCurrentTab,
            code: code
        });
    }

    function getElementPosition(elem) {
        var rect = elem.getBoundingClientRect();
        var top  = rect.top + currentDocument.body.scrollTop;
        var left = rect.left + currentDocument.body.scrollLeft;

        return { x: left, y: top };
    }

    function animateOverlayElement(callback) {
        window.allowSelectElement = false;

        // position overlay element in a fixed position
        var overlayRect = overlayElement.getBoundingClientRect();
        overlayElement.style.setProperty('top', overlayRect.top + 'px', 'important');
        overlayElement.style.setProperty('left', overlayRect.left + 'px', 'important');
        overlayElement.style.setProperty('position', 'fixed', 'important');
        overlayElement.style.setProperty('transition-duration', '0ms', 'important');

        setTimeout(function() {
            // shrink element to helper window
            var helperRect = helperWindow.getBoundingClientRect();
            overlayElement.style.setProperty('top', (helperRect.top + helperRect.height/2) + 'px', 'important');
            overlayElement.style.setProperty('left', (helperRect.left + helperRect.width/2) + 'px', 'important');
            overlayElement.style.setProperty('height', '0px', 'important');
            overlayElement.style.setProperty('width', '0px', 'important');
            overlayElement.style.setProperty('transition-duration', '500ms', 'important');

            setTimeout(function() {
                updateOverlayPosition(0, 0, 0, 0, false);
                overlayElement.style.setProperty('position', 'absolute', 'important');
                overlayElement.style.setProperty('transition-duration', '200ms', 'important');
                window.allowSelectElement = true;
                callback && setTimeout(callback, 0);
            }, 500);
        }, 0);
    }
}

function unblockElementsFunc(cssRules) {
    if (!window.pageData)
        return 0;

    var elementsCount = 0;
    var changes = [];
    for (var i in cssRules) {
        if (pageData.hostAddress == cssRules[i].host) {
            var currentRuleElementsCount = currentDocument.querySelectorAll(cssRules[i].cssSelector).length;
            if (currentRuleElementsCount > 0) {
                elementsCount += currentRuleElementsCount;
                changes.push({
                    add: false,
                    host: cssRules[i].host,
                    cssSelector: cssRules[i].cssSelector
                });
            }
        }
    }

    if (elementsCount > 0) {
        pageData.customCss = '';
        setPageCss(pageData, pageData.customCss);
        sendMessageToBackground({
            type: stndz.messages.editBlockElement,
            changes: changes
        });
    }

    return elementsCount;
}

function countBlockedElementsFunc(cssRules) {
    if (!window.pageData)
        return 0;

    var elementsCount = 0;
    for (var i in cssRules) {
        if (pageData.hostAddress == cssRules[i].host) {
            elementsCount += currentDocument.querySelectorAll(cssRules[i].cssSelector).length;
        }
    }

    return elementsCount;
}

function exitBlockElementFunc(cssRules, blockCssValue) {
    if (!window.pageData)
        return;

    var css = '';
    for (var i in cssRules) {
        if (pageData.hostAddress == cssRules[i].host) {
            css += cssRules[i].cssSelector + blockCssValue;
        }
    }

    pageData.customCss = css;
    window.unblockElements && window.unblockElements();
    window.exitChooseElementToBlock && window.exitChooseElementToBlock();
}