/**
 * This base class is not meant to be used directly, but to be extended by
 * custom adapters for different players.
 * This provides for a basic event registering/triggering mechanism and
 * documents the function that concrete classes should implement.
 *
 * See DemoPlayerBitmovinAdapter for an example using bitmovin.

 * @param {string} playerContainer  CSS selector for the element where the player
 *                                  should be drawn
 * @param {object} options          Any extra setting the player may need
 */
function DemoPlayerAdapter(playerContainer, options) {
    let self = this;

    /**
     * This holds the map for eventName-subscribers list.
     * See DemoPlayerAdapter.EVENTS for a list of available events.
     *
     * @type object
     */
    let events = {};

    /**
     * Support adding handlers to an event queue.
     *
     * @param {type} event
     * @param {type} callback
     * @returns {undefined}
     */
    self.addEventHandler = function (eventName, callback) {
        var handlers = events[eventName] || [];
        handlers.push(callback);
        events[eventName] = handlers;
    };

    /**
     * This internal function allows triggeting an event to all subscribers.
     *
     * @param {type} eventName
     * @param {type} data
     * @returns {undefined}
     */
    self.triggerEvent = function (eventName, data) {
        var handlers = events[eventName];
        if (!handlers || handlers.length < 1)
            return;
        handlers.forEach(function (handler) {
            handler(data);
        });
    };

    /**
     * This function should be implemented in custom classes. Setup the player
     * to use the desired MediaPackage and DRM pair, if the isPlaybackAllowed
     * flag is true.
     *
     * @param {Integer} playbackId      Example: 696833473
     * @param {object} resPlayback      startplayback call response
     * @param {object} lastStartupData  Details from the last startup response
     */
    self.playbackSetup = function (playbackId, resPlayback, lastStartupData) {};

    /**
     * This should fully stop reproduction and avoid future playback
     */
    self.rejectPlayback = function () {};

    self.isPlaybackAllowed = true;
}


/**
 * These are the player events that custom classes should trigger,
 * You should map the specific player events to these generic events.
 *
 * @type Object
 */
DemoPlayerAdapter.EVENTS = Object.freeze({
    onError: "onError",
    onPaused: "onPaused",
    onPlay: "onPlay",
    onPlaybackFinished: "onPlaybackFinished"
});