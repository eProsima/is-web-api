/* Copyright 2021, Proyectos y Sistemas de Mantenimiento SL (eProsima).
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

const events = require('events');
const logger = require('./logger.js');
const ws_client = require('./websocket_client.js');
const YAML = require('js-yaml');
const tmp = require('tmp'); 
var fs = require('fs');
var util = require('util');
var child_process = require('child_process');
var eventEmitter = new events.EventEmitter();
var is_launched = false;
var error_dict = {};
var IS = {}; //Integration service process
var registered_types = [];
var idl_types = [];
var topics = {};
var yaml_doc = restart();

var print_prefix = "[Configuration]";

// DDS Domain ID
var dds_domain = 0;

// Temporary file
const outputfile = tmp.fileSync();

/**
 * @brief Method that restarts the configuration phase
 * @returns The IS configuration template yaml
 */
function restart ()
{
    logger.info(print_prefix, "YAML restarted.");
    // Remove the last configuration yaml if exists
    if (fs.existsSync(outputfile))
    {
        fs.unlinkSync(outputfile);
    }

    // Free all the local variables
    registered_types = [];
    idl_types = [];
    topics = {};
    error_dict = {};

    // Load again the IS configuration template
    return YAML.load(fs.readFileSync("/usr/lib/IS-Web-API/IS-config-template.yaml", 'utf8'));
};

/**
 * @brief Writes the yaml_doc information to file
 */
