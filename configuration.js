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

const logger = require('./logger.js');
const YAML = require('js-yaml');
var fs = require('fs');
var util = require('util');
var home = process.env.HOME;
var outputfile = 'IS-configuration.yaml'

var type_entity_map = {};
var idl_types = [];
var topics = {};
var yaml_doc = restart();

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
    type_entity_map = {};
    idl_types = [];
    topics = {};

    // Load again the IS configuration template
    return YAML.load(fs.readFileSync("./IS-Web-API/IS-config-template.yaml", 'utf8'));
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

module.exports = { 
    /**
     * @brief Method that registers a custom IDL Type and adds it to the IS YAML configuration file
     * @param {String} idl: String that defines the IDL Type
     * @param {String} type_name: String that defines the name associated with the IDL Type
     * @param {String Array} entity_ids: Array containing the ids of the nodes connected to the IDL Type 
     */
    add_idl_type: (idl, type_name, entity_ids) =>
    {
        // Saves in the map each subsequent wired node with the associated IDL Type Name.
        // This information will be used later for topics definition, as Node-RED doesn't provide information
        // about the previous nodes.
        for (var i = 0; i < entity_ids.length; i++)
        {
            type_entity_map[entity_ids[i]] = type_name;
        }

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
            logger.info("IDL Type", type_name, "added to YAML");
            yaml_doc['types']['idls'] = idl_types;
            write_to_file();
        }
        else
        {
            var warn_msg = "The type is defined twice";
            logger.warn(warn_msg);
            return { color: "yellow", message: warn_msg };
        }
        return { color: null , message: null }
    },
    /**
     * @brief Function that registers the ROS2 Types that are going to be used
     * @param {String} package_name: String that states the name of the ROS2 package selected
     * @param {String} type_name: String that states the name of the message withint the ROS2 package that is selected
     * @param {String Array} entity_ids: Array containing the ids of the nodes connected to the ROS2 Type 
     */
    add_ros2_type: (package_name, type_name, entity_ids) =>
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
        // Saves in the map each subsequent wired node with the associated ROS2 Type Name.
        // This information will be used later for topics definition, as Node-RED doesn't provide information
        // about the previous nodes.
        for (var i = 0; i < entity_ids.length; i++)
        {
            type_entity_map[entity_ids[i]] = package_name + "/" + type_name;
        }
        return { color: null , message: null }
    },
    /**
     * @brief Method that registers a publisher and adds the corresponding topic to the IS YAML configuration file
     * @param {String} pub_id: String that states the Node-RED id associated with the publisher node 
     * @param {String} topic_name: String that defines the name of the topic 
     */
    add_publisher: (pub_id, topic_name) =>
    {
        // Checks if the publisher id is registered in the type map
        if (Object.keys(type_entity_map).includes(pub_id))
        {
            var type_name = type_entity_map[pub_id];
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
                logger.info("Publication Topic", topic_name, "[", type_name, "] added to YAML");
                write_to_file();
            }
        }
        else
        {
            var error_msg = "The publisher is not connected to a type or is connected to an empty type";
            logger.error(error_msg);
            return { color: "red", message: error_msg };
        }
        return { color: null , message: null }
    },
    /**
     * @brief Method that registers a subscriber and adds the corresponding topic to the IS YAML configuration file
     * @param {String} sub_id: String that states the Node-RED id associated with the subscriber node 
     * @param {String} topic_name: String that defines the name of the topic 
     */
    add_subscriber: (sub_id, topic_name) =>
    {
        // Checks if the subscriber id is registered in the type map
        if (Object.keys(type_entity_map).includes(sub_id))
        {
            var type_name = type_entity_map[sub_id];
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
            logger.info("Subscription Topic", topic_name, "[", type_name, "] added to YAML");
            write_to_file();
        }
        else
        {
            var error_msg = "The subscriber is not connected to a type or is connected to an empty type"
            logger.error(error_msg);
            return { color: "red", message: error_msg };
        }
        return { color: null , message: null }
    },
    /**
     * @brief Method that restarts the configuration phase (for new deploys)
     */
    new_config: () =>
    {
        yaml_doc = restart();
    }
}