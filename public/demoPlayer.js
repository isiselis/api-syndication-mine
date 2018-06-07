function DemoPlayer(options) {
    // Private properties ------------------------------------------------------

    // Reference to this, to avoid scope conflicts in functions/event handlers
    let self = this;

    // Properties to handle data caching in localStorage
    let startupCacheKey;
    let lastStartupData;
    let startplaybackCacheKey;
    let lastStartPlaybackPOSTData;

    // Property to handle concurrency keepalive interval
    let concurrencyStreamInterval = null;


    // Private methods ---------------------------------------------------------
    /**
     * Object initialization
     */
    function init() {
        // Merge options with defaults
        options = $.extend({
            // default template ids to show data
            errorMessage: DemoPlayer.DEFAULT_errorMessage,
            contentData: DemoPlayer.DEFAULT_contentData,
            contentTitle: DemoPlayer.DEFAULT_contentTitle,
            contentDescription: DemoPlayer.DEFAULT_contentDescription,
            playerContainer: DemoPlayer.DEFAULT_playerContainer,
            // player backend configuration
            playerType: null,
            playerSettings: {
                key: '8ec47714-0325-4d49-a2fb-1ebeeb8e0a0d'
            },
            // client identification & access token
            deviceName: null,
            ip: null,
            uniqueId: null,
            userToken: null,
            // general playback settings to use
            preferredMediaPkgs: null,
            preferredDRM: null,
            network: null,
            contentUrlType: null,
            // retries policy for authorization requests
            maxGatewayRetries: DemoPlayer.DEFAULT_maxGatewayRetries,
            maxMAKretries: DemoPlayer.DEFAULT_maxMAKretries
        }, options);
        console.debug('Initiating DemoPlayer with options:', options);

        // Setup public properties
        self.$errorMessage = $(options.errorMessage);
        self.$contentData = $(options.contentData);
        self.$contentTitle = $(options.contentTitle);
        self.$contentDescription = $(options.contentDescription);
        self.$playerContainer = $(options.playerContainer);

        // Setup player and event handlers
        if (DemoPlayer.SUPPORTED_PLAYER_TYPES.hasOwnProperty(options.playerType)) {
            self.player = new DemoPlayer.SUPPORTED_PLAYER_TYPES[options.playerType](options.playerContainer, options.playerSettings);
            self.player.addEventHandler(DemoPlayerAdapter.EVENTS.onError, onPlayerError);
            self.player.addEventHandler(DemoPlayerAdapter.EVENTS.onPaused, onPlayerPaused);
            self.player.addEventHandler(DemoPlayerAdapter.EVENTS.onPlay, onPlayerPlaybackStart);
            self.player.addEventHandler(DemoPlayerAdapter.EVENTS.onPlaybackFinished, onPlayerPlaybackFinish);
            window.addEventListener("unload", onPageUnload);
            self.initialized = true;
        } else {
            self.$contentTitle.html('Player setup failed');
            self.showError("Specified playerType '" + options.playerType + "' unknown. Supported values: " + Object.keys(DemoPlayer.SUPPORTED_PLAYER_TYPES).join(", "));
        }

        // Try to get last startup response from cache
        startupCacheKey = 'startup-' + options.userToken + '|' + options.deviceName + '|' + options.ip + '|' + options.uniqueId;
        lastStartupData = JSON.parse(localStorage.getItem(startupCacheKey)) || {};
        if (lastStartupData.mak) {
            console.info('Startup data restored from previous session (key ' + startupCacheKey + ')');
        }

        // Try to get the last startplayback response data
        startplaybackCacheKey = 'starplayback-' + options.userToken + '|' + options.deviceName + '|' + options.ip + '|' + options.uniqueId;
        lastStartPlaybackPOSTData = JSON.parse(localStorage.getItem(startplaybackCacheKey)) || {};
        if (lastStartPlaybackPOSTData.pet) {
            console.info('Startplayback data restored from previous session (key ' + startplaybackCacheKey + ')');
        }
    }

    /**
     * Event handler for player errors
     *
     * @param {String} err
     */
    function onPlayerError(err) {
        self.showError(err);
        killPlayer(err);
    }

    /**
     * Event handler for player Pause
     */
    function onPlayerPaused() {
        self.$contentData.fadeIn();
    }

    /**
     * Event handler for player Start
     */
    function onPlayerPlaybackStart() {
        self.$contentData.fadeOut();
    }

    /**
     * Event handler for player playback end
     */
    function onPlayerPlaybackFinish() {
        killPlayer("Playback finished");
    }

    /**
     * Event handler for page unload
     * This covers the cases when the user leaves the page, be it by following a
     * link, changing the URL, moving through browser history or just closing
     * the tab or the entire browser window.
     * Note that for all AJAX request to work properly on this event we need
     * them to be synchronic
     */
    function onPageUnload() {
        $.ajaxSetup({
            async: false
        });
        killPlayer("Player unloaded, leaving page");
    }

    /**
     * Fully stops the player and hides it. Goes back to basic content data view
     *
     * @param {String} reason
     */
    function killPlayer(reason) {
        self.$contentData.fadeIn();
        self.player.rejectPlayback();
        self.initialized = false;
        self.$playerContainer.fadeOut();
        stopConcurrencyKeepAlive(reason);
        callConcurrencyStreamDelete();
    }

    /**
     * Returns a descriptive version of an error response with the server
     *
     * @param {String, Object, jqXHR} error
     */
    function getErrorDescription(error) {
        let description = error;
        if (typeof error !== 'string') {
            if (error.responseJSON) {
                description = error.responseJSON.message || error.responseJSON.description;
            } else {
                description = error.message || error.statusText || JSON.stringify(error);
            }
        }
        return description;
    }

    /**
     * Calls the concurrency API to keep the stream open for this player.
     * The playback must not be allowed if this returns a max concurrency limit
     * error; any other error is to be ignored and allow playback.
     *
     * @returns {Promise}
     */
    function callConcurrencyStream() {
        console.info("Calling concurrency to keep our slot.");
        return $.ajax({
            method: 'PUT',
            contentType: "application/json",
            url: '/api/concurrency/streams?' + $.param({
                userToken: options.userToken,
                uniqueId: options.uniqueId
            }),
            data: JSON.stringify({
                deviceId: options.uniqueId,
                properties: JSON.stringify({
                    userAgent: navigator.userAgent,
                    timestamp: Date.now()
                })
            })
        }).then(function (resConcurrency) {
            self.concurrencyLimitReached = resConcurrency !== null && resConcurrency.header.code === "-1" && resConcurrency.header.errors[0].code === "40008";
            if (self.concurrencyLimitReached) {
                console.warn("Concurrency Stream revoked (no available slots, code  " + resConcurrency.header.code + ")");
            }
        }).catch(function (e) {
            console.warn("Concurrency call failed. Disregarding to allow playback... (HTTP status " + e.status + "): " + getErrorDescription(e));
        });
    }

    /**
     * Calls the concurrency API to delete the current stream for this device,
     * leaving a slot empty for other devices to use.
     *
     * @returns {Promise}
     */
    function callConcurrencyStreamDelete() {
        console.info("Calling concurrency stream DELETE to free the slot.");
        let promDeleteStream = $.ajax({
            method: 'DELETE',
            url: '/api/concurrency/streams?' + $.param({
                userToken: options.userToken,
                uniqueId: options.uniqueId
            })
        }).promise();

        promDeleteStream.catch(function (e) {
            console.warn("Concurrency DELETE call failed. The slot will autoexpire serverside anyway (HTTP status " + e.status + "): " + getErrorDescription(e));
        });

        return promDeleteStream;
    }

    /**
     * Call concurrency and stops the keepalive interval if max streams limit is
     * reached
     */
    function keepaliveConcurrencyStream() {
        callConcurrencyStream()
                .then(function () {
                    if (self.concurrencyLimitReached && self.player.isPlaybackAllowed) {
                        self.showError(DemoPlayer.MSG_max_concurrency_reached);
                        killPlayer(DemoPlayer.MSG_max_concurrency_reached);
                    }
                });
    }

    /**
     * Stops the periodic call to concurrency to keep the slot.
     *
     * @param {String} reason
     */
    function stopConcurrencyKeepAlive(reason) {
        console.info("Stopping concurrency keepalive calls: " + reason);
        clearInterval(concurrencyStreamInterval);
    }

    /**
     * Calls content to fetch basic metadata
     *
     * @param {String} contentType
     * @param {String} contentId
     * @returns {Promise}
     */
    function callContent(contentType, contentId) {
        return $.get('/api/content/' + contentType + 's/' + contentId, {
            includes: "playbackTypeId,playbackId,metadata.title,title,metadata.synopsis,metadata.description,metadata.links,links",
            arrayFilters: "links.rel:Hero-16by9-medium"
        }).promise();
    }

    /**
     * Calls auth startup if there's no previous startup data to reuse, otherwise
     * resolves to the lastStartupData
     *
     * @returns {Promise}
     */
    function callStartup() {
        if (lastStartupData.mak) {
            console.debug('Reusing previous MAK', lastStartupData);
            let defer = $.Deferred();
            defer.resolveWith(this, [lastStartupData]);
            return defer.promise();
        } else {
            localStorage.removeItem(startupCacheKey);
            localStorage.removeItem(startplaybackCacheKey);
            lastStartPlaybackPOSTData = {};
            return $.get({
                url: '/api/auth/startup',
                data: {
                    deviceName: options.deviceName,
                    userToken: options.userToken,
                    ip: options.ip,
                    uniqueId: options.uniqueId
                }
            }).then(function (resStartup) {
                console.debug('Got new MAK, saving in cache and lastStartupData (key ' + startupCacheKey + ')');
                lastStartupData.fairPlayCertificateURL = resStartup.fairPlayCertificateURL;
                lastStartupData.country = resStartup.country;
                lastStartupData.subscriberId = resStartup.subscriberId;
                lastStartupData.mak = resStartup.mak;
                /**
                 * This atribute shows the required frecuency to call concurrency
                 * to keep the slot open for this device.
                 */
                lastStartupData.heartbeatfreqms = resStartup.heartbeatfreqms || DemoPlayer.DEFAULT_heartbeatfreqms;
                /**
                 * The client should cache the startup response in order to
                 * reuse it later, for another playback even on a future session.
                 * If/when the mak obtained expires, you will get an error in
                 * your startplayback call (status 301, message "The DRM token
                 * presented is out of phase...") requiring you to call startup
                 * again.
                 */
                localStorage.setItem(startupCacheKey, JSON.stringify(lastStartupData));

                return lastStartupData;
            });
        }
    }

    /**
     * Calls auth startPlayback, using GET only the first time, then POST
     *
     * @param {Integer} playbackTypeId   Example: 3
     * @param {Integer} playbackId       Example: 696833473
     * @returns {Promise}
     */
    function callStartPlayback(playbackTypeId, playbackId) {
        let request = {
            url: '/api/auth/startPlayback?' + $.param({
                // from startup response
                mak: lastStartupData.mak,
                subscriberId: lastStartupData.subscriberId,
                country: lastStartupData.country,
                // content to play
                contentId: playbackId,
                contentTypeId: playbackTypeId,
                // device data
                deviceName: options.deviceName,
                ip: options.ip,
                network: options.network,
                uniqueId: options.uniqueId,
                // user access as per toolbox token
                userToken: options.userToken,
                // DRM settings
                contentUrlType: options.contentUrlType,
                preferredMediaPkgs: options.preferredMediaPkgs,
                preferredDRM: options.preferredDRM
            })
        };

        if (lastStartPlaybackPOSTData.pet) {
            console.debug('Reusing previous startplayback input data from last GET', lastStartPlaybackPOSTData);
            request.type = 'POST';
            request.data = JSON.stringify(lastStartPlaybackPOSTData);
            request.contentType = 'application/json';
        } else {
            console.debug('Initial GET to startplayback');
            request.type = 'GET';
        }

        return $.ajax(request)
                .then(function (resPlayback) {
                    if (!lastStartPlaybackPOSTData.pet && resPlayback.rightsObject && resPlayback.pet) {
                        console.debug('Keeping startplayback input data for future POST requests (key ' + startplaybackCacheKey + ')');
                        lastStartPlaybackPOSTData = {
                            rightsObject: resPlayback.rightsObject,
                            pet: resPlayback.pet
                        };
                        localStorage.setItem(startplaybackCacheKey, JSON.stringify(lastStartPlaybackPOSTData));
                    }
                    return resPlayback;
                });
    }

    /**
     * This function handles the authorization flow, calling startup, concurrency
     * and startplayback as needed.
     * Requests are handled to retry as many times as configured for recoverable
     * errors, or to propagate irrecoverables errors and exausted retries.
     *
     * @param {Integer} playbackTypeId   Example: 3
     * @param {Integer} playbackId       Example: 696833473
     * @param {Integer, null} remainigStartupRetries
     * @param {String, null} remainingStartPlaybackRetries
     * @returns {Promise}
     */
    function authorizePlayback(playbackTypeId, playbackId, remainigStartupRetries,
            remainingStartPlaybackRetries) {
        return callStartup()
                .then(function () {
                    /**
                     * We check whether we still don't know the status in case
                     * this is a authorization re-try
                     */
                    if (self.concurrencyLimitReached === null) {
                        return callConcurrencyStream();
                    }
                })
                .then(function () {
                    if (self.concurrencyLimitReached) {
                        throw DemoPlayer.MSG_max_concurrency_reached;
                    } else if (!concurrencyStreamInterval) {
                        console.info('Concurrency keepalive calls will be done every ' + lastStartupData.heartbeatfreqms + ' milliseconds');
                        concurrencyStreamInterval = setInterval(keepaliveConcurrencyStream, lastStartupData.heartbeatfreqms);
                    }
                })
                .then(function () {
                    return callStartPlayback(playbackTypeId, playbackId)
                            .catch(function (e) {
                                console.warn('Start playback failed (HTTP status ' + e.status + '): ' + getErrorDescription(e));
                                /**
                                 * SUGGESTED AUTH ERROR HANDLING
                                 *
                                 * * Gateway timeout - HTTP Status 504
                                 * * Bad Gateway - HTTP Status 502
                                 *   -> Retry the same operation {maxGatewayRetries:1} times
                                 *
                                 * * Expired mak (301, AUTH TOKEN MISMATCH) - HTTP Status 500/4xx
                                 * * Invalid mak (519, UNAUTHORIZED SUBSCRIBER) - HTTP Status 500
                                 *   -> Retry the startup to generate a new mak, then an
                                 *      initial GET startplayback. Here, we retry up to
                                 *      {maxMAKretries:3} times before showing an error to the
                                 *      user
                                 *
                                 * * Any other error (like the HTTP 4xx family -invalid
                                 *   request, content not available/not accesible-.
                                 *   -> Fail. Show error to user (irrecoverable error)
                                 */
                                if (remainingStartPlaybackRetries !== 0 && (e.status === 502 || e.status === 504)) {
                                    // gateway timeout/bad gateway: retry {maxGatewayRetries} times
                                    remainingStartPlaybackRetries = remainingStartPlaybackRetries || options.maxGatewayRetries;
                                    console.debug('Retrying startplayback (tries remaining ' + remainingStartPlaybackRetries + ')');
                                    return authorizePlayback(playbackTypeId, playbackId, remainigStartupRetries, remainingStartPlaybackRetries - 1);
                                } else if (remainigStartupRetries !== 0
                                        && (e.responseJSON && (
                                                e.responseJSON.status === 301
                                                || e.responseJSON.status === 519
                                                ))) {
                                    // mak errors: regenerate mak and retry up to {maxMAKretries} times
                                    remainigStartupRetries = remainigStartupRetries || options.maxMAKretries;
                                    console.debug('Retrying playback from startup to generate a new mak (tries remaining: ' + remainigStartupRetries + ')');
                                    lastStartupData = {};
                                    return authorizePlayback(playbackTypeId, playbackId, remainigStartupRetries - 1, null);
                                } else {
                                    // any other errors or max retries: propagate error
                                    throw e;
                                }
                            });
                });
    }


    // Public properties & methods ---------------------------------------------

    // Keep references to UI elements (see init() for setup)
    self.$errorMessage = null;
    self.$contentData = null;
    self.$contentTitle = null;
    self.$contentDescription = null;

    self.initialized = false;
    self.concurrencyLimitReached = null;

    // The player object (see init() for setup
    self.player = null;

    /**
     * Shows an error message on screen
     *
     * @param {String, Object, jqXHR} error
     */
    self.showError = function (error) {
        self.$errorMessage.append("ERROR: " + getErrorDescription(error)).show();
    };

    /**
     * Fetches basic content metadata and updates the UI to show it
     *
     * @param {String} contentType  Example: episode
     * @param {String} contentId    Example: FNGTVEpisodeH0016780zzH0016780
     * @returns {Promise} Resolves with a {playbackId,playbackTypeId} object
     */
    self.showContentDetails = function (contentType, contentId) {
        let response = callContent(contentType, contentId)
                .then(function (res) {
                    if (contentType === 'show') {
                        throw 'Shows are NOT playable; please try with an episode, movie or live event instead.';
                    }

                    return {
                        playbackId: res.playbackId,
                        playbackTypeId: res.playbackTypeId
                    };
                });

        response.catch(function (error) {
            self.$contentData.hide();
            if (error.status === 404) {
                self.showError(contentType + ' ' + contentId + ' was not found.');
            } else {
                self.showError(error);
            }
        });

        return response;
    };

    /**
     * Starts playback reproduction, setting up the player
     *
     * @param {Integer} playbackTypeId  Example: 3
     * @param {Integer} playbackId      Example: 696833473
     * @returns {Promise}
     */
    self.play = function (playbackTypeId, playbackId) {
        return authorizePlayback(playbackTypeId, playbackId, null, null)
                .then(function (resPlayback) {
                    self.player.playbackSetup(playbackId, resPlayback, lastStartupData);
                    return resPlayback;
                });
    };

    // Call initialization
    init();
}


/**
 * These are the supported player backends, mapped to their adapters
 *
 * @type Object
 */
DemoPlayer.SUPPORTED_PLAYER_TYPES = Object.freeze({
    'bitmovin': DemoPlayerBitmovinAdapter
});

/**
 * Default configuration consts
 */
DemoPlayer.DEFAULT_heartbeatfreqms = 120000; // 2 minutes by default
DemoPlayer.DEFAULT_errorMessage = '#errorMessage';
DemoPlayer.DEFAULT_contentData = '#contentData';
DemoPlayer.DEFAULT_contentTitle = '#contentTitle';
DemoPlayer.DEFAULT_contentDescription = '#contentDescription';
DemoPlayer.DEFAULT_playerContainer = '#player';
DemoPlayer.DEFAULT_maxGatewayRetries = 1;
DemoPlayer.DEFAULT_maxMAKretries = 3;
DemoPlayer.MSG_max_concurrency_reached = "You have reached your maximum allowed concurrent devices.<br>To enjoy your favorite contents on this device, you need to stop playback in another device first.";
