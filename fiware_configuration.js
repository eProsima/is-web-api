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

const fs = require('fs');
const path = require('path');
const events = require('events');
const logger = require('./logger.js');
const websocketclient = require('./websocket_client.js');
const YAML = require('js-yaml');
const util = require('util');

var launcher = require('./launcher.js')

var eventEmitter = new events.EventEmitter();
var ws_client = null;

var error_dict = {};

var print_prefix = "[FIWARE Configuration]";

// FIWARE set up
var fiware_host = "";
var fiware_port = 1234;

// Make eventEmitter relay launch events
launcher.on((status) => {
    eventEmitter.emit("IS-ERROR", status);
});

/**
 * @brief Method that restarts the configuration phase
 */
function restart ()
{
    // Free all the local variables
    error_dict = {};

    // Load again the IS configuration template
    launcher.restart()
};

/**
 * @brief Method that launches the websocket connection if broken
 */
function start_websocket ()
{
    // create a new websocket client
    if (ws_client === null)
    {
        logger.info(print_prefix, "FIWARE config websocket client initialized");
        ws_client = websocketclient.launch_websocket_client(eventEmitter);
    }
};

/**
 * @brief Prepares global.integration_service_config information for the config file
 */
function update_yaml_config()
{
    // merge the ros2 template if necessary, note ros2 system is in both templates
    if (global.integration_service_config.systems.ws_server_for_fiware === undefined)
    {
        let fiware = YAML.load(fs.readFileSync(path.join(__dirname ,'IS-config-fiware-template.yaml'),'utf8'));

        if (global.integration_service_config.systems.ros2 !== undefined)
        {
            // keep other config modules ros2 values (ros2 uses this system too)
            fiware.systems.ros2 = global.integration_service_config.systems.ros2;
        }

        global.integration_service_config = {
            ...global.integration_service_config, 
            systems: {...fiware.systems, ...global.integration_service_config.systems},
            routes: {...fiware.routes, ...global.integration_service_config.routes}
        };
    }

    // udpate the DDS domain and websocket port 
    if (ws_client === null)
    {
        log.error(print_prefix, "The socket connection is not established");
    }

    global.integration_service_config.systems.ws_server_for_fiware.port = ws_client.websocket_port;
    global.integration_service_config.systems.fiware.host = fiware_host;
    global.integration_service_config.systems.fiware.port = fiware_port;

    logger.info(print_prefix, "Updated YAML config");
    logger.debug(print_prefix, util.inspect(global.integration_service_config, false, 20, true));
};


function add_publisher (pub_id, topic_name, type_name)
{
    update_yaml_config();

    // Checks if the publisher type is registered in the type map
    if ((global.integration_service_config.systems.ros2.using !== undefined
         && global.integration_service_config.systems.ros2.using.includes(type_name))
        || (global.integration_service_config.systems.fiware.using !== undefined
         && global.integration_service_config.systems.fiware.using.includes(type_name)))
    {
        var remap = {};
        //Checks if there is another topic with the same name
        if (Object.keys(global.integration_service_config.topics).includes(topic_name))
        {
            if (global.integration_service_config.topics.topic_name.route === 'fiware_to_websocket')
            {
                remap = { fiware: { topic: topic_name }};
                topic_name = topic_name + "_pub"
            }
            else
            {
                var error_msg = "There is another topic with the same name"
                logger.error(print_prefix, error_msg);
                return { color: "red", message: error_msg };
            }
        }
        else
        {
            var t = type_name.replace("/", "::msg::");
            global.integration_service_config.topics[topic_name] = { type: t, route: 'websocket_to_fiware', remap };

            if(ws_client === null)
            {
                log.error(print_prefix, "The socket connection is not established");
            }
            ws_client.advertise_topic(topic_name, type_name);
            logger.info(print_prefix, "Publication Topic", topic_name, "[", type_name, "] added to YAML");
        }
    }
    else
    {
        logger.debug(print_prefix, "The type is not registered.",
                global.integration_service_config.systems.fiware.using,
                global.integration_service_config.systems.ros2.using);
        var error_msg = "The publisher is not connected to a type or is connected to an empty type.";
        logger.debug(print_prefix, "Error:", error_msg, "Data: [ID:", pub_id, "], [Topic Name:", topic_name,
            "], [Type Name:", type_name, "]");
        error_dict[pub_id] = { data: {entity: 'pub', topic: topic_name, type: type_name}, error: error_msg};
    }

    return { color: null , message: null }

}

