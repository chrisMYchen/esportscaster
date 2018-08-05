function getNormalizedTime(value) {
    return value == 0 ? '0 seconds' :
           value < 100 ? (Math.round(value * 10)/10).toString() + ' seconds' :
           value < 60 * 60 ? 'over ' + parseInt(value/60) + ' minutes' :
           value < 60 * 60 * 24 ? 'over ' + parseInt(value/(60 * 60)) + ' hours' :
           'over ' + parseInt(value/(60 * 60 * 24)) + ' days';
}

function getNormalizedNumber(value) {
    return value == null ? '0' :
           value < 1000 ? value.toString() :
           value < 1000000 ? 'over ' + Math.floor(value/1000) + 'K' :
           'over ' + Math.floor(value/1000000) + 'M';
}

function updateAllPropsRecursive(obj, func) {
    for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) {
            obj[prop] = func(obj[prop]);
            if (obj[prop] !== null && typeof(obj[prop]) == "object") {
                updateAllPropsRecursive(obj[prop], func);
            }
        }
    }
}

function convertStringDatesToDates(obj) {
    updateAllPropsRecursive(obj, function(value) {
        return typeof value == "string" && isNaN(Date.parse(value)) == false ? new Date(Date.parse(value)) : value;
    });
}

function mergeObjects(source, target) {
    for (var attr in source) {
        if (source.hasOwnProperty(attr) == false)
            continue;

        if (typeof source[attr] == "object") {
            target[attr] = {};
            mergeObjects(source[attr], target[attr]);
        } else {
            target[attr] = source[attr];
        }
    }

    return target;
}

var localStorageService = new function() {
    this.readJson = function(key) {
        try {
            var value = localStorage[key];
            return value ? JSON.parse(value) : null;
        } catch(e) { }
    };

    this.writeJson = function(key, value) {
        try {
            localStorage[key] = JSON.stringify(value);
            return true;
        } catch(e) { }
    };

    this.remove = function(key) {
        try {
            delete localStorage[key];
            return true;
        } catch(e) {
            return false;
        }
    };
};

var jobRunner = new function() {
    var jobs = {}; // name > intervalId,startTime
    var that = this;

    this.run = function(name, func, intervalSeconds, runNow, expirationSeconds) {
        if (jobs[name])
            throw new Error('a job with the name ' + name + ' already exists');

        if (runNow) {
            var stop = runSafely(func);
            if (stop)
                return;
        }

        var intervalId = callEvery(function() {
            if (expirationSeconds) {
                var now = new Date();
                var startTime = jobs[name].startTime;
                var seconds = (now - startTime) / 1000;
                if (seconds >= expirationSeconds) {
                    that.stop(name);
                    return;
                }
            }

            var stop = runSafely(func);
            if (stop)
                that.stop(name);

        }, intervalSeconds * 1000);

        jobs[name] = {
            intervalId: intervalId,
            startTime: new Date()
        };
    };

    this.stop = function(name) {
        if (jobs[name]) {
            var intervalId = jobs[name].intervalId;
            delete jobs[name];
            stopInterval(intervalId);
        }
    };

    this.isRunning = function(name) {
        return jobs.hasOwnProperty(name);
    };

    function runSafely(func) {
        try {
            return func();
        } catch (e) { }
    }
};

var updatingDataFromServer = function(settings) {
    var dataName = settings.dataName;
    var dataNameStorageKey = dataName + 'List';
    var dataDateStorageKey = dataName + 'Date';
    var timeGetter = settings.timeGetter || utcTimeGetter;
    var expirationMinutes = settings.expirationMinutes;
    var resourceUrl = settings.resourceUrl;
    var onUpdate = settings.onUpdate;
    var isRawResponse = settings.isRawResponse;
    var lastUpdateTime = null;

    this.start = function(forceUpdate) {
        if (forceUpdate) {
            loadData();
        } else {
            getStorageValue(dataNameStorageKey, function(dataExists, data) {
                if (dataExists) {
                    onUpdate(data, true);
                    getStorageValue(dataDateStorageKey, function(dateExists, date) {
                        if (dateExists)
                            lastUpdateTime = new Date(date);
                    });
                } else {
                    loadData();
                }
            });
        }

        jobRunner.run(settings.dataName + '-load-data', loadDataInterval, 60, false);
    };

    this.forceUpdate = function() {
        loadData();
    };

    function loadDataInterval() {
        var shouldLoadData = lastUpdateTime == null;
        if (shouldLoadData === false) {
            var lastUpdateMinsDiff = (timeGetter() - lastUpdateTime) / (1000 * 60);
            shouldLoadData = lastUpdateMinsDiff >= expirationMinutes;
        }

        shouldLoadData && loadData();
    }

    function loadData(lastWaitSeconds) {
        callUrl({ method: 'GET', url: resourceUrl, raw: isRawResponse }, function(data) {
            onUpdate(data, false);
            setSingleStorageValue(dataNameStorageKey, data, function(success) {
                if (success) {
                    var now = timeGetter();
                    lastUpdateTime = now;
                    setSingleStorageValue(dataDateStorageKey, now.toString());
                }
            });
        }, function() {
            var waitTillRetry = (lastWaitSeconds ? lastWaitSeconds : 0) + 0.5;
            callIn(function() {
                loadData(waitTillRetry);
            }, waitTillRetry * 1000);
        });
    }
};