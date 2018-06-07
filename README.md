# Syndication API test-player

A syndicated player app where you can see how to use the Syndication API to play some content.

This project requires Node.js to run the server-side.

On the client, HTML5 video player [bitmovin-player](https://bitmovin.com/video-player/) is used for playback.

## Running Locally

Make sure you have [Node.js v6.*](http://nodejs.org/)

```sh
unzip test-player
cd test-player
mv example_dot_env_file .env
vi .env   # edit with your credentials and save
npm install
# start the app locally
npm start
# or start the app and keep the logs in a HAR file
npm start --silent > playerlog.har
```

Your app should now be running on [localhost:5000](http://localhost:5000/).

You can stop the server anytime, by pressing Ctrl+C on the terminal.

The full, canonical URL you would use to fully customize the experience is:
```
http://localhost:5000/?&player={{ bitmovin }}&playerKey={{YOUR_PLAYER_KEY}}&deviceName={{YOUR_USER_DEVICE_TYPE}}&ip={{YOUR_USER_IP_ADDRESS}}&network={{YOUR_USER_NETWORK_TYPE}}&contentUrlType={{ smil || manifest }}&uniqueId={{YOUR_UNIQUE_ID_FOR_THIS_USER}}&userToken={{TOOLBOX_USER_TOKEN}}&preferredMediaPkgs={{PREFERRED_MEDIA_PACKAGE}}&preferredDRM={{PREFERRED_DRM}}&contentType={{ episode | movie | event }}&contentId={{contentId}}
```

The following query params are optional and may be omitted:

- player: Defaults to *bitmovin* (only supported backend at the moment). Specify the player backend to use.
- playerKey: This parameter only applies to *bitmovin* players. You do not need to get a product key if you just plan to test this player from localhost. For any other domain, please login to [bitmovin.com](https://bitmovin.com), add all your domains and subdomains to your account and then access your personal key on the *Bitmovin Dashboard*.
- deviceName: Defaults to *syndicatedwebClient*.
- network: Defaults to *WIFI*.
- contentUrlType: Defaults to *manifest*.

You can complete the following minimized URLs with contentType and contentId and open them on your browser:

* Firefox - Chrome, try Widevine DASH:
```
http://localhost:5000/?preferredMediaPkgs=DASH&preferredDRM=6:2.0&ip={{YOUR_USER_IP_ADDRESS}}&uniqueId={{YOUR_UNIQUE_ID_FOR_THIS_USER}}&userToken={{TOOLBOX_USER_TOKEN}}&contentType={{ episode | movie | event }}&contentId={{contentId}}
```

* Safari (Mac Os), try FairPlay HLS:
```
http://localhost:5000/?deviceName=syndicatediostablet&preferredMediaPkgs=HLS&preferredDRM=7:1.0&ip={{YOUR_USER_IP_ADDRESS}}&uniqueId={{YOUR_UNIQUE_ID_FOR_THIS_USER}}&userToken={{TOOLBOX_USER_TOKEN}}&contentType={{ episode | movie | event }}&contentId={{contentId}}
```