function add_subscriber(sub_id, topic_name, type_name)
{
    update_yaml_config();

    // Checks if the subscriber id is registered in the type map
    if ((global.integration_service_config.systems.ros2.using !== undefined
         && global.integration_service_config.systems.ros2.using.includes(type_name))
        || (global.integration_service_config.systems.fiware.using !== undefined
         && global.integration_service_config.systems.fiware.using.includes(type_name)))
    {
        var remap = {};
        //Checks if there is another topic with the same name
        if (Object.keys(global.integration_service_config.topics).includes(topic_name))
        {
            if (global.integration_service_config.topics.topic_name.route === 'websocket_to_fiware')
            {
                remap = { fiware: { topic: topic_name }};
                topic_name = topic_name + "_sub"
            }
            else
            {
                var error_msg = "There is another topic with the same name";
                logger.error(print_prefix, error_msg);
                return { color: "red", message: error_msg };
            }
        }

        var t = type_name.replace("/", "::msg::");
        global.integration_service_config.topics[topic_name] = { type: t, route: 'fiware_to_websocket', remap };

        if (ws_client === null)
        {
            log.error(print_prefix, "The socket connection is not established");
        }
        ws_client.subscribe_topic(topic_name, type_name);
        logger.info(print_prefix, "Subscription Topic", topic_name, "[", type_name, "] added to YAML");
    }
    else
    {
        logger.debug(print_prefix, "The type is not registered.",
                global.integration_service_config.systems.ros2.using,
                global.integration_service_config.systems.fiware.using);
        var error_msg = "The subscriber is not connected to a type or is connected to an empty type.";
        logger.debug(print_prefix, "Error:", error_msg, "Data: [ID:", sub_id, "], [Topic Name:", topic_name,
            "], [Type Name:", type_name, "]");
        error_dict[sub_id] = { data: {entity: 'sub', topic: topic_name, type: type_name}, error: error_msg};
    }
    return { color: null , message: null }

}

