# fake-isy-994i
(C) Rod Toll 2015, Licensed under the MIT-LICENSE.

Provides an express based server which emulates an ISY-99i/994i from Universal Devices. (http://www.universal-devices.com). For information on the ISY's rest interface see the Universal Devices SDK here: https://www.universal-devices.com/isy-developers/.

Purpose
-------
I built this project so I could test libraries and applications which interface with the ISY without having to go against my live device. The occupants of the house don't appreciate lights turning on and off randomly as I run unit tests. I felt this was a stronger solution then local mocks as they can be used to test against from multiple languages. I use it to test my Node.js Node library: https://github.com/rodtoll/isy-js. Hopefully you find it useful!

Getting Started
---------------
First clone the repository and then run the server:

```
1. $ git clone https://github.com/rodtoll/isy-js.git
2. $ cd isy-js
3. $ npm install
4. node start.js
```

How It Works
------------
The server loads configuration from three files which represent the state of the ISY:
* `nodeFile` - The results of a call to <ISY SERVER>/rest/nodes. This includes the list of folders, devices and scenes.
* `elkStatusFile` - The results of a call to <ISYSERVER>/elk/get/status. This shows the status of the elk devices.
* `elkTopologyFile` - The results of a call to <ISYSERVER>/elk/get/topology. This shows the toplogy of the elk network.  

The server uses this to initialize a server which allows you to operate on the devices specified. Not all operations are supported, but the basics are. 

See Supported Operations for which operations have been implemented.  

In Code
-------
The server is simple to start. Just import the server object, setup your config options, create a server and start it.

Included right in your project:
```
var ISYServer = require('ISYServer').ISYServer

// Setup config options
var config = {};

var server = new ISYServer(3000,config);
server.start();
```

Instructions when pulled in via npm coming soon once package is published.

Configuration Options
---------------------
The second parameter to the ISYServer constructor is a config object. There are a number of optional parameters you can specify in the object. All are optional as all have defaults.

Configuration options:
* `loggerEnabled` - Set to true to have log messages sent to the console, false otherwise. Default: true
* `elkEnabled` - Should the server support elk operations. (Not all are supported yet). Default: true
* `extendedErrors` - Should the server include additional error information in responses to help with debuging. The messages appear in the <extended> tag in the response body. Default: true
* `userName` - What username does the server expect? Default: admin
* `password` - What password does the server expect? Default: password
* `requireAuth` - Should auth be enforced? Useful if you just want to experiment before getting your auth setup.
* `nodeFile` - Fully qualified path to file containing raw results of a call to an ISY in the /rest/nodes path. See example-nodes.xml for a sample.
* `elkStatusFile` - Fully qualified path to file containing raw results of a call to an ISY with elk enabled in the /rest/elk/get/status. See example-elk-status.xml for a sample (and it is the default).
* `elkTopologyFile` - Fully qualified path to file containing raw results of a call to an ISY with elk enabled in the /rest/elk/get/topology. See example-elk-topology.xml for a sample (and it is the default).
* `logResponseBody` - Should the body of responses being sent be sent to the log. Default: false
* `logWebSockets` - Should the body of messages sent to websockets be sent to the log. Default: false

Sample:
```
var config = {
    loggerEnabled: true,
    elkEnabled: true,
    extendedErrors: true,
    userName: 'admin',
    password: 'password',
    requireAuth: true,
    nodeFile: './example-nodes.xml',
    elkStatusFile: './example-elk-status.xml',
    elkTopologyFile: './example-elk-topology.xml',
    logResponseBody: false,
    logWebSockets: false
}
```

NOTE: start.js shows all options specified and they are set to their defaults.

Supported Operations
--------------------
The following REST operations are supported:

* `/config/reset` - Drops all websocket connections, resets all devices and nodes back to the state as specified in the nodeFile, elkStatusFile and elkToplogyFile.
* `/config/<configname>/<configValue>` - Sets the configuration value specified to the specified value. boolean should be true or false (case sensitive). NOTE: If you change any of the file parameters you will need to do a reset (as above) to load the new configs.
* `/rest/nodes/<ISY Address>/cmd/DON' - ISY on operation.
* `/rest/nodes/<ISY Address>/cmd/DOF' - ISY off operation.
* `/rest/nodes/<ISY Address>/cmd/DFON' - ISY Fast On operation.
* `/rest/nodes/<ISY Address>/cmd/DFOF' - ISY Fast Off operation.
* `/rest/nodes/<ISY Address>/cmd/BEEP' - ISY BEEP operation.
* `/rest/nodes` - ISY Get nodes operation.
* `/rest/elk/get/topology` - ISY Get elk topology operation.
* `/rest/elk/get/status` - ISY Get elk topology operation.

Additionally, websocket notifications are supported as per the ISY documentation. 

Notifications supported:
* Initial device state for all devices
* Device state changes

Notifications not yet supported:
* Initial response including client id
* Elk device notifications / alarm state notifications.
* All other notification types not listed above.

Example Configuration
---------------------
The example files included are from an actual server which has a large network (200 devices including scenes). It has Elk, ISY and ZWave devices included.

TODO
----
* Command-line overrides for config.
* Support for variables.
* Support for programs.
* Support for Elk commands.
* Support for alarm state.
* More robust websocket support. Fill out rest of notifications.
* Tighten validation on websocket connectivity. Current implementation is more forgiving then the actual ISY.
