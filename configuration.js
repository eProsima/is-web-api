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
var fs = require('fs');
var util = require('util');
var child_process = require('child_process');
var home = process.env.HOME;
var outputfile = 'IS-configuration.yaml'
var eventEmitter = new events.EventEmitter();

var is_launched = false;
var error_dict = {};
var IS = {}; //Integration service process
var registered_types = [];
var idl_types = [];
var topics = {};
var yaml_doc = restart();
var connection_dict = {};

/**
 * @brief Method that restarts the configuration phase
 * @returns The IS configuration template yaml
 */
function restart ()
{
    // Remove the last configuration yaml if exists
    if (fs.existsSync(home + '/' + outputfile))
    {
        fs.unlinkSync(home + '/' + outputfile);
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
    logger.debug(util.inspect(yaml_doc, false, 20, true));
    let yaml_str = YAML.dump(yaml_doc);
    fs.writeFileSync(home + '/' + outputfile, yaml_str, 'utf8');
};

function add_publisher (pub_id, topic_name, type_name)
{
    if (Object.keys(connection_dict).includes(pub_id))
    {
        type_name = connection_dict[pub_id];
    }
    // Checks if the publisher id is registered in the type map
    if (registered_types.includes(type_name))
    {
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
                logger.error(error_msg);
                return { color: "red", message: error_msg };
            }
        }
        else
        {
            topics[topic_name] = { type: type_name, route: 'websocket_to_ros2' };

            // Initialize YAML topics tag only if necessary
            if(!('topics' in yaml_doc))
            {
                yaml_doc['topics'] = {}
            }

            yaml_doc['topics'] = topics;
            ws_client.advertise_topic(topic_name, type_name);
            logger.info("Publication Topic", topic_name, "[", type_name, "] added to YAML");
            write_to_file();
        }
    }
    else
    {
        var error_msg = "The publisher is not connected to a type or is connected to an empty type";
        error_dict[pub_id] = { data: {entity: 'pub', topic: topic_name, type: type_name}, error: error_msg};
    }

    return { color: null , message: null }
};

function add_subscriber(sub_id, topic_name, type_name)
{
    if (Object.keys(connection_dict).includes(sub_id))
    {
        type_name = connection_dict[sub_id];
    }
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
                logger.error(error_msg);
                return { color: "red", message: error_msg };
            }
        }

        topics[topic_name] = { type: type_name, route: 'ros2_to_websocket', remap};

        // Initialize YAML topics tag only if necessary
        if(!('topics' in yaml_doc))
        {
            yaml_doc['topics'] = {}
        }

        yaml_doc['topics'] = topics;
        ws_client.subscribe_topic(topic_name, type_name);
        logger.info("Subscription Topic", topic_name, "[", type_name, "] added to YAML");
        write_to_file();
    }
    else
    {
        var error_msg = "The subscriber is not connected to a type or is connected to an empty type"
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
        // Initialize YAML types tag only if necessary
        if (!('types' in yaml_doc))
        {
            yaml_doc['types'] = 
            {
                idls: []
            };
        }

        // Checks that the IDL Type is not already added to the YAML
        if (!idl_types.includes(String(idl)))
        {
            idl_types.push(String(idl));
            registered_types.push(type_name);
            logger.info("IDL Type [", type_name, "] added to YAML");
            yaml_doc['types']['idls'] = idl_types;
            write_to_file();
        }
        else
        {
            var warn_msg = "The type [" + type_name + "] is defined twice";
            logger.warn(warn_msg);
            return { color: "yellow", message: warn_msg };
        }

        return { color: null , message: null }
    },
    /**
     * @brief Function that registers the ROS2 Types that are going to be used
     * @param {String} package_name: String that states the name of the ROS2 package selected
     * @param {String} type_name: String that states the name of the message withint the ROS2 package that is selected
     * @param {Array} wires: Array containing the ids of the nodes connected to the ROS2 Type
     */
    add_ros2_type: (package_name, type_name, wires) =>
    {
        wires.forEach( function(w)
        {
            if (!Object.keys(connection_dict).includes(w))
            {
                connection_dict[w] = package_name + '/' + type_name;
            }
        });

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
            logger.info("ROS2 Type [", package_name + '/' + type_name, "] registered");

            // If there is an error on subscriber or publisher creation whose type corresponds with the one being registered
            // the pub/sub registration operation is retried
            Object.keys(error_dict).forEach( id => {
                if (error_dict[id]['data']['type'] == package_name + '/' + type_name)
                {
                    var message = null;
                    switch(error_dict[id]['data']['entity'])
                    {
                        case 'pub':
                            message = add_publisher(id, error_dict[id]['data']['topic'], error_dict[id]['data']['type']);
                            if (message['message'] == null)
                            {
                                delete error_dict[id];
                            }
                            break;
                        case 'sub':
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
        else
        {
            error_msg = "The type [" + package_name + '/' + type_name + "] is registered twice";
            logger.warn(error_msg);
            return {color: "yellow", message: error_msg}
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
        return add_publisher(pub_id, topic_name, type_name);
    },
    /**
     * @brief Method that registers a subscriber and adds the corresponding topic to the IS YAML configuration file
     * @param {String} sub_id: String that states the Node-RED id associated with the subscriber node 
     * @param {String} topic_name: String that defines the name of the topic 
     */
    add_subscriber: (sub_id, topic_name, type_name) =>
    {
        return add_subscriber(sub_id, topic_name, type_name);
    },
    /**
     * @brief Method that restarts the configuration phase (for new deploys)
     */
    new_config: () =>
    {
        yaml_doc = restart();
    },
    register_connection: (type, wire, restart) =>
    {
        if (restart === 'true')
        {
            connection_dict = {};
            ws_client.reset_init_info();
        }
        connection_dict[wire] = type;
    },
    /**
     * @brief Launches a new instance of the Integration Service with the configured YAML 
     */
    launch: (node_id) =>
    {
        if (!is_launched && Object.keys(error_dict).length == 0 && Object.keys(topics).length > 0)
        {
            var conf_yaml = YAML.load(fs.readFileSync(home + '/' + outputfile, 'utf8'));
            logger.debug(conf_yaml);
            is_launched = true;
            IS = child_process.spawn('integration-service', [String(home + '/' + outputfile)], { stdio: 'inherit', detached: true });

            IS.on('error', function(err)
            {
                logger.error("There is an error when launching IS:", err.code);
            });

            IS.on('exit', function () {
                logger.error('Integration Service exited due to failure');
            });

            logger.info("Integration Service Launched");
            setTimeout(() => { 
                ws_client.launch_websocket_client(eventEmitter); 
            }, 2000); // milliseconds
        }
        else if (Object.keys(error_dict).includes(String(node_id)))
        {
            logger.error(error_dict[node_id]['error']);
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
            logger.info("Integration Service Stopped");
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
    }
}
