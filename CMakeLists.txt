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

project(is-web-api
    VERSION 0.0.2
    DESCRIPTION "Websocket interfaces to ROS2 and FIWARE Context Broker"
    )

string(JOIN "\n" INSTALL_SCRIPT
    "set(sources \"${CMAKE_CURRENT_LIST_DIR}\")"
    [=[
    if(WIN32)
        set(workaround_parenthesis "ProgramFiles(x86)")
        find_program(NPM_PATH npm HINTS $ENV{ProgramFiles}/nodejs $ENV{${workaround_parenthesis}}/nodejs REQUIRED)
        set(NPM_PATH cmd /c "${NPM_PATH}")
    else()
        find_program(NPM_PATH npm REQUIRED)
    endif()

    message(STATUS "Invoking npm from ${NPM_PATH}")
    message(STATUS "${NPM_PATH} install -g ${sources}")
    execute_process(COMMAND ${NPM_PATH} install -g ${sources}
        RESULT_VARIABLE NPM_CD
        ERROR_VARIABLE NPM_ERROR
        OUTPUT_VARIABLE NPM_RES
        WORKING_DIRECTORY /
        )

    if(NPM_CD)
        message(STATUS "${NPM_CD}")
        message(FATAL_ERROR "${NPM_ERROR}")
    endif()

    message(STATUS "${NPM_RES}")
    ]=]
    )

install(CODE ${INSTALL_SCRIPT})
