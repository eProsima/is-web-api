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
var fiware = require('./fiware_configuration.js')

var eventEmitter = new events.EventEmitter();
var ws_client = null;

const print_prefix = "[ROS2 Configuration]";
const topic_suffix = "_is_ros2";

// DDS Domain ID
var dds_domain = 0;

// Common to all configs
global.error_dict = {};

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
    global.error_dict = {};

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
        logger.info(print_prefix, "ROS2 config websocket client initialized");
        ws_client = websocketclient.launch_websocket_client(eventEmitter, "ROS2");
    }
};

/**
 * @brief Prepares global.integration_service_config information for the config file
 */
function update_ros2_yaml_config()
{
    // merge the ros2 template if necessary, note ros2 system is in both templates
    if (global.integration_service_config.systems.ws_server_for_ros2 === undefined)
    {
        let ros2 = YAML.load(fs.readFileSync(path.join(__dirname ,'IS-config-ros2-template.yaml'),'utf8'));

        if (global.integration_service_config.systems.ros2 !== undefined)
        {
            // keep other config modules ros2 values (fiware may use ros2 types)
            ros2.systems.ros2 = global.integration_service_config.systems.ros2;
        }

        global.integration_service_config = {
            ...global.integration_service_config, 
            systems: {...ros2.systems, ...global.integration_service_config.systems},
            routes: {...ros2.routes, ...global.integration_service_config.routes},
        };
    }

    // udpate the DDS domain and websocket port 
    if (ws_client === null)
    {
        log.error(print_prefix, "The socket connection is not established");
    }

    global.integration_service_config.systems.ws_server_for_ros2.port = ws_client.websocket_port;
    global.integration_service_config.systems.ros2.domain = dds_domain;

    logger.info(print_prefix, "Updated YAML config.");
    logger.debug(print_prefix, util.inspect(global.integration_service_config, false, 20, true));
};

function get_qos_from_props (config)
{
    var qos = { "qos": {}};
    config.forEach( function(q)
    {
        var pos = q.p.indexOf('.');
        if (pos != -1)
        {
            var qos_type = q.p.substr(0, pos);
            var param = q.p.substr(pos + 1);
            if (!Object.keys(qos["qos"]).includes(qos_type))
            {
                qos["qos"][qos_type] = {};
            }

            pos = param.indexOf('.');
            if (pos != -1)
            {
                param = param.substr(pos + 1);
            }

            qos["qos"][qos_type][param] = q.v;
        }
        else
        {
            qos["qos"][q.p] = q.v;
        }
    });

    logger.debug(print_prefix, util.inspect(qos, false, 20, true));
    return qos;
};

function add_publisher (pub_id, topic_name, type_name, qos)
{
    update_ros2_yaml_config();

    const remap_topic_name = topic_name + topic_suffix + "_pub";
    const remap = { ros2: { topic: topic_name }};

    // Checks if the publisher type is registered in the type map
    if (global.integration_service_config.systems.ros2.using.includes(type_name))
    {
        //Checks if there is another topic with the same name
        if (Object.keys(global.integration_service_config.topics).includes(remap_topic_name))
        {
            const error_msg = "There is another ros2 topic publisher with the same name"
            logger.error(print_prefix, error_msg);
            return { color: "red", message: error_msg };
        }
        else
        {
            var t = type_name.replace("/", "::msg::");
            if (qos.length == 0)
            {
                global.integration_service_config.topics[remap_topic_name] = { type: t, route: 'websocket_to_ros2', remap };
            }
            else
            {
                global.integration_service_config.topics[remap_topic_name] = {type: t, route: 'websocket_to_ros2', remap, ros2: get_qos_from_props(qos) }
            }

            if(ws_client === null)
            {
                log.error(print_prefix, "The socket connection is not established");
            }
            ws_client.advertise_topic(remap_topic_name, type_name);
            logger.info(print_prefix, "Publication Topic", topic_name, "[", type_name, "] added to YAML");
        }
    }
    else
    {
        logger.debug(print_prefix, "The type is not registered.", global.integration_service_config.systems.ros2.using);
        var error_msg = "The publisher is not connected to a type or is connected to an empty type.";
        logger.debug(print_prefix, "Error:", error_msg, "Data: [ID:", pub_id, "], [Topic Name:", topic_name,
            "], [Type Name:", type_name, "] and QoS [", qos, "]");
        global.error_dict[pub_id] = { kind: "ros2", data: {entity: 'pub', topic: topic_name, type: type_name, qos: qos}, error: error_msg};
    }

    return { color: null , message: null }
};