module.exports = {

    /**
     * @brief Method that registers a custom IDL Type and adds it to the IS YAML configuration file
     * @param {String} idl: String that defines the IDL Type
     * @param {String} type_name: String that defines the name associated with the IDL Type
     * @param {String Array} entity_ids: Array containing the ids of the nodes connected to the IDL Type
     */
     add_idl_type: (idl, type_name) =>
     {
        start_websocket();

        // Initialize YAML types tag only if necessary
        if (!('types' in global.integration_service_config))
        {
            global.integration_service_config.types =
            {
                idls: []
            };
        };

        if (!('paths' in global.integration_service_config.types))
        {
            global.integration_service_config.types.paths = ["/opt/ros/foxy/share"];
        }

        // Checks that the IDL Type is not already added to the YAML
        if (!global.integration_service_config.types.idls.includes(String(idl)))
        {
            global.integration_service_config.types.idls.push(String(idl));
            global.integration_service_config.systems.fiware.using.push(type_name);
            logger.info(print_prefix, "IDL Type [", type_name, "] added to YAML");

            // If there is an error on subscriber or publisher creation whose type corresponds with the one being registered
            // the pub/sub registration operation is retried
            Object.keys(error_dict).forEach( id => {
                if (error_dict[id]['data']['type'] == type_name)
                {
                    var message = null;
                    switch(error_dict[id]['data']['entity'])
                    {
                        case 'pub':
                            logger.debug(print_prefix, "Publisher", id, "registration retry.");
                            message = add_publisher(id, error_dict[id]['data']['topic'], error_dict[id]['data']['type']);
                                
                            if (message['message'] == null)
                            {
                                delete error_dict[id];
                            }
                            break;
                        case 'sub':
                            logger.debug(print_prefix, "Subscriber", id, "registration retry.");
                            message = add_subscriber(id, error_dict[id]['data']['topic'], error_dict[id]['data']['type']);
                            if (message['message'] == null)
                            {
                                delete error_dict[id];
                            }
                            break;
                    }

                }
            });
        }

        return { color: null , message: null }
     },

    /**
     * @brief Function that registers the ROS2 Types that are going to be used
     * @param {String} package_name: String that states the name of the ROS2 package selected
     * @param {String} type_name: String that states the name of the message withint the ROS2 package that is selected
     */
    add_ros2_type: (package_name, type_name) =>
    {
        start_websocket();

        update_yaml_config();

        var error_msg = "";
        if (!package_name)
        {
            error_msg = "The package is not selected";
            return { color: "red", message: error_msg };
        }
        if (!type_name)
        {
            error_msg = "The message type is not selected";
            return { color: "red", message: error_msg };
        }

        if (!global.integration_service_config.systems.ros2.using.includes(package_name + '/' + type_name))
        {
            global.integration_service_config.systems.ros2.using.push(package_name + '/' + type_name);
            logger.info(print_prefix, "ROS2 Type [", package_name + '/' + type_name, "] registered");

            // If there is an error on subscriber or publisher creation whose type corresponds with the one being registered
            // the pub/sub registration operation is retried
            Object.keys(error_dict).forEach( id => {
                if (error_dict[id]['data']['type'] == package_name + '/' + type_name)
                {
                    var message = null;
                    switch(error_dict[id]['data']['entity'])
                    {
                        case 'pub':
                            logger.debug(print_prefix, "Publisher", id, "registration retry.");
                            message = add_publisher(id, error_dict[id]['data']['topic'], error_dict[id]['data']['type']);
                            if (message['message'] == null)
                            {
                                delete error_dict[id];
                            }
                            break;
                        case 'sub':
                            logger.debug(print_prefix, "Subscriber", id, "registration retry.");
                            message = add_subscriber(id, error_dict[id]['data']['topic'], error_dict[id]['data']['type']);
                            if (message['message'] == null)
                            {
                                delete error_dict[id];
                            }
                            break;
                    }

                }
            });
        }

        return { color: null , message: null }

    },

    /**
     * @brief Method that registers a publisher and adds the corresponding topic to the IS YAML configuration file
     * @param {String} pub_id: String that states the Node-RED id associated with the publisher node
     * @param {String} topic_name: String that defines the name of the topic
     */
    add_publisher: (pub_id, topic_name, type_name) =>
    {
        start_websocket();

        logger.debug(print_prefix, "Registering Publisher with: [ID:", pub_id, "], [Topic Name:", topic_name,
             "], [Type Name:", type_name, "]");
        return add_publisher(pub_id, topic_name, type_name);
    },
    /**
     * @brief Method that registers a subscriber and adds the corresponding topic to the IS YAML configuration file
     * @param {String} sub_id: String that states the Node-RED id associated with the subscriber node
     * @param {String} topic_name: String that defines the name of the topic
     */
    add_subscriber: (sub_id, topic_name, type_name) =>
    {
        start_websocket();

        logger.debug(print_prefix, "Registering Subscriber with: [ID:", sub_id, "], [Topic Name:", topic_name,
             "], [Type Name:", type_name, "]");
        return add_subscriber(sub_id, topic_name, type_name);
    },
    /**
     * @brief Method that restarts the configuration phase (for new deploys)
     */
    new_config: () =>
    {
        restart();

        start_websocket();

        update_yaml_config();
    },
    /**
     * @brief Launches a new instance of the Integration Service with the configured YAML
     */
    launch: (node_id) =>
    {
        if (Object.keys(error_dict).length != 0
            || Object.keys(global.integration_service_config['topics']).length == 0)
        {
            let msg = "node errors";
            if (error_dict[node_id] !== undefined)
            {
                logger.debug(print_prefix, "Error for entity", node_id , ":", error_dict[node_id]);
                logger.error(print_prefix, error_dict[node_id]['error'], "=> TOPIC:", error_dict[node_id]['data']['topic'], ", TYPE:", error_dict[node_id]['data']['type']);
                msg = error_dict[node_id]['error'];
            }

            return { color: "red" , message: msg, event_emitter: null };
        }

        return launcher.launch(node_id, eventEmitter);
    },
    /**
     * @brief Stops the active Integration Service instance
     */
    stop: () =>
    {
        if (launcher.stop())
        {
            logger.info(print_prefix, "Integration Service Stopped");
        }

        // reset websocket client
        if (ws_client !== null)
        {
            ws_client.abort();
            ws_client = null;
        }
    },
    /**
     * @brief Functions that sends the data to a specific topic through the websocket client
     * @param {Sring} topic: String containing the topic where the data must be sent
     * @param {Object} data: Message to be sent
     */
    send_message: (topic, data) =>
    {
        ws_client.send_message(topic, data);
    },
    get_event_emitter: () =>
    {
        return eventEmitter;
    },
    // @brief Set FIWARE host
    set_fiware_host: (host) => {
        fiware_host = host;
    },
    // @brief Get FIWARE host
    get_fiware_host: () => {
        return fiware_host;
    },
    // @brief Set FIWARE port
    set_fiware_port: (port) => {
        fiware_port = port;
    },
    // @brief Get FIWARE port
    get_fiware_port: () => {
        return fiware_port;
    }
}