function write_to_file()
{
    // udpate the DDS domain and websocket port 
    yaml_doc.systems.ws_server.port = ws_client.get_websocket_port();
    yaml_doc.systems.ros2.domain = dds_domain;

    logger.info(print_prefix, "Writing YAML to file.");
    logger.debug(print_prefix, util.inspect(yaml_doc, false, 20, true));
    let yaml_str = YAML.dump(yaml_doc);
    fs.writeFileSync(outputfile, yaml_str, 'utf8');
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
    // Checks if the publisher id is registered in the type map
    if (registered_types.includes(type_name))
    {
        var remap = {};
        //Checks if there is another topic with the same name
        if (Object.keys(topics).includes(topic_name))
        {
            if (topics[topic_name]['route'] === 'ros2_to_websocket')
            {
                remap = { ros2: { topic: topic_name }};
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
            if (qos.length == 0)
            {
                topics[topic_name] = { type: t, route: 'websocket_to_ros2', remap };
            }
            else
            {
                topics[topic_name] = {type: t, route: 'websocket_to_ros2', remap, ros2: get_qos_from_props(qos) }
            }

            // Initialize YAML topics tag only if necessary
            if(!('topics' in yaml_doc))
            {
                yaml_doc['topics'] = {}
            }

            yaml_doc['topics'] = topics;
            ws_client.advertise_topic(topic_name, type_name);
            logger.info(print_prefix, "Publication Topic", topic_name, "[", type_name, "] added to YAML");
            write_to_file();
        }
    }
    else
    {
        logger.debug(print_prefix, "The type is not registered.", registered_types);
        var error_msg = "The publisher is not connected to a type or is connected to an empty type.";
        logger.debug(print_prefix, "Error:", error_msg, "Data: [ID:", pub_id, "], [Topic Name:", topic_name,
            "], [Type Name:", type_name, "] and QoS [", qos, "]");
        error_dict[pub_id] = { data: {entity: 'pub', topic: topic_name, type: type_name, qos: qos}, error: error_msg};
    }

    return { color: null , message: null }
};

function add_subscriber(sub_id, topic_name, type_name, qos)
{
    // Checks if the subscriber id is registered in the type map
    if (registered_types.includes(type_name))
    {
        var remap = {};
        //Checks if there is another topic with the same name
        if (Object.keys(topics).includes(topic_name))
        {
            if (topics[topic_name]['route'] === 'websocket_to_ros2')
            {
                remap = { ros2: { topic: topic_name }};
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
        if (qos.length == 0)
        {
            topics[topic_name] = { type: t, route: 'ros2_to_websocket', remap };
        }
        else
        {
            topics[topic_name] = {type: t, route: 'ros2_to_websocket', remap, ros2: get_qos_from_props(qos) }
        }

        // Initialize YAML topics tag only if necessary
        if(!('topics' in yaml_doc))
        {
            yaml_doc['topics'] = {}
        }

        yaml_doc['topics'] = topics;
        ws_client.subscribe_topic(topic_name, type_name);
        logger.info(print_prefix, "Subscription Topic", topic_name, "[", type_name, "] added to YAML");
        write_to_file();
    }
    else
    {
        logger.debug(print_prefix, "The type is not registered.", registered_types);
        var error_msg = "The subscriber is not connected to a type or is connected to an empty type.";
        logger.debug(print_prefix, "Error:", error_msg, "Data: [ID:", sub_id, "], [Topic Name:", topic_name,
            "], [Type Name:", type_name, "] and [QoS:", qos, "]");
        error_dict[sub_id] = { data: {entity: 'sub', topic: topic_name, type: type_name, qos: qos}, error: error_msg};
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
        // Initialize YAML types tag only if necessary
        if (!('types' in yaml_doc))
        {
            yaml_doc['types'] =
            {
                idls: []
            };
        }

        if (!('paths' in yaml_doc['types']))
        {
            yaml_doc['types']['paths'] = ["/opt/ros/foxy/share"];
        }

        // Checks that the IDL Type is not already added to the YAML
        if (!idl_types.includes(String(idl)))
        {
            idl_types.push(String(idl));
            registered_types.push(type_name);
            logger.info(print_prefix, "IDL Type [", type_name, "] added to YAML");
            yaml_doc['types']['idls'] = idl_types;
            write_to_file();

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
                            message = add_publisher(id, error_dict[id]['data']['topic'], error_dict[id]['data']['type'],
                                error_dict[id]['data']['qos']);
                            if (message['message'] == null)
                            {
                                delete error_dict[id];
                            }
                            break;
                        case 'sub':
                            logger.debug(print_prefix, "Subscriber", id, "registration retry.");
                            message = add_subscriber(id, error_dict[id]['data']['topic'], error_dict[id]['data']['type'],
                                error_dict[id]['data']['qos']);
                            if (message['message'] == null)
                            {
                                delete error_dict[id];
                            }
                            break;
                    }

                }
            });
        }
        else
        {
            var warn_msg = "The type [" + type_name + "] is defined twice";
            logger.warn(print_prefix, warn_msg);
            return { color: "yellow", message: warn_msg };
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

        if (!registered_types.includes(package_name + '/' + type_name))
        {
            registered_types.push(package_name + '/' + type_name);
            yaml_doc["systems"]["ros2"]["using"] = registered_types;
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
                            message = add_publisher(id, error_dict[id]['data']['topic'], error_dict[id]['data']['type'],
                                error_dict[id]['data']['qos']);
                            if (message['message'] == null)
                            {
                                delete error_dict[id];
                            }
                            break;
                        case 'sub':
                            logger.debug(print_prefix, "Subscriber", id, "registration retry.");
                            message = add_subscriber(id, error_dict[id]['data']['topic'], error_dict[id]['data']['type'],
                                error_dict[id]['data']['qos']);
                            if (message['message'] == null)
                            {
                                delete error_dict[id];
                            }
                            break;
                    }

                }
            });
        }
        else
        {
            error_msg = "The type [" + package_name + '/' + type_name + "] is registered twice";
            logger.warn(print_prefix, error_msg);
            return {color: "yellow", message: error_msg}
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
        logger.debug(print_prefix, "Registering Subscriber with: [ID:", sub_id, "], [Topic Name:", topic_name,
             "], [Type Name:", type_name, "] and [QoS:", qos, "]");
        return add_subscriber(sub_id, topic_name, type_name, qos);
    },
    /**
     * @brief Method that restarts the configuration phase (for new deploys)
     */
    new_config: () =>
    {
        yaml_doc = restart();
    },
    /**
     * @brief Launches a new instance of the Integration Service with the configured YAML
     */
    launch: (node_id) =>
    {
        if (!is_launched && Object.keys(error_dict).length == 0 && Object.keys(topics).length > 0)
        {
            var conf_yaml = YAML.load(fs.readFileSync(outputfile, 'utf8'));
            logger.info(print_prefix, "Launching Integration Service");
            logger.debug(print_prefix, util.inspect(yaml_doc, false, 20, true));
            is_launched = true;
            IS = child_process.spawn('integration-service', [String(outputfile)], { stdio: 'inherit', detached: true });

            IS.on('error', function(err)
            {
                var error_msg = "There is an error when launching IS:" + err.code;
                logger.error(print_prefix, error_msg);
                return { color: "red" , message: error_msg, event_emitter: eventEmitter }
            });

            IS.on('exit', function () {
                var error_msg = 'Integration Service exited due to failure.';
                logger.error(print_prefix, error_msg);
                return { color: "red" , message: error_msg, event_emitter: eventEmitter }
            });

            logger.info(print_prefix, "Integration Service Launched");
            setTimeout(() => {
                ws_client.launch_websocket_client(eventEmitter);
            }, 2000); // milliseconds
        }
        else if (Object.keys(error_dict).includes(String(node_id)))
        {
            logger.debug(print_prefix, "Error for entity", node_id , ":", error_dict[node_id]);
            logger.error(print_prefix, error_dict[node_id]['error'], "=> TOPIC:", error_dict[node_id]['data']['topic'], ", TYPE:", error_dict[node_id]['data']['type']);
            return { color: "red" , message: error_dict[node_id]['error'], event_emitter: null };
        }

        return { color: null , message: null, event_emitter: eventEmitter }
    },
    /**
     * @brief Stops the active Integration Service instance
     */
    stop: () =>
    {
        if (is_launched)
        {
            is_launched = false;
            logger.info(print_prefix, "Integration Service Stopped");
            child_process.exec('kill -9 ' + IS.pid, { stdio: 'inherit' });
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
    // @brief Set DDS domain
    set_dds_domain: (id) => {
        dds_domain = id;
    },
    // @brief Get DDS domain
    get_dds_domain: () => {
        return dds_domain;
    }
}
