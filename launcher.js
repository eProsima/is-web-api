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
const proc = require('process');
const os = require('os');
const child_process = require('child_process');
const YAML = require('js-yaml');
const util = require('util');

const logger = require('./logger.js');

global.integration_service_config = {systems:{}, routes:{}, topics:{}};
var IS = {}; //Integration service process
var print_prefix = "[Launcher]";
var is_launched = false; // launch -> stop
var config_is_reset = true; // launch -> restart

//! Temporary config file
function get_yaml_file()
{
    return path.join(os.tmpdir(), 'visual_ros_IS_' + proc.pid + '.yaml');
}

/**
 * @brief Method that restarts the configuration phase
 * @returns The IS configuration template yaml
 */
function restart ()
{
    if (!config_is_reset)
    {
        logger.info(print_prefix, "YAML restarted.");
        // Remove the last configuration yaml if exists
        if (fs.existsSync(get_yaml_file()))
        {
            fs.unlinkSync(get_yaml_file());
        }

        // Load again the IS configuration template
        global.integration_service_config = {systems:{}, routes:{}, topics:{}};

        config_is_reset = true; // already reset for this deployment
    }
};

//! launches the actual config in the integration-service
function launch(node_id, eventEmitter)
{
    config_is_reset = false; // the next deployment must reset config

    if (!is_launched)
    {
        logger.info(print_prefix, "Launching Integration Service");
        logger.debug(print_prefix, util.inspect(global.integration_service_config, false, 20, true));
        is_launched = true;
        fs.writeFileSync(get_yaml_file(), YAML.dump(global.integration_service_config), 'utf8');

        if (!fs.existsSync(get_yaml_file()))
        {
            logger.error(print_prefix, "The file " + get_yaml_file() + " doesn't exists");
            return { color: "red" , message: error_msg, event_emitter: eventEmitter }
        }

        IS = child_process.spawn('integration-service', [String(get_yaml_file())], { stdio: 'inherit', detached: true });

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
        return { color: "green" , message: null, event_emitter: eventEmitter }
    }

    return { color: "green" , message: null, event_emitter: eventEmitter }
;
}

//! Stops the active Integration Service instance

function stop()
{
    const was_launched = is_launched;

    if (is_launched)
    {
        is_launched = false;
        child_process.exec('kill -9 ' + IS.pid, { stdio: 'inherit' });
    }

    return was_launched;
}

module.exports = {
    restart: restart,
    launch: launch,
    stop: stop
}
