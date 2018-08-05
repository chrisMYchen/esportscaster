var pageParams = parseUrlParamsToObject(document.location.href);
var issueType = null;
var alertBackground = $('#alert');
var alertBox = $('#alert-box');
var dropDown = $('.drop-down');
var dropDownOptions = $('.drop-down-option');
var sendButton = $('#send-button');
var details = $('.details');

$('.close-alert-button').click(function() {
    close();
});

$('#block-button').click(function() {
    sendMessageToBackground({
        type: 'block-element',
        source: 'report-url' // signals to open the blocker although the report url form is open
    });
    close();
});

dropDown.click(function() {
    dropDown.css('height', (dropDown.height() == 120 ? 20 : 120) + 'px');
});

dropDownOptions.click(function(event) {
    var clickedOption = event.currentTarget;
    if (clickedOption) {
        issueType = clickedOption.innerText;
        var cssRule = getCssRule('.drop-down::before');
        cssRule.style.content = '"' + issueType + '"';
        validateForm();
    }
});

details.keyup(function() {
    validateForm();
});

alertBox.click(function() {
    event.cancelBubble=true;
    if (dropDown.height() == 120)
        dropDown.css('height', '20px');
});

sendButton.click(function() {
    if (isFormValid() == false)
        return;

    $('#report-form').fadeOut(300);
    $('#report-thanks').fadeIn(300);
    setTimeout(function() {
        close();
    }, 1500);

    sendMessageToBackground({
        type: 'report-issue',
        data: {
            includeCurrentUrlInReport: true,
            email: $('.email').val(),
            feedback: $('.details').val(),
            opener: pageParams.source,
            source: 'On Page Form',
            issueType: issueType
        }
    });
});

function validateForm() {
    if (isFormValid()) {
        sendButton.removeAttr('disabled-button');
    } else {
        sendButton.attr('disabled-button', '');
    }
}

function isFormValid() {
    return issueType != null && details.val() && details.val().length > 0;
}

function getCssRule(selectorText) {
    for (var i in document.styleSheets) {
        for (var k in document.styleSheets[i].rules) {
            if (document.styleSheets[i].rules[k].selectorText == selectorText)
                return document.styleSheets[i].rules[k];
        }
    }

    return null;
}

function close() {
    alertBackground.addClass('close-alert-background');
    setTimeout(function() {
        document.location.replace('about:blank');
    }, 400);
}

function sendMessageToBackground(message, callback) {
    var port = chrome.runtime.connect();
    port.onMessage.addListener(function(msg) {
        try {
            callback && callback(msg);
        } catch(e) { }

        port.disconnect();
    });

    port.postMessage(message);
}

function parseUrlParamsToObject(url) {
    var urlParts = new URL(url);

    var search = urlParts.search.substring(1);
    var params = {};
    if (search && search.length > 0) {
        search.split('&').forEach(function(elem) {
            var keyValue = elem.split('=');
            if (keyValue.length == 2)
                params[keyValue[0]] = decodeURIComponent(keyValue[1]);
        });
    }

    return params;
}