var operatingSystem;
getOperatingSystem(function(os) {
    operatingSystem = os;
});

function updateUserAttributes(attributes, retry) {
    retry = retry || 0;
    sendMessageToBackground({
        type: stndz.messages.updateUser,
        retry: retry,
        userData: {
            attributes: attributes
        }
    });
}

function getUrlHost(url) {
    try {
        if (url == "about:blank")
            return "about:blank";

        var urlDetails = new URL(url);
        return urlDetails.hostname.indexOf('www.') == 0 ? urlDetails.hostname.substring(4) : urlDetails.hostname;
    } catch(e) {
        return null;
    }
}

function getDateString(date) {
    return date.getFullYear() + '-' + (date.getMonth()+1) + '-' + date.getDate();
}

function getUtcDateString(date) {
    return date.getUTCFullYear() + '-' + (date.getUTCMonth()+1) + '-' + date.getUTCDate();
}

function getUtcDateAndHourString(date) {
    return date.getUTCFullYear() + '-' + (date.getUTCMonth()+1) + '-' + date.getUTCDate() + ' ' + getDoubleDigitNumber(date.getUTCHours()) + ':00';
}

function getUtcDateAndMinuteString(date) {
    return date.getUTCFullYear() + '-' + (date.getUTCMonth()+1) + '-' + date.getUTCDate() + ' ' + getDoubleDigitNumber(date.getUTCHours()) + ':' + getDoubleDigitNumber(date.getUTCMinutes());
}

function getUtcDateAndSecondString(date) {
    return date.getUTCFullYear() + '-' + (date.getUTCMonth()+1) + '-' + date.getUTCDate() + ' ' + getDoubleDigitNumber(date.getUTCHours()) + ':' + getDoubleDigitNumber(date.getUTCMinutes()) + ':' + getDoubleDigitNumber(date.getUTCSeconds());
}

function getLocalDateAndMinuteString(date) {
    return date.getFullYear() + '-' + (date.getMonth()+1) + '-' + date.getDate() + ' ' + getDoubleDigitNumber(date.getHours()) + ':' + getDoubleDigitNumber(date.getMinutes());
}

function getLocalDateAndSecondString(date) {
    return date.getFullYear() + '-' + (date.getMonth()+1) + '-' + date.getDate() + ' ' + getDoubleDigitNumber(date.getHours()) + ':' + getDoubleDigitNumber(date.getMinutes()) + ':' + getDoubleDigitNumber(date.getSeconds());
}

function getDoubleDigitNumber(number) {
    return number.toString().length == 1 ? '0' + number : number;
}

function getMondayOfWeek(date) {
    var day = date.getDay();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + (day == 0?-6:1)-day );
}

function toUTCString(time) {
    return time.getUTCFullYear() + '-' +
        (time.getUTCMonth() + 1) + '-' +
        time.getUTCDate() + ' ' +
        time.getUTCHours() + ':' +
        time.getUTCMinutes() + ':' +
        time.getUTCSeconds()
}

function isLastMinutes(time, minutes) {
    return isLastSeconds(time, minutes * 60);
}

function isLastSeconds(time, seconds) {
    return (utcTimeGetter() - time) < seconds * 1000;
}

function isSameDay(date1, date2) {
    return date1.getFullYear() == date2.getFullYear() && date1.getMonth() == date2.getMonth() && date1.getDate() == date2.getDate();
}

function isSameDayUtc(date1, date2) {
    return date1.getUTCFullYear() == date2.getUTCFullYear() && date1.getUTCMonth() == date2.getUTCMonth() && date1.getUTCDate() == date2.getUTCDate();
}

