/**
 * The only DemoPlayer instance for our player is public so you can access it
 * from the browser console if needed.
 *
 * @type DemoPlayer
 */
var demoPlayer;


/**
 * Returns the value of the given query param
 *
 * @param {String} query_param_name   The name of the query param to fetch
 * @returns {String, null}            The query param value, or null if it is
 *                                    missing
 */
function get_query_param(query_param_name) {
    query_param_name = query_param_name.replace(/[*+?^$.\[\]{}()|\\\/]/g, "\\$&"); // escape RegEx meta chars
    let match = location.search.match(new RegExp("[?&]" + query_param_name + "=([^&]+)(&|$)"));
    return match && decodeURIComponent(match[1].replace(/\+/g, " "));
}


// This is the initial on-load function that triggers all requests
$(function () {
    // Parse URL params and create the player
    let contentType = get_query_param('contentType'),
            contentId = get_query_param('contentId');

    demoPlayer = new DemoPlayer({
        // which player backed to use
        playerType: get_query_param('player') || 'bitmovin',
        playerSettings: {
            // bitmovin payer key is not required if you run this app in localhost
            key: get_query_param('playerKey')
        },
        // client identification & access token
        deviceName: get_query_param('deviceName') || 'syndicatedwebClient',
        ip: get_query_param('ip'),
        uniqueId: get_query_param('uniqueId'),
        userToken: get_query_param('userToken'),
        // general playback settings to use
        preferredMediaPkgs: get_query_param('preferredMediaPkgs'),
        preferredDRM: get_query_param('preferredDRM'),
        network: get_query_param('network') || 'WIFI',
        contentUrlType: get_query_param('contentUrlType') || 'manifest'
    });

    if (demoPlayer.initialized) {
        // Display content data and start playback
        demoPlayer.showContentDetails(contentType, contentId)
                .then(function (res) {
                    return demoPlayer.play(res.playbackTypeId, res.playbackId)
                            .catch(function (e) {
                                demoPlayer.showError(e);
                            });
                });
    }
});