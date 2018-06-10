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
module.exports = function(RED) {
	var EventSource = require('eventsource');

	function SseClientNode(config) {
		RED.nodes.createNode(this, config);
        this.headers  = config.headers || {};
		this.url      = config.url;
		this.events   = config.events || ["message"];
        this.proxy    = config.proxy;
        this.restart  = config.restart;
        this.timeout  = config.timeout;
        this.paused   = false;
        this.prevMsg  = null;
        this.timerId  = null;
        
        var node = this;

		node.status({fill: 'red', shape: 'ring', text: 'disconnected'});
        
        function handleEvent(e) {
            // When a previous timer is available, stop it
            if (node.timerId) {
                clearTimeout(node.timerId);
                node.timerId = null;
            }
            
            // When a timeout is specified, start a new timer (that restarts the SSE client)
            if (node.restart) {
                node.timerId = setTimeout(function restartClient() {
                    // Restart the SSE client by resending the last message again
                    handleMsg(node.prevMsg);
                }, node.timeout * 1000);
            }
            
            // Send the received SSE event in the output message
            node.send({
                event: e.type,
                payload: e.data
            });
        }
        
        function handleMsg(msg) {
            // When a stream is paused or stopped, stop the active timeout timer (since no events will be received anyway)
            if (msg.pause === true || msg.stop === true) {
                 if (node.timerId) {
                    clearTimeout(node.timerId);
                    node.timerId = null;
                }
            }
            
            // To pause the streaming, just remove all listeners (if a client is configured yet)
            if (msg.pause === true) {
                if (node.client) {
                    for (var i in node.events) {
                        node.client.removeEventListener(node.events[i], handleEvent);
                    }
                }
                
                node.status({fill: 'yellow', shape: 'ring', text: 'paused'});
                node.paused = true;
                
                return;
            }
            
            // To stop the streaming, close the client
            if (msg.stop === true) {
                node.status({fill: 'red', shape: 'ring', text: 'disconnected'});
                if (node.client) {
                    node.client.close();
                }
                node.client = null;
                return;
            }
            
            // When the previous client is NOT paused, we will stop it and create a new one (to send a new http GET).
            // When the client is paused, the listeners will again be re-applied below...
            if (node.client && !node.paused) {
                node.status({fill: 'red', shape: 'ring', text: 'disconnected'});
                node.client.close();
                node.client = null;
            }
            
            // When we arrive here, a new stream should be started or a paused stream should be restarted
            
            // When the previous client is paused, then resume it again (we will add the listeners back again further on ...).
            if (node.client && node.paused) {
                node.status({fill: "green", shape: "dot", text: "connected"});
                node.paused = false; 
                
                // When a timeout is specified, start a new timer (that restarts the SSE client)
                if (node.restart) {
                    node.timerId = setTimeout(function restartClient() {
                        // Restart the SSE client by resending the last message again
                        handleMsg(node.prevMsg);
                    }, node.timeout * 1000);
                }
            }
                
            // When no client is available, just create one (and connect to the server) ...  
            if (!node.client) {
                // All EventSource parameter should be passed to the constructor as a dictionary
                var headerDictionary = {};
                
                if (node.headers) {
                    headerDictionary.headers = node.headers;
                }
                
                if (node.proxyUrl) {
                    headerDictionary.proxy = node.proxyUrl;
                }
                
                // It has no use to create a client, when no URL has been specified
                if (!node.url) {
                    node.status({fill: "red", shape: "dot", text: "no url"});
                    return;
                }
                    
                // Start a new stream (i.e. send a new http get)
                node.client = new EventSource(node.url, headerDictionary);

                node.client.onopen = function() {
                    node.status({fill: "green", shape: "dot", text: "connected"});
                }

                node.client.onerror = function(err) {
                    node.status({fill: "red", shape: "dot", text: "error"});
                }
            }
            
            // Add the listeners, and start listening for events.
            // The listeners can be added for the first time on a new client, or can be re-added to an existing client (after a pause)
            for (var i in node.events) {
                node.client.addEventListener(node.events[i], handleEvent);
            }
        }
        
        node.on("input", function(msg) {   
            node.prevMsg = msg;
            handleMsg(msg);
        });

		node.on("close", function() {
			node.status({fill: "red", shape: "ring", text: "disconnected"});
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