function isSameDayByTimeZone(date1, date2, timeZone) {
    var timeZoneDiff = getHoursDiffByTimeZone(timeZone);
    var date1WithTimeZone = new Date(date1.getUTCFullYear(), date1.getUTCMonth(), date1.getUTCDate(), date1.getHours() + timeZoneDiff, 0, 0, 0);
    var date2WithTimeZone = new Date(date2.getUTCFullYear(), date2.getUTCMonth(), date2.getUTCDate(), date2.getHours() + timeZoneDiff, 0, 0, 0);
    return date1WithTimeZone.getFullYear() == date2WithTimeZone.getFullYear() && date1WithTimeZone.getMonth() == date2WithTimeZone.getMonth() && date1WithTimeZone.getDate() == date2WithTimeZone.getDate();
}

function getHoursDiffByTimeZone(timeZone) {
    var now = new Date();
    return ((new Date(getUtcDateString(now) + ' 00:00 UTC') - new Date(getUtcDateString(now) + ' 00:00 ' + timeZone))/(60 * 60 * 1000)) + (now.getTimezoneOffset()/60);
}

function sendEmail(type, source, content) {
    callUrl({
        url: 'https://zapier.com/hooks/catch/b2t6v9/?type=' + encodeURIComponent(type) + '&Source=' + encodeURIComponent(source) + '&Content=' + encodeURIComponent(content)
    });
}

var browserId = null;
function getBrowserId() {
    if (!browserId) {
        browserId = navigator.userAgent.indexOf('Vivaldi') > -1 ? 2 : 1;
    }

    return browserId;
}

function getBrowserName() {
    return getBrowserId() == 2 ? 'Vivaldi' : 'Chrome';
}

var browserVersion = null;
function getBrowserVersion() {
    if (browserVersion == null) {
        try {
            var matches = /Chrome\/([0-9]*)/.exec(navigator.userAgent);
            if (matches && matches.length >= 2) {
                browserVersion = parseInt(matches[1]);
            }
        } catch (e) { }

        if (browserVersion == null)
            browserVersion = -1;
    }

    return browserVersion;
}

function getMandatory(obj, name) {
    if (obj)
        return obj;

    throw name + ' is mandatory';
}

var bulkEventLogger = function(settings) {
    var that = this;
    var logs = [];
    var timeGetter = settings.timeGetter || utcTimeGetter;
    var maxTimeInterval = settings.maxTimeInterval || 30000;
    var maxEventCount = settings.maxEventCount || 20;
    var logPath = settings.logPath || stndz.resources.log;
    var maxEventCountPerTransaction = settings.maxEventCountPerTransaction || 10;
    var doc = settings.document || document;
    var appId = getMandatory(settings.appId, 'appId');
    var browserVersion = getBrowserVersion().toString();

    this.log = function(eventTypeId, data) {
        var logObj = {
            eventTime: toUTCString(timeGetter()),
            browserId: getBrowserId(),
            browserVersion: browserVersion,
            appId: appId,
            appVersion: getAppVersion(),
            os: operatingSystem,
            eventTypeId: eventTypeId,
            data: data
        };

        logs.push(logObj);

        if (logs.length >= maxEventCount)
            prepareAndSend();

        return that;
    };

    this.flush = function() {
        prepareAndSend();
    };

    function prepareAndSend() {
        if (logs.length == 0)
            return;

        var batch = new Array();
        while (logs.length > 0) {
            batch.push(logs.pop());
            if (batch.length == maxEventCountPerTransaction || logs.length == 0) {
                sendToServer(batch);

                return;
            }
        }
    }

    function sendToServer(logsArr, success, failure) {
        var batchGuid = createGuid();
        var sendArr = [];
        for (var i = 0; i < logsArr.length; i++) {
            logsArr[i].logBatchGuid = batchGuid;
            if (logsArr[i].data)
                logsArr[i].data.geo = stndz.settings.geo;

            sendArr.push(JSON.stringify(logsArr[i]));
        }

        var url = logPath + '?data=' + encodeURIComponent('[' + sendArr.join(',') + ']') + '&rand=' + getRandom();
        var image = doc.createElement('img');

        image.onerror = function() {
            failure && failure(logsArr);
        };

        image.onload = function() {
            success && success(logsArr);
        };

        image.src = url;
    }

    jobRunner.run('bulk-event-logger-send', prepareAndSend, maxTimeInterval/1000, false);
};