# IS-Web-API: Integration Service Web API

This project is part of [DIH^2](http://www.dih-squared.eu/). The main goal is provide WebSocket interoperability with
[ROS2](https://docs.ros.org/) and [FIWARE](https://fiware-orion.readthedocs.io/en/master/).

This library was created to service the [Node-RED ROS 2 Plugin](https://github.com/eProsima/node-red-ros2-plugin.git) 
that provides Node-RED nodes associated with ROS2 and FIWARE endpoints.

## Contents

-   [Background](#background)
-   [Install](#install)
-   [Interface APIs](#apis)
    + [ROS2 APIs](#ros2-apis)
    + [FIWARE APIs](#fiware-apis)

## Background

The interoperability between the pluging and the ROS2 and FIWARE Broker environments is achieved using [WebSocket](https://websockets.spec.whatwg.org//) bridges to them.

These bridges are generated using [Integration-Service](https://integration-service.docs.eprosima.com/en/latest/) an
[eProsima](https://www.eprosima.com/) open-source tool.

Using Integration-Service directly from the plugin was possible, but it was considered a better choice to create
this library, to abstract the bridge operation. This way:
 + The plugin can rely on any other bridge technology.
 + Development is simplified by enforcing separation of concerns.
 + Any other Node.js project (besides the plugin) can profit from the bridge library.

The libray is composed of several modules:


`logger.js`
: This module provides common logger interface for the others. 

`websocket_client.js`
: This module provides websocket connections for each interface (ROS2/FIWARE) to the integration-service.
  Each configuration emitter will be trigger by the websocket events to report status and user data.

`ros2_configuration.js`
: This module provides a public API to define types, create ROS2 endpoints and send/receive user data.
  Internally it sets up the integration-service configuration to manage ROS2 nodes and types.

`fiware_configuration.js`
: This module provides a public API to create FIWARE endpoints and send/receive user data.
  Internally it sets up the integration-service configuration to manage FIWARE nodes.
  The type definition relies in the `ros2_configuration.js` module.

`launcher.js`
: This module: keeps the global integration service configuration and manages integration service operation.

## Install

A [Dockerfile](https://raw.githubusercontent.com/eProsima/node-red-ros2-plugin/master/docker/Dockerfile)
is available to exemplify the set up on an argument provided ROS2 distro.

### Dependencies

Some of the following installation steps can be skipped if the target system already fulfils some of the requirements:

1. ROS2 installation. Follow the [official ROS2 installation guide](https://docs.ros.org/en/humble/Installation.html)
   for the distro of choice. The Dockerfile is based on a ROS2 image, so this is not exemplified.

1. Install Node.js. The usual OS package managers (like `apt` on Ubuntu or `winget/chocolatey` on windows) provide it.
   An exhaustive list is available [here](https://nodejs.org/en/download/package-manager).
   Some package managers constrain the user to a specific version of Node.js. The Node.js [site](https://nodejs.org/en/download)
   hints on how to install specific versions.

   For example, in `apt` is possible to add via location configuration file a new remote repository where all Node.js
   versions are available. This is the strategy that the Dockerfile uses:

   ```bash
   $ curl -sL https://deb.nodesource.com/setup_14.x -o nodesource_setup.sh
   $ chmod +x nodesource_setup.sh && sudo sh -c ./nodesource_setup.sh
   $ sudo apt-get install -y nodejs
   ```
1. Install Node-RED. Follow the [official Node-RED installation guide](https://nodered.org/docs/getting-started/local).
   The Dockerfile favors the easiest procedure which relies on `npm` (default Node.js package manager) which is
   available after Node.js installation step:

   ```bash
   $ npm install -g node-red
   ```

1. Install Integration-Service. Follow the [Integration-Service installation manual](https://integration-service.docs.eprosima.com/en/latest/installation_manual/installation_manual.html#installation-manual).
   This is exemplified in the Dockerfile, basically it is build from sources downloaded from github. Dependencies
   associated with the build and bridge environments are required:

   ```bash
   $ apt-get update
   $ apt-get install -y libyaml-cpp-dev libboost-program-options-dev libwebsocketpp-dev \
                      libboost-system-dev libboost-dev libssl-dev libcurlpp-dev \
                      libasio-dev libcurl4-openssl-dev git
   $ mkdir -p /is_ws/src && cd "$_"
   $ git clone https://github.com/eProsima/Integration-Service.git is
   $ git clone https://github.com/eProsima/WebSocket-SH.git
   $ git clone https://github.com/eProsima/ROS2-SH.git
   $ git clone https://github.com/eProsima/FIWARE-SH.git

   $ . /opt/ros/humble/setup.sh # customize the ROS2 distro: foxy, galactic, humble ...
   $ colcon build --cmake-args -DIS_ROS2_SH_MODE=DYNAMIC --install-base /opt/is
   ```

   Note that it uses the ROS2 build tool: [colcon](https://colcon.readthedocs.io)
   As ROS2 it is necessary to source and
   [overlay](https://colcon.readthedocs.io/en/released/developer/environment.html).
   In order to simplify sourcing `/opt/is` was chosen as deployment dir. The overlay can be then sourced as:

   ```bash
   $ . /opt/is/setup.bash
   ```
   It will automatically load the ROS2 overlay too. After the overlay is sourced it must be possible to access the
   integration-service help as:

   ```bash
   $ integration-service --help
   ```

### Library installation

Once all the dependencies are available we can deploy the plugin via npm:
+ From npm repo:

   ```bash
   $ npm install -g IS-Web-API
   ```
+ From sources. `npm` allows direct deployment from github repo:

   ```bash
   $ npm install -g https://github.com/eProsima/IS-Web-API
   ```

   Or, as in the Dockerfile, from a local sources directory. The docker favors this approach to allow tampering with the
   sources.

   ```bash
   $ git clone https://github.com/eProsima/IS-Web-API.git plugin_sources
   $ npm install -g  ./plugin_sources

   ```

## Interface APIs

Interfaces are provided for ROS2 and FIWARE endpoints.
Type definition APIs are provided by the ROS2 module and are common for the FIWARE module. That is, the FIWARE module
uses ROS2 provided types.

In order to be suitable for Node-RED nodes operation APIs are flexible in the calling order. Note that Node-RED nodes
initialization order is nondeterministic. For example: Publisher and Subscribers can be defined BEFORE its associated types.

### ROS2 APIs

They are accessible using:

```js
    let ros_api = require('IS-Web-API').ros2;
```

<table>
    <tr>
        <td colspan="2"><tt>function get_dds_domain()</tt></td>
    </tr>
    <tr>
        <td>returns</td>
        <td>The actual DDS domain selected</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function set_dds_domain(id)</tt></td>
    </tr>
    <tr>
        <td>id</td>
        <td>Sets the DDS domain to use</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function get_event_emitter()</tt></td>
    </tr>
    <tr>
        <td>returns</td>
        <td>Event emitter associated to the ROS2 config. It reports:
            <dl>
                <dt>IS-ERROR</dt><dd>Error on integration-service deployment</dd>
                <dt>ROS2_connected</dt><dd>ROS2 bridge websocket operational</dd>
                <dt>[TOPIC]_data</dt>
                <dd>Data has been received for [TOPIC]. It is delivered as a json argument for the callback</dd>
            </dl>
        </td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function send_message(topic, data)</tt></td>
    </tr>
    <tr>
        <td>topic</td>
        <td>Topic associate with the data</td>
    </tr>
    <tr>
        <td>data</td>
        <td>Data to deliver as a javascript Object</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function stop()</tt></td>
    </tr>
    <tr>
        <td colspan="2">Stops integration-service operation</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function launch(node_id)</tt></td>
    </tr>
    <tr>
        <td>node_id</td>
        <td>identifier used to query the error dictionary.
            If an error is registered the operation is aborted and the error return</td>
    </tr>
    <tr>
        <td>returns</td>
        <td>An Object with the following properties:
            <dl>
                <dt>color</dt><dd>'red' on error</dd>
                <dt>message</dt><dd>non-null on error</dd>
                <dt>event_emitter</dt><dd>The same value returned by <tt>get_event_emitter()</tt></dd>
            </dl>
        </td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function new_config()</tt></td>
    </tr>
    <tr>
        <td colspan="2">resets the global configuration for integration-service. All types & endpoints are discarded</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function add_publisher(pub_id, topic_name, type_name, qos)</tt></td>
    </tr>
    <tr>
        <td>pub_id</td>
        <td>identifier used to fill the error dictionary if there is an error</td>
    </tr>
    <tr>
        <td>topic_name</td>
        <td>Topic associated to the publisher</td>
    </tr>
    <tr>
        <td>type_name</td>
        <td>Type associated to the publisher. May not be registered at the call time</td>
    </tr>
    <tr>
        <td>qos</td>
        <td>a collection of DDS QoS as array of properties. Each property is an Object with:
            <dl>
                <dt>p</dt><dd>[qos name](.[param])?</dd>
                <dt>v</dt><dd>value of the param if any</dd>
            </dl>
            Information about each QoS is provided
            <a href="https://raw.githubusercontent.com/eProsima/node-red-ros2-plugin/master/qos-description.json">here</a>.
        </td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function add_subscriber(sub_id, topic_name, type_name, qos)</tt></td>
    </tr>
    <tr>
        <td>sub_id</td>
        <td>identifier used to fill the error dictionary if there is an error</td>
    </tr>
    <tr>
        <td>topic_name</td>
        <td>Topic associated to the subscriber</td>
    </tr>
    <tr>
        <td>type_name</td>
        <td>Type associated to the subscriber. May not be registered at the call time</td>
    </tr>
    <tr>
        <td>qos</td>
        <td>a collection of DDS QoS as array of properties. Each property is an Object with:
            <dl>
                <dt>p</dt><dd>[qos name](.[param])?</dd>
                <dt>v</dt><dd>value of the param if any</dd>
            </dl>
            Information about each QoS is provided
            <a href="https://raw.githubusercontent.com/eProsima/node-red-ros2-plugin/master/qos-description.json">here</a>.
        </td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function add_ros2_type(package_name, type_name)</tt></td>
    </tr>
    <tr>
        <td>package_name</td>
        <td>name associated to a builtin ROS2 messages package.</td>
    </tr>
    <tr>
        <td>type_name</td>
        <td>name associated to one of messages in the package argument</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function add_idl_type(idl, type_name)</tt></td>
    </tr>
    <tr>
        <td>idl</td>
        <td>IDL file associated to the type in a single string</td>
    </tr>
    <tr>
        <td>type_name</td>
        <td>name to associate to the IDL</td>
    </tr>
</table>

### FIWARE APIs

They are accessible using:

```js
    let fiware = require('IS-Web-API').fiware;
```

<table>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function get_fiware_port()</tt></td>
    </tr>
    <tr>
        <td>returns</td>
        <td>The actual port selected for the Context Broker</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function set_fiware_port(port)</tt></td>
    </tr>
    <tr>
        <td>port</td>
        <td>Sets the port associated to the Context Broker</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function get_fiware_host()</tt></td>
    </tr>
    <tr>
        <td>returns</td>
        <td>The actual IPv4 host address selected for the Context Broker</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function set_fiware_host(host)</tt></td>
    </tr>
    <tr>
        <td>host</td>
        <td>Sets the IPv4 host address associated to the Context Broker</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function get_event_emitter()</tt></td>
    </tr>
    <tr>
        <td>returns</td>
        <td>Event emitter associated to the FIWARE config. It reports:
            <dl>
                <dt>IS-ERROR</dt><dd>Error on integration-service deployment</dd>
                <dt>FIWARE_connected</dt><dd>FIWARE bridge websocket operational</dd>
                <dt>[TOPIC]_data</dt>
                <dd>Data has been received for [TOPIC]. It is delivered as a json argument for the callback</dd>
            </dl>
        </td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function send_message(topic, data)</tt></td>
    </tr>
    <tr>
        <td>topic</td>
        <td>Topic associate with the data</td>
    </tr>
    <tr>
        <td>data</td>
        <td>Data to deliver as a javascript Object</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function stop()</tt></td>
    </tr>
    <tr>
        <td colspan="2">Stops integration-service operation</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function launch(node_id)</tt></td>
    </tr>
    <tr>
        <td>node_id</td>
        <td>identifier used to query the error dictionary.
            If an error is registered the operation is aborted and the error return</td>
    </tr>
    <tr>
        <td>returns</td>
        <td>An Object with the following properties:
            <dl>
                <dt>color</dt><dd>'red' on error</dd>
                <dt>message</dt><dd>non-null on error</dd>
                <dt>event_emitter</dt><dd>The same value returned by <tt>get_event_emitter()</tt></dd>
            </dl>
        </td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function new_config()</tt></td>
    </tr>
    <tr>
        <td colspan="2">resets the global configuration for integration-service. All types & endpoints are discarded</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function add_publisher(pub_id, topic_name, type_name)</tt></td>
    </tr>
    <tr>
        <td>pub_id</td>
        <td>identifier used to fill the error dictionary if there is an error</td>
    </tr>
    <tr>
        <td>topic_name</td>
        <td>Topic associated to the publisher</td>
    </tr>
    <tr>
        <td>type_name</td>
        <td>Type associated to the publisher. May not be registered at the call time</td>
    </tr>
    <!-- -->
    <tr>
        <td colspan="2"><tt>function add_subscriber(sub_id, topic_name, type_name)</tt></td>
    </tr>
    <tr>
        <td>sub_id</td>
        <td>identifier used to fill the error dictionary if there is an error</td>
    </tr>
    <tr>
        <td>topic_name</td>
        <td>Topic associated to the subscriber</td>
    </tr>
    <tr>
        <td>type_name</td>
        <td>Type associated to the subscriber. May not be registered at the call time</td>
    </tr>
</table>

***

<img src="https://raw.githubusercontent.com/eProsima/node-red-ros2-plugin/master/docs/eu_flag.jpg" alt="eu_flag" height="45" align="left" >

This project (DIH² - A Pan‐European Network of Robotics DIHs for Agile Production) has received funding from the
European Union’s Horizon 2020 research and innovation programme under grant agreement No 824964