function retry_publisher (pub_id, entry)
{
    let res = null;

    switch (entry.kind) {
        case 'ros2':
            res = add_publisher(pub_id, entry.data.topic, entry.data.type, entry.data.qos);
            break;
        case 'fiware':
            res = fiware.add_publisher(pub_id, entry.data.topic, entry.data.type, entry.data.qos);
            break;
    };

    return res;
}

function add_subscriber(sub_id, topic_name, type_name, qos)
{
    update_ros2_yaml_config();

    const remap_topic_name = topic_name + topic_suffix + "_sub";
    const remap = { ros2: { topic: topic_name }};

    // Checks if the subscriber id is registered in the type map
    if (global.integration_service_config.systems.ros2.using.includes(type_name))
    {
        //Checks if there is another topic with the same name
        if (Object.keys(global.integration_service_config.topics).includes(remap_topic_name))
        {
            const error_msg = "There is another ros2 topic publisher with the same name";
            logger.error(print_prefix, error_msg);
            return { color: "red", message: error_msg };
        }
        else
        {
            var t = type_name.replace("/", "::msg::");
            if (qos.length == 0)
            {
                global.integration_service_config.topics[remap_topic_name] = { type: t, route: 'ros2_to_websocket', remap };
            }
            else
            {
                global.integration_service_config.topics[remap_topic_name] = {type: t, route: 'ros2_to_websocket', remap, ros2: get_qos_from_props(qos) }
            }

            // Relay messages undecoraing the topics, the external user must be unaware
            eventEmitter.on(remap_topic_name + '_data', function(msg_json)
            {
                eventEmitter.emit(topic_name + '_data', msg_json);
            });

            if (ws_client === null)
            {
                log.error(print_prefix, "The socket connection is not established");
            }
            ws_client.subscribe_topic(remap_topic_name, type_name);
            logger.info(print_prefix, "Subscription Topic", topic_name, "[", type_name, "] added to YAML");
        }
    }
    else
    {
        logger.debug(print_prefix, "The type is not registered.", global.integration_service_config.systems.ros2.using);
        var error_msg = "The subscriber is not connected to a type or is connected to an empty type.";
        logger.debug(print_prefix, "Error:", error_msg, "Data: [ID:", sub_id, "], [Topic Name:", topic_name,
            "], [Type Name:", type_name, "] and [QoS:", qos, "]");
        global.error_dict[sub_id] = {kind: "ros2", data: {entity: 'sub', topic: topic_name, type: type_name, qos: qos}, error: error_msg};
    }
    return { color: null , message: null }
}

function retry_subscriber (pub_id, entry)
{
    let res = null;

    switch (entry.kind) {
        case 'ros2':
            res = add_subscriber(pub_id, entry.data.topic, entry.data.type, entry.data.qos);
            break;
        case 'fiware':
            res = fiware.add_subscriber(pub_id, entry.data.topic, entry.data.type, entry.data.qos);
            break;
    };

    return res;
}

