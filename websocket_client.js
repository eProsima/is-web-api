#!/usr/bin/env node

var fs = require('fs');
var events = require('events');
var logger = require('./logger.js');
var jwt = require('jsonwebtoken');
var WebSocketClient = require('websocket').client;
var client_connection = {};
var init_info = [];

function connect(client, token)
{
    client.connect('ws://localhost:12345', token);
}

module.exports = {
    /**
     * @brief Function that starts the execution of the WebSocket Client
     * @param {EventEmitter} eventEmitter: EventEmmitter used to emit and receive events between libraries
     */
    launch_websocket_client: (eventEmitter) => 
    {
        var client = new WebSocketClient({
                tlsOptions: {
                        rejectUnauthorized: false
                }
        });

        var retries = 0;

        // Generates the JWToken with a specific key
        var token = jwt.sign({id: 'is-websocket'}, /*Key*/ 'is-web-api');

        // If the connection fail, it is retried ten times
        client.on('connectFailed', function(error) {
            logger.error('[WebSocket Client] Connection Failed: ' + error.toString());
            retries++;
            if (retries < 10)
            {
                logger.info("[WebSocket Client] Connection Retry");
                setTimeout(() => { 
                    connect(client, token);
                }, 2000);
            }
        });

        client.on('connect', function(connection) {
            logger.info('[WebSocket Client] Connected');
            client_connection = connection;

            // Once the websocket client is connected, the init messages are sent
            init_info.forEach(element => {
                connection.send(element);
            });
            init_info = [];

            connection.on('error', function(error) {
                logger.error("[WebSocket Client] Connection Error: " + error.toString());
            });
            connection.on('close', function() {
                logger.warn('[WebSocket Client] Native Connection Closed');
            });

            // Callback called when a new message is received
            connection.on('message', function(message) {
                if (message.type === 'utf8') {
                    var msg_json = JSON.parse(message.utf8Data);
                    logger.info("[WebSocket Client] Message Received: '" + message.utf8Data + "'");
                    if (msg_json['op'] == 'publish')
                    {
                        eventEmitter.emit(msg_json['topic']+ '_data', msg_json);
                    }
                }
            });
        });

        connect(client, token);
    },
    reset_init_info: () =>
    {
        init_info = [];
    },
    /**
     * @brief Functions that sends the data to a specific topic through the websocket client
     * @param {Sring} topic: String containing the topic where the data must be sent
     * @param {Object} data: Message to be sent
     */
    send_message: (topic, data) => 
    {
        var msg = '{"op":"publish","topic":"' + String(topic) + '","msg":' + JSON.stringify(data) + '}';
        client_connection.send(msg);
    },
    /**
     * @brief Functions that registers a topic advertisement to send it when the websocket client is connected to IS
     * @param {Sring} topic: String containing the topic name
     * @param {String} type: String containing the type name
     */
    advertise_topic: (topic, type) =>
    {
        var msg = '{"op":"advertise","topic":"' + String(topic) + '","type":"' + String(type) + '"}';
        init_info.push(msg)
    },
    /**
     * @brief Functions that registers a topic subscription to send it when the websocket client is connected to IS
     * @param {Sring} topic: String containing the topic name
     * @param {String} type: String containing the type name
     */
    subscribe_topic: (topic, type) => 
    {
        var msg = '{"op":"subscribe","topic":"' + String(topic) + '","type":"' + String(type) + '"}';
        init_info.push(msg)
    }
}
