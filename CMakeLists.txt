# Copyright 2021 Proyectos y Sistemas de Mantenimiento SL (eProsima).
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

cmake_minimum_required(VERSION 3.5)

project(IS-Web-API)

set(INSTALL_DIR /usr/lib)

file(MAKE_DIRECTORY ${INSTALL_DIR}/${PROJECT_NAME})

foreach(resource
    configuration.js
    logger.js
    websocket_client.js
    IS-config-template.yaml)

    configure_file(${CMAKE_CURRENT_SOURCE_DIR}/${resource}
    ${INSTALL_DIR}/${PROJECT_NAME}/${resource}
    COPYONLY)
    
endforeach()

execute_process(COMMAND npm install tmp colors jsonwebtoken websocket js-yaml WORKING_DIRECTORY ${INSTALL_DIR})