module.exports = {
    /**
     * @brief Method that registers a custom IDL Type and adds it to the IS YAML configuration file
     * @param {String} idl: String that defines the IDL Type
     * @param {String} type_name: String that defines the name associated with the IDL Type
     */
    add_idl_type: (idl, type_name) =>
    {
        // Initialize YAML types tag only if necessary
        if (!('types' in global.integration_service_config))
        {
            global.integration_service_config.types =
            {
                idls: []
            };

        };

        if (global.integration_service_config.systems.ros2 === undefined)
        {
            global.integration_service_config.systems.ros2 = {
                type: "ros2_dynamic", domain: 0, using: [], allow_internal: true };
        }

        if (!('paths' in global.integration_service_config.types))
        {
            global.integration_service_config.types.paths = ["/opt/ros/foxy/share"];
        }

        // Checks that the IDL Type is not already added to the YAML
        if (!global.integration_service_config.types.idls.includes(String(idl)))
        {
            global.integration_service_config.types.idls.push(String(idl));
            global.integration_service_config.systems.ros2.using.push(type_name);
            logger.info(print_prefix, "IDL Type [", type_name, "] added to YAML");

            // If there is an error on subscriber or publisher creation whose type corresponds with the one being registered
            // the pub/sub registration operation is retried
            Object.keys(global.error_dict).forEach( id => {
                if (global.error_dict[id]['data']['type'] == type_name)
                {
                    var message = null;
                    switch(global.error_dict[id]['data']['entity'])
                    {
                        case 'pub':
                            logger.debug(print_prefix, "Publisher", id, "registration retry.");
                            message = retry_publisher(id, global.error_dict[id]);
                            if (message['message'] == null)
                            {
                                delete global.error_dict[id];
                            }
                            break;
                        case 'sub':
                            logger.debug(print_prefix, "Subscriber", id, "registration retry.");
                            message = retry_subscriber(id, global.error_dict[id]);
                            if (message['message'] == null)
                            {
                                delete global.error_dict[id];
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

        if (global.integration_service_config.systems.ros2 === undefined)
        {
            global.integration_service_config.systems.ros2 = {
                type: "ros2_dynamic", domain: 0, using: [], allow_internal: true };
        }

        if (!global.integration_service_config.systems.ros2.using.includes(package_name + '/' + type_name))
        {
            global.integration_service_config.systems.ros2.using.push(package_name + '/' + type_name);
            logger.info(print_prefix, "ROS2 Type [", package_name + '/' + type_name, "] registered");

            // If there is an error on subscriber or publisher creation whose type corresponds with the one being registered
            // the pub/sub registration operation is retried
            Object.keys(global.error_dict).forEach( id => {
                if (global.error_dict[id]['data']['type'] == package_name + '/' + type_name)
                {
                    var message = null;
                    switch(global.error_dict[id]['data']['entity'])
                    {
                        case 'pub':
                            logger.debug(print_prefix, "Publisher", id, "registration retry.");
                            message = retry_publisher(id, global.error_dict[id]);
                            if (message['message'] == null)
                            {
                                delete global.error_dict[id];
                            }
                            break;
                        case 'sub':
                            logger.debug(print_prefix, "Subscriber", id, "registration retry.");
                            message = retry_subscriber(id, global.error_dict[id]);
                            if (message['message'] == null)
                            {
                                delete global.error_dict[id];
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
    add_publisher: (pub_id, topic_name, type_name, qos) =>
    {
        start_websocket();

        logger.debug(print_prefix, "Registering Publisher with: [ID:", pub_id, "], [Topic Name:", topic_name,
             "], [Type Name:", type_name, "] and [QoS:", qos, "]");
        return add_publisher(pub_id, topic_name, type_name, qos);
    },
    /**
     * @brief Method that registers a subscriber and adds the corresponding topic to the IS YAML configuration file
     * @param {String} sub_id: String that states the Node-RED id associated with the subscriber node
     * @param {String} topic_name: String that defines the name of the topic
     */
    add_subscriber: (sub_id, topic_name, type_name, qos) =>
    {
        start_websocket();

        logger.debug(print_prefix, "Registering Subscriber with: [ID:", sub_id, "], [Topic Name:", topic_name,
             "], [Type Name:", type_name, "] and [QoS:", qos, "]");
        return add_subscriber(sub_id, topic_name, type_name, qos);
    },
    /**
     * @brief Method that restarts the configuration phase (for new deploys)
     */
    new_config: () =>
    {
        restart();

        start_websocket();

        update_ros2_yaml_config();
    },
    /**
     * @brief Launches a new instance of the Integration Service with the configured YAML
     */
    launch: (node_id) =>
    {
        if (global.error_dict[node_id] !== undefined)
        {
            logger.debug(print_prefix, "Error for entity", node_id , ":", global.error_dict[node_id]);
            logger.error(print_prefix, global.error_dict[node_id]['error'], "=> TOPIC:", global.error_dict[node_id]['data']['topic'], ", TYPE:", global.error_dict[node_id]['data']['type']);
            return { color: "red" , message: global.error_dict[node_id]['error'], event_emitter: null };
        }

        if (Object.keys(global.integration_service_config['topics']).length == 0)
        {
            return { color: "red" , message: "there are no associated topics", event_emitter: null };
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
            eventEmitter.removeAllListeners();
        }
    },
    /**
     * @brief Functions that sends the data to a specific topic through the websocket client
     * @param {Sring} topic: String containing the topic where the data must be sent
     * @param {Object} data: Message to be sent
     */
    send_message: (topic, data) =>
    {
        const remap_topic_name = topic + topic_suffix + "_pub";
        ws_client.send_message(remap_topic_name, data);
    },
    get_event_emitter: () =>
    {
        return eventEmitter;
    },
    // @brief Set DDS domain
    set_dds_domain: (id) => {
        dds_domain = id;
    },
    // @brief Get DDS domain
    get_dds_domain: () => {
        return dds_domain;
    }
}
