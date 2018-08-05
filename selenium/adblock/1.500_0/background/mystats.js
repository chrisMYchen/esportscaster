var mystats = function() {
    var that = this;
    var installTime = null;
    var privateUserId = null;
    var started = false;
    var currentlySendingBufferedStats = false;
    var bufferedDataReadyDelegates = [];
    var onStartedDelegates = [];
    var lastDonationUpdate;
    var donationsTotal;
    var donationsToday;
    var lastBlockUpdate;
    var blocksToday;
    var donationsTodayUtc;
    var donationsTodayCdt;
    var browserActionCounter;
    var blocksCounter;
    var lastActivityUpdate;
    var activityDays;
    var isDirty = false;
    var stats = {};
    var statsLsKey = 'stats';
    var statsBuffer = {};
    var statsBufferLsKey = 'dailyStatsBuffer';
    var statsBufferNextReport;
    var statsSent = 0;
    var subscriptions = {
        totalDonations: []
    };

    this.timeGetter = utcTimeGetter;

    this.incrementDonation = function(standId, causeId, tabId, tagId, adLoaded, failed) {
        var now = that.timeGetter();
        that.runWhenStarted(function() {
            onBufferedDataAvailable(function() {
                isDirty = true;
                incrementDonationFor(now, statsBuffer, standId, causeId, failed, tagId, adLoaded);

                if (failed == false) {
                    var sameDay = isSameDay(lastDonationUpdate, now);
                    donationsToday = sameDay ? donationsToday + 1 : 1;
                    donationsTodayUtc = isSameDayUtc(lastDonationUpdate, now) ? donationsTodayUtc + 1 : 1;
                    donationsTodayCdt = isSameDayByTimeZone(lastDonationUpdate, now, 'CDT') ? donationsTodayCdt + 1 : 1;

                    lastDonationUpdate = now;
                    donationsTotal++;
                    runEachSafely(subscriptions.totalDonations, function(callback) {
                        callback(donationsTotal, tabId);
                    });
                    onAnyApiCalled(now);
                }
            });
        });
    };

    this.incrementBlock = function(typeId, resourceType) {
        var now = that.timeGetter();
        that.runWhenStarted(function() {
            onBufferedDataAvailable(function() {
                isDirty = true;
                incrementBlockCounter(now, statsBuffer, typeId, resourceType);

                var sameDay = isSameDay(lastBlockUpdate, now);
                blocksToday = sameDay ? blocksToday + 1 : 1;

                blocksCounter++;
                lastBlockUpdate = now;
                onAnyApiCalled(now);
            });
        });
    };

    this.incrementPageView = function() {
        var now = that.timeGetter();
        that.runWhenStarted(function() {
            onBufferedDataAvailable(function() {
                isDirty = true;
                incrementPageViewCounter(now);
                onAnyApiCalled(now);
            });
        });
    };

    this.pageLoadCompleted = function(loadTime, timeSaved) {
        var now = that.timeGetter();
        that.runWhenStarted(function() {
            onBufferedDataAvailable(function() {
                isDirty = true;
                incrementPageLoadTime(now, statsBuffer, loadTime, timeSaved);
                onAnyApiCalled(now);
            });
        });
    };

    this.openedBrowserAction = function() {
        var now = that.timeGetter();
        that.runWhenStarted(function() {
            onBufferedDataAvailable(function() {
                isDirty = true;
                incrementBrowserActionCounter(now, statsBuffer);
                browserActionCounter++;
                onAnyApiCalled(now);
            });
        });
    };

    this.getSummary = function(today) {
        validateStarted();
        return getSummary(today);
    };

    this.start = function(userId, installedOn) {
        privateUserId = userId;
        installTime = installedOn;

        var now = that.timeGetter();
        statsBufferNextReport = now;
        lastActivityUpdate = now;
        loadData(statsLsKey, function(statsFromStorage) {
            stats = statsFromStorage;

            loadData(statsBufferLsKey, function(bufferFromStorage) {
                statsBuffer = bufferFromStorage;
                if (!stats.migrated) {
                    applyStatsOnObject(statsBuffer, stats, false);
                    stats.migrated = true;
                    setSingleStorageValue(statsLsKey, stats);
                }

                jobRunner.run('report-stats', reportStats, 30, false);
                jobRunner.run('save-my-stats', saveStatsInterval, 5, false);

                var summary = getSummary();
                browserActionCounter = summary.browserActionCounter;
                blocksCounter = summary.blocksCounter;
                donationsTotal = summary.donationsTotal;
                donationsToday = summary.donationsToday;
                blocksToday = summary.blocksToday;
                activityDays = summary.activityDays;

                var utcStats = getSummary(new Date(getUtcDateString(that.timeGetter()) + ' 00:00 UTC'));
                donationsTodayUtc = utcStats.donationsToday;

                var cdtStats = getSummary(new Date(getUtcDateString(that.timeGetter()) + ' 00:00 CDT'));
                donationsTodayCdt = cdtStats.donationsToday;

                lastDonationUpdate = now;
                lastBlockUpdate = now;

                started = true;
                runEachSafely(onStartedDelegates, function(callback) {
                    callback();
                }, function() {
                    onStartedDelegates = [];
                });
            });
        });
    };

    this.getDonationsToday = function() {
        validateStarted();
        var now = that.timeGetter();
        return isSameDay(lastDonationUpdate, now) ? donationsToday : 0;
    };

    this.getBlocksToday = function() {
        validateStarted();
        var now = that.timeGetter();
        return isSameDay(lastBlockUpdate, now) ? blocksToday : 0;
    };

    this.getBlocksTotal = function() {
        validateStarted();
        return blocksCounter;
    };

    this.getDonationsTodayUtc = function() {
        validateStarted();
        var now = that.timeGetter();
        return isSameDayUtc(lastDonationUpdate, now) ? donationsTodayUtc : 0;
    };

    this.getDonationsTodayCdt = function() {
        validateStarted();
        var now = that.timeGetter();
        return isSameDayByTimeZone(lastDonationUpdate, now, 'CDT') ? donationsTodayCdt : 0;
    };

    this.getTotalDonations = function() {
        validateStarted();
        return donationsTotal;
    };

    this.getBrowserActionCounter = function() {
        validateStarted();
        return browserActionCounter;
    };

    this.getActivityDays = function() {
        return activityDays;
    };

    this.subscribeToTotalDonations = function(callback) {
        subscriptions.totalDonations.push(callback);
    };

    this.runWhenStarted = function(callback) {
        if (started) {
            callback();
        } else {
            onStartedDelegates.push(callback);
        }
    };

    this.flush = function() {
        statsBufferNextReport = that.timeGetter();
        reportStats();
    };

    this.getBlockingData = function() {
        validateStarted();

        var minDate = null;
        var result = {
            adServers: 0,
            trackers: 0,
            malware: 0,
            popups: 0,
            blocks: 0
        };

        var daysData = {};
        summarizeStats(stats);
        summarizeStats(statsBuffer);
        function summarizeStats(obj) {
            for (var date in obj) {
                if (isNaN(Date.parse(date)))
                    continue;

                if (!obj[date].blocks)
                    continue;

                var hour = new Date(date + (date.indexOf(' ') > -1 ? ' UTC' : ''));
                var dateKey = getDateString(hour);

                var dateObj = new Date(dateKey);
                if (!minDate || minDate > dateObj)
                    minDate = dateObj;

                if (!daysData[dateKey]) {
                    daysData[dateKey] = {
                        blocks: 0,
                        adServers: 0,
                        trackers: 0,
                        malware: 0,
                        popups: 0
                    };
                }

                daysData[dateKey].blocks += obj[date].blocks;
                result.blocks += obj[date].blocks;

                if (obj[date].adServers || obj[date].trackers || obj[date].malware || obj[date].popups) {
                    daysData[dateKey].adServers += obj[date].adServers || 0;
                    result.adServers += obj[date].adServers || 0;

                    daysData[dateKey].trackers += obj[date].trackers || 0;
                    result.trackers += obj[date].trackers || 0;

                    daysData[dateKey].malware += obj[date].malware || 0;
                    result.malware += obj[date].malware || 0;

                    daysData[dateKey].popups += obj[date].popups || 0;
                    result.popups += obj[date].popups || 0;
                } else {
                    daysData[dateKey].adServers += obj[date].blocks;
                    result.adServers += obj[date].blocks;
                }
            }
        }

        if (Object.keys(daysData).length > 0) {
            var today = new Date(getDateString(new Date()));
            var currentDate = minDate;

            while (currentDate <= today) {
                var dateKey = getDateString(currentDate);
                if (!daysData[dateKey]) {
                    daysData[dateKey] = {
                        blocks: 0,
                        adServers: 0,
                        trackers: 0,
                        malware: 0,
                        popups: 0
                    };
                }

                currentDate.setDate(currentDate.getDate()+1);
            }
        }

        result.days = daysData;
        return result;
    };

    function applyStatsOnObject(source, target, add) {
        var ignore = { "tags" : true, "pv": true, "malwareSite": true };
        for (var key in source) {
            if (ignore[key])
                continue;

            if (typeof source[key] == "number") {
                if (add) {
                    if (typeof target[key] == "undefined") {
                        target[key] = source[key];
                    } else {
                        target[key] += source[key];
                    }
                } else if (typeof target[key] == "number") {
                    target[key] -= source[key];
                }
            } else if (typeof source[key] == "object") {
                if (typeof target[key] == "object") {
                    applyStatsOnObject(source[key], target[key], add);
                } else if (add) {
                    target[key] = source[key];
                }
            }
        }
    }

    function onAnyApiCalled(now) {
        var sameDay = isSameDay(lastDonationUpdate, now);
        if (!sameDay)
            activityDays += 1;

        lastActivityUpdate = now;
    }

    function saveStatsInterval() {
        if (isDirty) {
            onBufferedDataAvailable(function() {
                if (isDirty) {
                    setSingleStorageValue(statsBufferLsKey, statsBuffer);
                    isDirty = false;
                }
            });
        }
    }

    function getSummary(today) {
        today = today ? today : new Date(getDateString(that.timeGetter()) + ' 00:00');
        var lastWeek = new Date(today - 7 * 24 * 60 * 60 * 1000);
        var monday = getMondayOfWeek(today);

        var summary = {
            donationsTotal: 0,
            donationsToday: 0,
            donationsLastWeek: 0,
            donationsThisWeek: 0,
            browserActionCounter: 0,
            blocksToday: 0,
            blocksCounter: 0,
            activityDays: 0,
            blocking: {
                today: {
                    adServersBlocks: 0,
                    trackersBlocks: 0,
                    adwareBlocks: 0,
                    sponsoredBlocks: 0,
                    popupBlocks: 0
                },
                total: {
                    adServersBlocks: 0,
                    trackersBlocks: 0,
                    adwareBlocks: 0,
                    sponsoredBlocks: 0,
                    popupBlocks: 0
                }
            },
            loadTimes: {
                today: {
                    pageLoadTime: 0,
                    timeSaved: 0
                },
                total: {
                    pageLoadTime: 0,
                    timeSaved: 0
                }
            },
            today: today
        };

        var activityDaysObj = {};
        activityDaysObj[getUtcDateString(today)] = true;

        summarizeStats(stats);
        summarizeStats(statsBuffer);
        function summarizeStats(obj) {
            for (var date in obj) {
                if (isNaN(Date.parse(date))) {
                    continue;
                }

                // if it's stored per hour - load it as UTC, otherwise as local time
                var currentDate = new Date(date + (date.indexOf(' ') > -1 ? ' UTC' : ''));
                activityDaysObj[getUtcDateString(currentDate)] = true;

                for (var stand in obj[date].donations) {
                    for (var cause in obj[date].donations[stand]) {
                        var currentDonations = obj[date].donations[stand][cause];

                        if (currentDate >= today)
                            summary.donationsToday += currentDonations;

                        if (currentDate >= lastWeek)
                            summary.donationsLastWeek += currentDonations;

                        if (currentDate >= monday)
                            summary.donationsThisWeek += currentDonations;

                        summary.donationsTotal += currentDonations;
                    }
                }

                if (obj[date].engagement && obj[date].engagement.browserActionCounter)
                    summary.browserActionCounter += obj[date].engagement.browserActionCounter;

                if (obj[date].blocks >= 0) {
                    summary.blocksCounter += obj[date].blocks;

                    if (obj[date].adServers) {
                        summary.blocking.total.adServersBlocks += obj[date].adServers;
                        if (currentDate >= today)
                            summary.blocking.today.adServersBlocks += obj[date].adServers;
                    }

                    if (obj[date].trackers) {
                        summary.blocking.total.trackersBlocks += obj[date].trackers;
                        if (currentDate >= today)
                            summary.blocking.today.trackersBlocks += obj[date].trackers;
                    }

                    if (obj[date].malware) {
                        summary.blocking.total.adwareBlocks += obj[date].malware;
                        if (currentDate >= today)
                            summary.blocking.today.adwareBlocks += obj[date].malware;
                    }

                    if (obj[date].popups) {
                        summary.blocking.total.popupBlocks += obj[date].popups;
                        if (currentDate >= today)
                            summary.blocking.today.popupBlocks += obj[date].popups;
                    }

                    if (!obj[date].adServers && !obj[date].trackers && !obj[date].malware) {
                        summary.blocking.total.adServersBlocks += obj[date].blocks;
                        if (currentDate >= today)
                            summary.blocking.today.adServersBlocks += obj[date].blocks;
                    }

                    if (currentDate >= today)
                        summary.blocksToday += obj[date].blocks;
                }

                if (obj[date].loadTime) {
                    summary.loadTimes.total.pageLoadTime += obj[date].loadTime;
                    summary.loadTimes.total.timeSaved += obj[date].timeSaved;
                    if (currentDate >= today) {
                        summary.loadTimes.today.pageLoadTime += obj[date].loadTime;
                        summary.loadTimes.today.timeSaved += obj[date].timeSaved;
                    }
                }
            }
        }

        summary.activityDays = Object.keys(activityDaysObj).length;
        summary.loadTimes.today.timeSaved = parseFloat(summary.loadTimes.today.timeSaved > 0 ? summary.loadTimes.today.timeSaved.toFixed(2) : 0);
        summary.loadTimes.today.pageLoadTime = parseFloat(summary.loadTimes.today.pageLoadTime > 0 ? summary.loadTimes.today.pageLoadTime.toFixed(2) : 0);
        summary.loadTimes.total.timeSaved = parseFloat(summary.loadTimes.total.timeSaved > 0 ? summary.loadTimes.total.timeSaved.toFixed(2) : 0);
        summary.loadTimes.total.pageLoadTime = parseFloat(summary.loadTimes.total.pageLoadTime > 0 ? summary.loadTimes.total.pageLoadTime.toFixed(2) : 0);

        return summary;
    }

    function validateStarted() {
        if (started == false) {
            throw "Stats wasn't started yet";
        }
    }

    function shouldReportFrequently() {
        return statsSent < 30 && that.installTime != null && isLastMinutes(that.installTime, 60);
    }

    function incrementDonationFor(now, obj, standId, causeId, failed, tagId, adLoaded) {
        var hour = getUtcDateAndHourString(now);
        if (!obj[hour])
            obj[hour] = {};

        if (failed == false) {
            if (!obj[hour].donations)
                obj[hour].donations = {};

            if (!obj[hour].donations[standId])
                obj[hour].donations[standId] = {};

            if (!obj[hour].donations[standId][causeId])
                obj[hour].donations[standId][causeId] = 0;

            obj[hour].donations[standId][causeId] += 1;
        }

        if (tagId != null && adLoaded != null) {
            if (!obj[hour].tags)
                obj[hour].tags = {};

            if (!obj[hour].tags[tagId])
                obj[hour].tags[tagId] = {
                    total: 0,
                    fill: 0
                };

            obj[hour].tags[tagId].total += 1;
            if (adLoaded)
                obj[hour].tags[tagId].fill += 1;

            if (failed)
                obj[hour].tags[tagId].failed = (obj[hour].tags[tagId].failed ? obj[hour].tags[tagId].failed : 0) + 1;
        }
    }

    function incrementBlockCounter(now, obj, typeId, resourceType) {
        var hour = getUtcDateAndHourString(now);
        if (!obj[hour])
            obj[hour] = {};

        obj[hour].blocks = obj[hour].blocks ? obj[hour].blocks + 1 : 1;

        if (typeId == stndz.blockTypes.adServer || typeId == stndz.blockTypes.sponsored) {
            obj[hour].adServers = obj[hour].adServers ? obj[hour].adServers + 1 : 1;
        }

        if (typeId == stndz.blockTypes.tracker) {
            obj[hour].trackers = obj[hour].trackers ? obj[hour].trackers + 1 : 1;
        }

        if (typeId == stndz.blockTypes.malware) {
            obj[hour].malware = obj[hour].malware ? obj[hour].malware + 1 : 1;
            if (resourceType == "main_frame") {
                obj[hour].malwareSite = obj[hour].malwareSite ? obj[hour].malwareSite + 1 : 1;
            }
        }

        if (typeId == stndz.blockTypes.popup) {
            obj[hour].popups = obj[hour].popups ? obj[hour].popups + 1 : 1;
        }
    }

    function incrementPageViewCounter(now) {
        var hour = getUtcDateAndHourString(now);
        if (!statsBuffer[hour])
            statsBuffer[hour] = {};

        if (!statsBuffer[hour].pv)
            statsBuffer[hour].pv = 0;

        statsBuffer[hour].pv += 1;
    }

    function incrementBrowserActionCounter(now, obj) {
        var hour = getUtcDateAndHourString(now);
        if (!obj[hour])
            obj[hour] = {};

        if (!obj[hour].engagement)
            obj[hour].engagement = {
                browserActionCounter: 0
            };

        obj[hour].engagement.browserActionCounter += 1;
    }

    function incrementPageLoadTime(now, obj, loadTime, timeSaved) {
        var hour = getUtcDateAndHourString(now);
        if (!obj[hour])
            obj[hour] = {};

        if (!obj[hour].loadTime) {
            obj[hour].loadTime = loadTime;
            obj[hour].timeSaved = timeSaved;
        } else {
            obj[hour].loadTime += loadTime;
            obj[hour].timeSaved += timeSaved;
        }
    }

    function loadData(lsKey, callback) {
        getStorageValue(lsKey, function(exists, data) {
            callback(data || {});
        });
    }

    function onBufferedDataAvailable(callback) {
        if (currentlySendingBufferedStats) {
            bufferedDataReadyDelegates.push(callback);
        } else {
            callback();
        }
    }

    function finishedSendingBufferedData() {
        currentlySendingBufferedStats = false;
        runEachSafely(bufferedDataReadyDelegates, function(callback) {
            callback();
        }, function () {
            bufferedDataReadyDelegates = [];
        });
    }

    function reportStats() {
        try {
            if (!privateUserId)
                return;

            var now = that.timeGetter();
            if (now < statsBufferNextReport)
                return;

            if (currentlySendingBufferedStats)
                return;
            else
                currentlySendingBufferedStats = true;

            var hours = [];
            var todayString = getUtcDateString(now);
            var isTodayInStats = false;
            for (var hour in statsBuffer) {
                isTodayInStats = isTodayInStats || hour.indexOf(todayString) == 0;
                hours.push({ hour: hour, data: statsBuffer[hour] });
            }

            if (hours.length == 0 || isTodayInStats == false) {
                var nowKey = getUtcDateAndHourString(now);
                hours.push({
                    hour: nowKey,
                    data: {
                        keepAlive: 1
                    }
                });
            }

            statsSent++;
            callUrl({
                url: stndz.resources.reportStats,
                method: 'POST',
                data: {
                    privateUserId: privateUserId,
                    hours: hours
                }
            }, function() {
                applyStatsOnObject(statsBuffer, stats, true);
                setSingleStorageValue(statsLsKey, stats);

                statsBuffer = {};
                setSingleStorageValue(statsBufferLsKey, statsBuffer);

                updateUserAttributes({
                    totalDonations: donationsTotal,
                    totalDashboardOpenCount: browserActionCounter
                });

                statsBufferNextReport = shouldReportFrequently() ?
                    new Date(that.timeGetter().getTime() + 2 * 60 * 1000) : // every 2 mins
                    new Date(that.timeGetter().getTime() + getRandomWithinRange(120, 180) * 60 * 1000); // every 2-3 hours

                finishedSendingBufferedData();

            }, function() {

                statsBufferNextReport = new Date(that.timeGetter().getTime() + 2 * 60 * 1000); // retry in 2 mins
                finishedSendingBufferedData();

            });
        } catch (e) {
            serverLogger.log(stndz.logEventTypes.clientError, {
                source: 'mystats',
                message: encodeURIComponent((e.message || '').replace('\n', '')),
                stack: encodeURIComponent((e.stack || '').replace('\n', ''))
            }).flush();
        }
    }
};

var $stats = new mystats();
function startStats() {
    $st.onUserReady(function(userData) {
        $stats.start(userData.privateUserId, installTime);
    });
}