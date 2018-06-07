/**
 * This concrete class works as an adapter for bitmovin-player events and setup.
 * See https://bitmovin.com/video-player/ for further details.
 *
 * @param {string} playerContainer  Element ID where the player should be drawn
 * @param {object} options          Any extra setting the player may need.
 *                                  You can specify a playerKey for bitmovin
 *                                  under the 'key' attribute.
 * @returns {DemoPlayerBitmovinAdapter}
 */
function DemoPlayerBitmovinAdapter(playerContainer, options) {
    let self = this;

    self.backend = bitmovin.player(playerContainer.substring(1));

    self.backend
            .addEventHandler(bitmovin.player.EVENT.ON_ERROR, function (e) {
                self.triggerEvent(DemoPlayerAdapter.EVENTS.onError, e);
            })
            .addEventHandler(bitmovin.player.EVENT.ON_PAUSED, function (e) {
                self.triggerEvent(DemoPlayerAdapter.EVENTS.onPaused, e);
            })
            .addEventHandler(bitmovin.player.EVENT.ON_PLAY, function (e) {
                self.triggerEvent(DemoPlayerAdapter.EVENTS.onPlay, e);
            })
            .addEventHandler(bitmovin.player.EVENT.ON_PLAYBACK_FINISHED, function (e) {
                self.triggerEvent(DemoPlayerAdapter.EVENTS.onPlaybackFinished, e);
            });

    self.playbackSetup = function (playbackId, resPlayback, lastStartupData) {
        if (self.isPlaybackAllowed) {
            let playerConf = {
                playback: {
                    autoplay: true
                },
                logs: {
                    bitmovin: true,
                    level: bitmovin.player.LOGLEVEL.LOG
                },
                key: '8ec47714-0325-4d49-a2fb-1ebeeb8e0a0d',
                source: {
                    dash: resPlayback.contentUrl,
                    hls: resPlayback.contentUrl,
		    options: {withCredentials: true, manifestWithCredentials: true},
                    drm: {
                        widevine: {
                            LA_URL: resPlayback.licenseUrl
                        },
                        playready: {
                            LA_URL: resPlayback.licenseUrl
                        },
                        fairplay: {
                            LA_URL: resPlayback.licenseUrl,
                            certificateURL: lastStartupData.fairPlayCertificateURL,
                            licenseResponseType: 'blob',
                            prepareContentId: function (uri) {
                                return playbackId.toString();
                            },
                            prepareMessage: function (keyMessageEvent, keySession) {
                                return keyMessageEvent.messageBase64Encoded;
                            },
                            prepareLicenseAsync: function (ckc) {
                                return new Promise(function (resolve, reject) {
                                    let reader = new FileReader();
                                    reader.addEventListener('loadend', function () {
                                        let array = new Uint8Array(reader.result);
                                        resolve(array);
                                    });
                                    reader.addEventListener('error', function () {
                                        reject(reader.error);
                                    });
                                    reader.readAsArrayBuffer(ckc);
                                });
                            },
                            headers: [
                                {
                                    name: 'Content-Type',
                                    value: 'application/octet-stream'
                                },
                                {
                                    name: 'X-Content-Transfer-Encoding',
                                    value: 'base64'
                                }
                            ]
                        }
                    }
                }
            };

            self.backend.setup(playerConf);
        }
    };

    self.rejectPlayback = function () {
        self.isPlaybackAllowed = false;
        if (self.backend.isSetup()) {
            self.backend.unload();
        }
    };
}

// Inherit from DemoPlayerAdapter
DemoPlayerBitmovinAdapter.prototype = new DemoPlayerAdapter();
