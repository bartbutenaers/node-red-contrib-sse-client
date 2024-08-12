/**
 * Copyright 2018 Bart Butenaers
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

function isEmpty(obj) {
    return Object.keys(obj).length === 0 && obj.constructor === Object
};

module.exports = function (RED) {
    var EventSource = require('./lib/eventsource');
    var mustache = require("mustache");

    function SseClientNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.headers = config.headers || {};
        node.url = config.url;
        node.events = config.events || [];
        node.proxy = config.proxy;
        node.restart = config.restart;
        node.timeout = config.timeout;
        node.rejectUnauthorized = config.rejectUnauthorized;
        node.withCredentials = config.withCredentials;
        node.paused = false;
        node.prevMsg = null;
        node.timerId = null;
        node.client = null;
        node.proxyUrl = null;

        // Migration of old nodes without the http settings
        if (node.rejectUnauthorized === undefined) {
            node.rejectUnauthorized = true;
        }
        if (node.withCredentials === undefined) {
            node.withCredentials = true;
        }

        var isTemplatedUrl = (node.url || "").indexOf("{{") != -1;

        node.status({ fill: 'red', shape: 'ring', text: 'Disconnected. Wait for input msg to start.' });

        function handleEvent(e) {
            // Skip all events when this node is paused
            if (node.paused) {
                return;
            }

            // Skip the 'open' event
            if (e.type === 'open') {
                return;
            }

            // When events have been specified, only allow those events
            if (node.events.length > 0 && !node.events.includes(e.type)) {
                return;
            }

            // When a timeout is specified, start a new timer (that restarts the SSE client)
            if (node.restart) startTimeoutTimer();

            // Send the received SSE event in the output message
            node.send({
                event: e.type,
                payload: e.data
            });
        }

        // 08/04/2022 Supergiovane: Function to start the timeout timer.
        function startTimeoutTimer() {
            // When a previous timer is available, stop it
            if (node.timerId !== null) clearTimeout(node.timerId);
            node.timerId = setTimeout(function restartClient() {
                // Restart the SSE client by resending the last message again
                node.status({ fill: "yellow", shape: "dot", text: "timeout => restarting" });
                if (node.prevMsg === null) node.prevMsg = { payload: true };
                handleMsg(node.prevMsg);
                //node.send({ payload: "Reconnecting..." });
            }, node.timeout * 1000);
        }

        function handleMsg(msg) {

            // When a stream is paused or stopped, stop the active timeout timer (since no events will be received anyway)
            if (msg.pause === true || msg.stop === true) {
                if (node.timerId) {
                    clearTimeout(node.timerId);
                    node.timerId = null;
                }
            }

            // Check whether the stream should be paused
            if (msg.pause === true) {
                node.status({ fill: 'yellow', shape: 'ring', text: 'paused' });
                node.paused = true;

                return;
            }

            // To stop the streaming, close the client
            if (msg.stop === true) {
                node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
                if (node.client) {
                    node.client.close();
                }
                node.client = null;
                return;
            }

            // When the previous client is NOT paused, we will stop it and create a new one (to send a new http GET).
            if (node.client && !node.paused) {
                setTimeout(() => {
                    node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
                }, 1000); // 08/04/2022 Supergiovane: Allow the "reconnecting" status to be shown, in case of reconnection by timeout.                
                node.client.close();
                node.client = null;
            }

            // When we arrive here, a new stream should be started or a paused stream should be restarted

            // When the previous client is paused, then resume it again
            if (node.client && node.paused) {
                node.status({ fill: "green", shape: "dot", text: "connected" });
                node.paused = false;
            }

            // When a timeout is specified, start a new timer (that restarts the SSE client)
            if (node.restart) startTimeoutTimer();

            // When no client is available, just create one (and connect to the server) ...  
            if (!node.client) {
                // All EventSource parameter should be passed to the constructor as a dictionary
                let options = {};
                let url = '';

                // Allow override of headers
                if (msg.headers && isEmpty(node.headers)) {
                    options.headers = msg.headers;
                } else if (!msg.headers && !isEmpty(node.headers)) {
                    options.headers = node.headers;
                } else if (msg.headers && !isEmpty(node.headers)) {
                    options.headers = node.headers;
                    node.warn('Warning: msg properties can not override set node properties. Using set node properties.');
                }

                if (node.proxyUrl) {
                    options.proxy = node.proxyUrl;
                }

                options.https = {
                    rejectUnauthorized: node.rejectUnauthorized,
                    /*TODO
                    key: fs.readFileSync(path.join(__dirname, 'client_certs', 'client_key.pem')),
                    cert: fs.readFileSync(path.join(__dirname, 'client_certs', 'client_cert.crt')),
                    ca: fs.readFileSync(path.join(__dirname, 'client_certs', 'cacert.crt')),
                    passphrase: 'test1234$'
                    */
                }

                options.withCredentials = node.withCredentials;

                // Allow override of url
                if (msg.url && !node.url) {
                    url = msg.url;
                } else if (!msg.url && node.url) {
                    url = node.url;
                } else if (msg.url && node.url) {
                    url = node.url;
                    node.warn('Warning: msg properties can not override set node properties. Using set node properties.');
                } else {
                    node.status({ fill: "red", shape: "dot", text: "no url" });
                    return;
                }

                if (isTemplatedUrl) {
                    url = mustache.render(url, msg);
                }

                // Start a new stream (i.e. send a new http get)
                node.client = new EventSource(url, options);

                node.client.onopen = function () {
                    setTimeout(() => {
                        node.status({ fill: "green", shape: "dot", text: "connected" });
                    }, 1000); // 08/04/2022 Supergiovane: Allow the "reconnecting" status to be shown, in case of reconnection by timeout.

                }

                node.client.onerror = function (err) {
                    node.status({ fill: "red", shape: "dot", text: `Error: ${err.message}` });
                    node.error(err.message, msg)
                }
            }

            // Handle ALL events.
            node.client.onAnyMessage = function (eventType, event) {
                handleEvent(event);
            }
        }

        node.on("input", function (msg) {
            let _msg = RED.util.cloneMessage(msg);
            node.prevMsg = _msg;
            handleMsg(_msg);
        });

        node.on("close", function () {
            node.status({ fill: "red", shape: "ring", text: "disconnected" });
            if (node.client) {
                node.client.close();
            }
            node.paused = false;

            if (node.timerId) {
                clearTimeout(node.timerId);
                node.timerId = null;
            }
        });
    }

    RED.nodes.registerType("sse-client", SseClientNode);
}
