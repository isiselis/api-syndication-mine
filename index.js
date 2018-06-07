var express = require('express');
var proxy = require('http-proxy-middleware');
var path = require('path');
var url = require('url');
var _ = require('lodash');

var date = new Date();
if (!process.env.client_id) {
    console.log('{"log":{"version":"1.1","creator":{"name":"api-syndication-test-player","version":"0.2"},"browser":{"name":"n/a","version":"n/a"},"entries":[{"startedDateTime":"' + date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + '","time":' + date.getMilliseconds() + ',"request":{"method":"start","url":"n/a","httpVersion":"n/a","cookies":[],"headers":[],"queryString":"n/a","headersSize":0,"bodySize":0},"response":{"status":200,"statusText":"Loaded configuration manually","httpVersion":"n/a","cookies":[],"headers":[],"content":{},"redirectURL":"","headersSize":0,"bodySize":0},"cache":{},"timings":{}}');
    require('dotenv').config();
}

var queryString = require('query-string');
var app = express();

// START Logging functionality
function buildHarHeaders(headers) {
    return headers ? Object.keys(headers).map(function (key) {
        return {
            name: key,
            value: headers[key]
        };
    }) : [];
}

function buildPostData(body) {
    return body ? {
        mimeType: 'application/json',
        text: body
    } : null;
}

function handle(signal) {
    process.exit();
}

function buildHarEntry(res, req, body) {
    var startTime = req.startTime;
    var endTime = Date.now();
    var entry = {
        startedDateTime: new Date(startTime).toISOString(),
        time: endTime - startTime,
        request: {
            method: req.method,
            url: req.url,
            httpVersion: 'HTTP/' + req.httpVersion,
            cookies: [],
            headers: buildHarHeaders(req.headers),
            queryString: [],
            postData: buildPostData(req.body),
            headersSize: -1,
            bodySize: -1
        },
        response: {
            status: res.statusCode,
            statusText: res.statusMessage,
            httpVersion: 'HTTP/' + res.httpVersion,
            cookies: [],
            headers: buildHarHeaders(res.headers),
            content: {
                size: body.length,
                mimeType: res.headers['content-type'],
                text: body
            },
            redirectURL: '',
            headersSize: -1,
            bodySize: -1
        },
        cache: {},
        timings: {
            send: -1,
            receive: -1,
            wait: endTime - startTime
        }
    };
    return entry;
}
// END Logging functionality


// Look for static content on /public folder
app.use(express.static(path.join(__dirname, 'public')));


function errorHandler(err, req, res) {
    res.writeHead(500, {
        'Content-Type': 'text/plain'
    });
    res.end('Internal Server Error');
}

//This is a very simple proxy service.
//You must use a proxy service on our side and never expose the Fox Syndication API to the world.
app.use('/api', proxy({
    //Configure the app to use the environment that you want.
    target: 'https://' + process.env.API_DOMAIN,
    changeOrigin: true,
    logLevel: 'error',

    pathRewrite: {
        '^/api': ''
    },

    onError: errorHandler,

    // Through the following event the requests from the client are modified in
    // order to be sent to the actual Syndication API
    onProxyReq: function (proxyReq, req, res) {
        // The key is a regex an the value is an object with query params.
        var replaceParams = {
            // All the requests to the API must be authenticated with your credentials.
            '': {// empty catch-all regex
                client_id: process.env.client_id,
                client_secret: process.env.client_secret
            }
        };

        // The url being called on the API.
        var parsedUrl = url.parse(proxyReq.path);

        // The query string parsed as an object
        var parsedQs = queryString.parse(parsedUrl.query);

        // The path (method) used on the API
        var path = parsedUrl.pathname;

        // Iterate over the config and if the regex matches replace/add the params.
        _.map(replaceParams, function (paramsReplace, regexPathStr) {
            if (new RegExp(regexPathStr).test(path)) {
                _.merge(parsedQs, paramsReplace);
            }
        });

        // Modify the query string before making the call to the Syndication API
        proxyReq.path = path + '?' + queryString.stringify(parsedQs, {
            encode: false
        });

        req.startTime = Date.now();
    },

    onProxyRes: function (proxyRes, req, res) {
        var _write = res.write;
        var _writeHead = res.writeHead;
        res.writeHead = function () {};
        res.write = function (data) {
            res.write = _write; // restore
            res.writeHead = _writeHead;

            try {
                data = data.toString('utf-8');
                console.log(",\n" + JSON.stringify(buildHarEntry(proxyRes, req, data)));
                res.status(proxyRes.statusCode);
                res.write(data);
            } catch (err) {
                errorHandler(err, req, res);
            }
        };
    }
}));

app.listen(process.env.PORT || 5000);
process.on('SIGINT', handle);
process.on('SIGTERM', handle);
process.on('exit', () => {
    console.log("]}}");
});
