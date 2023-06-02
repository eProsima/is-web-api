#!/usr/bin/env node

/* Copyright 2023, Proyectos y Sistemas de Mantenimiento SL (eProsima).
 * All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var fs = require('fs');
var events = require('events');
var logger = require('./logger.js');
var jwt = require('jsonwebtoken');
var WebSocketClient = require('websocket').client;

class WebSocketSHLink {
    #client;
    #token;
    #ws_port;
    #init_info;
    #client_connection;
    #name;
    
    constructor(eventEmitter, name, logger) {

        this.#name = name;
        this.#client = new WebSocketClient({
                tlsOptions: {
                        rejectUnauthorized: false
                }
        });

        // Generates the JWToken with a specific key
        this.#token = jwt.sign({id: 'is-websocket'}, /*Key*/ 'is-web-api');
        // Randomly generated server port
        this.#ws_port = Math.floor(Math.random() * 16383 + 49152);

        this.#init_info = [];
        this.#client_connection = null;

        // Set up events
        var retries = 0;
        let pThis = this;

        // If the connection fail, it is retried ten times
        this.#client.on('connectFailed', function(error) {
            logger.error('[WebSocket Client] Connection Failed: ' + error.toString());
            retries++;
            if (retries < 10)
            {
                logger.info("[WebSocket Client] Connection Retry");
                setTimeout(() => { pThis.#connect();}, 4000);
            }
            else
            {
                eventEmitter.emit("websocket_client_connection_failed");
            }
        });

        this.#client.on('connect', function(connection) {
            logger.info('[WebSocket Client] Connected');
            eventEmitter.emit(pThis.#name + "_connected");
            pThis.#client_connection = connection;

            // Once the websocket client is connected, the init messages are sent
            pThis.#init_info.forEach(element => {
                connection.send(element);
            });
            pThis.#init_info = [];

            connection.on('error', function(error) {
                logger.error("[WebSocket Client] Connection Error: " + error.toString());
            });
            connection.on('close', function(code, reason) {
                logger.warn('[WebSocket Client] Connection Closed [', code, ']:', reason);
            });

            // Callback called when a new message is received
            connection.on('message', function(message) {
                if (message.type === 'utf8') {
                    var msg_json = JSON.parse(message.utf8Data);
                    logger.info("[WebSocket Client] Message Received: '" + message.utf8Data + "'");
                    if (msg_json['op'] == 'publish')
                    {
                        eventEmitter.emit(msg_json['topic']+ '_data', msg_json);

                        if (msg_json['topic'].includes("_sub"))
                        {
                            eventEmitter.emit(msg_json['topic'].replace("_sub", "")+ '_data', msg_json);
                        }
                    }
                }
            });
        });

        this.#connect();
    }

    send_message(topic, data) {
        var msg = '{"op":"publish","topic":"' + String(topic) + '","msg":' + JSON.stringify(data) + '}';
        if (this.#client_connection)
        {
            this.#client_connection.send(msg);
        }
    }

    advertise_topic(topic, type) {
        var t = type.replace("/", "::msg::");
        var msg = '{"op":"advertise","topic":"' + String(topic) + '","type":"' + String(t) + '"}';
        this.#init_info.push(msg);
    }

    subscribe_topic(topic, type) {
        var t = type.replace("/", "::msg::");
        var msg = '{"op":"subscribe","topic":"' + String(topic) + '","type":"' + String(t) + '"}';
        this.#init_info.push(msg);
    }

    get websocket_port() {
        return this.#ws_port;
    }

    abort() {
        this.#client.abort();
    }

    #connect() {
        this.#client.connect('ws://localhost:' + this.#ws_port, null, null, { Authorization: 'Bearer ' + this.#token });
    }
}

module.exports = {
    /**
     * @brief Function that starts the execution of the WebSocket Client
     * @param {EventEmitter} eventEmitter: EventEmmitter used to emit and receive events between libraries
     * @param {name} name: Name associated with the websocket
     */
    launch_websocket_client: (eventEmitter, name) =>
    {
        return new WebSocketSHLink(eventEmitter, name, logger);
    }
}
