var express = require("express");
var path = require("path");
var xmldom = require('xmldom');
var fs = require('fs');
var parser = require('xmldom').DOMParser;
var xmlImpl = require('xmldom').DOMImplementation;
var FolderNode = require('./foldernode.js').FolderNode;
var DeviceNode = require('./devicenode.js').DeviceNode;
var SceneNode = require('./scenenode.js').SceneNode;
var WebSocket = require('faye-websocket');
var log = require('./utils').log;
var setLogEnabled = require('./utils').setLogEnabled;
var Ssdp = require('upnp-ssdp');
var xmlparser = require('express-xml-bodyparser');
var restler = require('restler')
var ElkStatus = require('./elkstatus.js').ElkStatus;

var basicAuth = require('basic-auth');

var ISYServer = function(port, config) {
    this.app = express();
    this.app.use(xmlparser());
    this.port = port;
    this.config = {};
    this.xmlImplementation = new xmlImpl();
    this.loadConfig(config);
    this.resetState();
}

ISYServer.prototype.CONFIG_ELK_ENABLED = 'elkEnabled';
ISYServer.prototype.CONFIG_EXTENDED_ERRORS = 'extendedErrors';
ISYServer.prototype.CONFIG_USERNAME = 'userName';
ISYServer.prototype.CONFIG_PASSWORD = 'password';
ISYServer.prototype.CONFIG_REQUIRE_AUTH = 'requireAuth';
ISYServer.prototype.CONFIG_LOGGER_ENABLED = 'loggerEnabled';
ISYServer.prototype.CONFIG_NODE_FILE = 'nodeFile';
ISYServer.prototype.CONFIG_ELK_STATUS_FILE = 'elkStatusFile';
ISYServer.prototype.CONFIG_ELK_TOPOLOGY_FILE = 'elkTopologyFile';
ISYServer.prototype.CONFIG_LOG_RESPONSE_BODY = 'logResponseBody';
ISYServer.prototype.CONFIG_LOG_WEBSOCKET_NOTIFICATION = 'logWebSockets';
ISYServer.prototype.CONFIG_LOG_WEB_NOTIFICATION = 'logWebNotification';

ISYServer.prototype.loadConfig = function(config) {
    
    this.configSettings = [
        // Logger should always be the first setting, used to set default of logger below this block
        { name: this.CONFIG_LOGGER_ENABLED, default: true },        
        { name: this.CONFIG_ELK_ENABLED, default: true },
        { name: this.CONFIG_EXTENDED_ERRORS, default: true },
        { name: this.CONFIG_USERNAME, default: 'admin' },
        { name: this.CONFIG_PASSWORD, default: 'password' },
        { name: this.CONFIG_REQUIRE_AUTH, default: true },
        { name: this.CONFIG_NODE_FILE, default: './example-nodes.xml' },
        { name: this.CONFIG_ELK_STATUS_FILE, default: './example-elk-status.xml' },
        { name: this.CONFIG_ELK_TOPOLOGY_FILE, default: './example-elk-topology.xml' },
        { name: this.CONFIG_LOG_RESPONSE_BODY, default: false},
        { name: this.CONFIG_LOG_WEB_NOTIFICATION, default: false},
        { name: this.CONFIG_LOG_WEBSOCKET_NOTIFICATION, default: true}
    ];
    
    // Special case logging as we need to setup logging BEFORE loading config so we can log setting results
    if(config != undefined && config.loggerEnabled != undefined) {
        setLogEnabled(config.loggerEnabled);
    } else {
        setLogEnabled(this.configSettings[0].default);
    }
    
    log('Configuration:');
    
    for(var configIndex = 0; configIndex < this.configSettings.length; configIndex++) {
        if(config == undefined || config[this.configSettings[configIndex].name] == undefined) {
            this.setConfigSetting(this.configSettings[configIndex].name, this.configSettings[configIndex].default);
        } else {
            this.setConfigSetting(this.configSettings[configIndex].name, config[this.configSettings[configIndex].name]);            
        }
        log(this.configSettings[configIndex].name+': '+this.getConfigSetting(this.configSettings[configIndex].name));
    }
}

ISYServer.prototype.getConfigSetting = function(settingName) {
    return this.config[settingName];
}

ISYServer.prototype.setConfigSetting = function(settingName, value) {
    this.config[settingName] = value;    
}

ISYServer.prototype.buildCommandResponse = function(res, resultSuccess, resultCode, extended) {
    this.setupResponseHeaders(res, resultCode);
    var resultString = 
        '<?xml version="1.0" encoding="UTF-8"?>\r\n'+
        '<RestResponse succeeded="'+resultSuccess+   '">\r\n'+
        '    <status>'+resultCode+'</status>\r\n';
    if(this.getConfigSetting(this.CONFIG_EXTENDED_ERRORS) && extended != undefined && extended != null) {
        resultString += '    <extended>'+extended+'</extended>\r\n';
    }
    resultString += '</RestResponse>\r\n'; 
    if(this.getConfigSetting(this.CONFIG_LOG_RESPONSE_BODY)) {
        log('Response Body: '+resultString);
    }
    res.send(resultString);
}

ISYServer.prototype.buildSubscribeResponse = function(res, subscriptionId) {
    this.setupSubscribeResponseHeaders(res, 200);
    var response = '<?xml version="1.0" encoding="UTF-8"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SubscriptionResponse><SID>uuid:'
    response += subscriptionId
    response += '</SID><duration>0</duration></SubscriptionResponse></s:Body></s:Envelope>'
    if(this.getConfigSetting(this.CONFIG_LOG_RESPONSE_BODY)) {
        log('Response Body: '+response);
    }
    res.send(response)
}

ISYServer.prototype.setupSubscribeResponseHeaders = function(res, resultCode) {
    res.set('EXT','UCoS, UPnP/1.0, UDI/1.0');
    res.set('cache-control', "max-age=3600, must-revalidate");
    res.set('WWW-Authenticate','Basic realm="/"');
    res.set('Last-Modified', new Date());
    res.set('Connection','Keep-Alive');
    res.set('Content-Type', 'application/soap+xml; charset=UTF-8');

    res.status(resultCode);

}

ISYServer.prototype.setupResponseHeaders = function(res, resultCode) {
    res.set('EXT','UCoS, UPnP/1.0, UDI/1.0');
    res.set('Cache-Control', 'no-cache');
    res.set('WWW-Authenticate','Basic realm="/"');
    res.set('Last-Modified', new Date());
    res.set('Connection','Keep-Alive');
    res.set('Content-Type', 'text/xml; charset=UTF-8');    
    
    res.status(resultCode);
}

ISYServer.prototype.handleElkStatusRequest = function(req,res) {
    this.logRequestStartDetails(req);
    this.setupResponseHeaders(res,200);
    res.send(this.elkStatus.getStatus());
    this.logRequestEndDetails(res);    
}

ISYServer.prototype.handleElkTopologyRequest = function(req,res) {
    this.logRequestStartDetails(req);    
    this.setupResponseHeaders(res,200);
    if(this.getConfigSetting(this.CONFIG_LOG_RESPONSE_BODY)) {
        log('Response Body: '+this.elkTopology);
    }
    res.send(this.elkStatus.getTopology());
    this.logRequestEndDetails(res);    
}

ISYServer.prototype.handleNodesRequest = function(req,res) {
    this.logRequestStartDetails(req);    
    this.setupResponseHeaders(res,200);
    if(this.getConfigSetting(this.CONFIG_LOG_RESPONSE_BODY)) {
        log(this.rootDoc.toString());
    } 
    res.send(this.rootDoc.toString());
    this.logRequestEndDetails(res);
}

ISYServer.prototype.handleNodeRequest = function(req, res, nodeAddress) {
    this.logRequestStartDetails(req);

    var node = this.nodeIndex[req.params.address];

    if(node == undefined) {
        this.setupResponseHeaders(res, 404, "Unable to find specified node");
    } else {
        var result = '<?xml version="1.0" encoding="UTF-8"?><nodeInfo>';
        result += node.node.toString();
        result += '</nodeInfo>';
        this.setupResponseHeaders(res, 200);
        if(this.getConfigSetting(this.CONFIG_LOG_RESPONSE_BODY)) {
            log(result);
        }
        res.send(result);
    }
    this.logRequestEndDetails(res);
}

ISYServer.prototype.createResponseDocument = function() {
    var responseDoc = this.xmlImplementation.createDocument("","","");
    responseDoc.appendChild(responseDoc.createProcessingInstruction('xml', 'version="1.0" encoding="UTF-8"'));
    return responseDoc;
}

ISYServer.prototype.handleStatusRequest = function(req, res) {
    this.logRequestStartDetails(req);
    var result = "";
    this.setupResponseHeaders(res, 200);

    var responseDoc = this.createResponseDocument();
    var nodesElement = responseDoc.createElement('nodes');
    for(var nodeIndex = 0; nodeIndex < this.nodeList.length; nodeIndex++) {
        if(this.nodeList[nodeIndex] instanceof DeviceNode) {
            nodesElement.appendChild(this.nodeList[nodeIndex].getStatusNode(responseDoc));
        }
    }
    responseDoc.appendChild(nodesElement);

    var result = responseDoc.toString();

    if(this.getConfigSetting(this.CONFIG_LOG_RESPONSE_BODY)) {
        log(result);
    }
    res.send(result);
    this.logRequestEndDetails(res);
}

ISYServer.prototype.logRequestStartDetails = function(req) {
    log("REQUEST. Source="+req.ip+" Url: "+req.originalUrl);   
}

ISYServer.prototype.logRequestEndDetails = function(res) {
    log("RESULT: Code="+res.statusCode);
}

ISYServer.prototype.handleZoneUpdate = function(zoneId, command) {
    var change = false;
    var zoneData = this.elkStatus.getZoneData(zoneId);
    if(zoneData == null) {
        log('Error, zone update request came for zoneId: '+zoneId);
        return;
    }

    if(command == "OPEN") {
        var firstChange = this.elkStatus.setZoneData(zoneId, "51", "2");
        var secondChange = this.elkStatus.setZoneData(zoneId, "52", "1");
        change = firstChange || secondChange;
    } else if(command == "CLOSE") {
        var firstChange = this.elkStatus.setZoneData(zoneId, "51", "0");
        var secondChange = this.elkStatus.setZoneData(zoneId, "52", "2");
        change = firstChange || secondChange;
    }

    return change;
}

ISYServer.prototype.sendElkZoneUpdateToAll = function(zoneId) {
    var zoneData = this.elkStatus.getZoneData(zoneId);
    for(var socketIndex = 0; socketIndex < this.webSocketClientList.length; socketIndex++) {
        this.sendElkZoneUpdate(this.webSocketClientList[socketIndex],zoneId,"51", zoneData["51"]);
        this.sendElkZoneUpdate(this.webSocketClientList[socketIndex],zoneId,"52", zoneData["52"]);
    }
    var tempWebList = this.webSubscriptions.slice()
    for(var webIndex = 0; webIndex < tempWebList.length; webIndex++) {
        this.sendElkZoneUpdateWeb(tempWebList[webIndex],zoneId,"51", zoneData["51"]);
        this.sendElkZoneUpdateWeb(tempWebList[webIndex],zoneId,"52", zoneData["52"]);
    }
}

ISYServer.prototype.handleCommandRequest = function(req, res) {
    this.logRequestStartDetails(req);
    var nodeToUpdate = this.nodeIndex[req.params.address];

    if(nodeToUpdate == undefined || nodeToUpdate == null) {
        if(this.elkStatus.getZoneData(req.params.address) != null) {
            var zoneId = req.params.address;
            if(this.handleZoneUpdate(zoneId, req.params.command)) {
                this.sendElkZoneUpdateToAll(zoneId);
            }
            this.buildCommandResponse(res, false, 200);
        } else {
            this.buildCommandResponse(res, false, 404);
        }
    } else if(nodeToUpdate instanceof FolderNode) {
        this.buildCommandResponse(res, false, 500, 'Specified address is a folder, cannot issue command');
    } else if(nodeToUpdate instanceof SceneNode) {
        try {
            var nodesChanged = [];
            for (var i = 0; i < nodeToUpdate.children.length; i++) {
                // ISY doesn't support dimming a scene, i.e. sending DON with a level command and doesn't return an
                // error when you try it. It just turns on. So cutting of the parameter just like ISY would.
                if (nodeToUpdate.children[i].simulateExecuteCommand(req.params.command, null)) {
                    nodesChanged.push(nodeToUpdate.children[i]);
                }
            }
            for (var nodeIndex = 0; nodeIndex < nodesChanged.length; nodeIndex++) {
                this.sendDeviceUpdateToAll(nodesChanged[nodeIndex]);
            }
            this.buildCommandResponse(res, true, 200);
        } catch(err) {
            this.buildCommandResponse(res, false, 500, err);
        }
    } else {
        try {
            if(nodeToUpdate.simulateExecuteCommand(req.params.command, req.params.parameter)) {
                this.sendDeviceUpdateToAll(nodeToUpdate);
            }
            this.buildCommandResponse(res, true, 200);
        }
        catch(err) {
            this.buildCommandResponse(res, false, 500, err);
        }
    }    
    this.logRequestEndDetails(res);    
}

ISYServer.prototype.handleConfigureRequest = function(req, res) {
    this.logRequestStartDetails(req);
    var configName = req.params.configName;
    var configValue = req.params.configValue;
    if(configName == undefined || configValue == undefined || configName == null || configValue == null) {
        this.buildCommandResponse(res, false, 500, 'No config value or config name specified');
        this.logRequestEndDetails(res);
        return;
    }
    if(this.getConfigSetting(configName)==undefined) {
        this.buildCommandResponse(res, false, 404, "Unknown config value"); 
        this.logRequestEndDetails(res);                 
        return;      
    }
    var valueToSet = configValue;
    if(valueToSet == 'true') {
        valueToSet = true;
    } else if(valueToSet == 'false') {
        valueToSet = false;
    } else if(!isNaN(valueToSet)) {
        valueToSet = Number(valueToSet);
    } 
    this.setConfigSetting(configName, valueToSet);
    this.buildCommandResponse(res, true, 200, "Configuration updated");     
    this.logRequestEndDetails(res);        
}

ISYServer.prototype.resetState = function() {
    this.webSocketClientList = [];
    this.sequenceNumber = 0;
    this.webSubscriptions = [];
    this.loadNodeState();    
}

ISYServer.prototype.handleAddWebSubscription = function(req,res) {
    this.logRequestStartDetails(req)
    var webSubscriptionNumber = this.webSubscriptions.length

    var envelopeElement = req.body['s:envelope']
    if(envelopeElement == null) {
        this.buildCommandResponse(res, false, 500, 'Malformed envelope element in request, rejected')
    } else {
        var bodyElement = envelopeElement['s:body']
        if(bodyElement == null) {
            this.buildCommandResponse(res, false, 500, 'Malformed envelope body element, rejected')
        } else {
            var subscribeElement = bodyElement[0]['u:subscribe']
            if(subscribeElement == null) {
                this.buildCommandResponse(res, false, 500, 'Missing subscribe element, rejected')
            } else {
                var subscribeUrl = subscribeElement[0].reporturl[0]
                if(subscribeUrl.indexOf('http')==-1) {
                    this.buildCommandResponse(res, false, 500, 'Invalid target url')
                } else {
                    this.webSubscriptions[webSubscriptionNumber] = subscribeUrl
                    this.sendInitialWebState(subscribeUrl)
                    this.buildSubscribeResponse(res, webSubscriptionNumber)
                }
            }
        }
    }
    this.logRequestEndDetails(res)
}

ISYServer.prototype.handleResetNodesRequest = function(req,res) {
    this.logRequestStartDetails(req);
    log('RESET: Resetting node state back to initial state');
    this.resetState();
    this.buildCommandResponse(res, true, 200, 'Node state reset to initial');
    this.logRequestEndDetails(res);
}

ISYServer.prototype.loadNodeState = function() {
    // Ensure we are clean
    this.nodeIndex = {};
    this.nodeList = [];
    
    var fileData = fs.readFileSync(this.getConfigSetting(this.CONFIG_NODE_FILE), 'ascii');
    this.rootDoc = new parser().parseFromString(fileData.substring(2, fileData.length));
    
    // Load folders
    var folders  = this.rootDoc.getElementsByTagName('folder');
    for(var i = 0; i < folders.length; i++) {
        var newNode = new FolderNode(folders[i]);
        this.nodeIndex[newNode.getAddress()] = newNode;
        this.nodeList.push(newNode);
    }    
    
    // Load devices
    var devices = this.rootDoc.getElementsByTagName('node');
    for(var j = 0; j < devices.length; j++) {
        var newNode = new DeviceNode(devices[j]);
        if(newNode.getType() == '4.15.1.0') {
            continue;
        }
        this.nodeIndex[newNode.getAddress()] = newNode;
        this.nodeList.push(newNode);        
    }
 
    // Load scenes
    var scenes  = this.rootDoc.getElementsByTagName('group');
    for(var i = 0; i < scenes.length; i++) {
        var newScene = new SceneNode(scenes[i], this.nodeIndex);
        this.nodeIndex[newScene.getAddress()] = newScene;
        this.nodeList.push(newScene);        
    }

    this.elkStatus = new ElkStatus(this.getConfigSetting(this.CONFIG_ELK_STATUS_FILE),this.getConfigSetting(this.CONFIG_ELK_TOPOLOGY_FILE))
}

ISYServer.prototype.buildUnauthorizedResponse = function(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');    
    res.sendStatus(401);
}

ISYServer.prototype.authHandler = function (req, res, next) {
    var user = basicAuth(req);

    if(!this.getConfigSetting(this.CONFIG_REQUIRE_AUTH)) {
        return next();
    }

    if (!user || !user.name || !user.pass) {
        this.buildUnauthorizedResponse(res);
        log('ERROR: Denied request, credentials not specified');        
        return res;
    }

    if (user.name === this.getConfigSetting(this.CONFIG_USERNAME) && user.pass === this.getConfigSetting(this.CONFIG_PASSWORD)) {
        return next();
    } else {
        this.buildUnauthorizedResponse(res);        
        log('ERROR: Denied request, credentials not specified');                
        return res;
    }
}

ISYServer.prototype.getNextSequenceNumber = function() {
    this.sequenceNumber++;
    return this.sequenceNumber;    
}

ISYServer.prototype.buildDeviceUpdate = function(device) {
    var updateData = '<?xml version="1.0"?><Event seqnum="';
    updateData += this.getNextSequenceNumber();
    updateData += '" side="uuid:47"><control>ST</control><action>';
    updateData += device.getValue();
    updateData += '</action><node>';
    updateData += device.getAddress();
    updateData += '</node><eventInfo></eventInfo></Event>';
    return updateData;
}

ISYServer.prototype.sendDeviceUpdate = function(ws,device) {
    var updateData = this.buildDeviceUpdate(device)
    if(this.getConfigSetting(this.CONFIG_LOG_WEBSOCKET_NOTIFICATION)) {
        log('WEBSOCKET: NOTIFICATION: '+updateData);
    }
    ws.send(updateData);
}

ISYServer.prototype.sendDeviceUpdateWeb = function(subscribeUrl,device) {
    var that = this;
    var updateData = this.buildDeviceUpdate(device)
    if(this.getConfigSetting(this.CONFIG_LOG_WEB_NOTIFICATION)) {
        log('WEB: NOTIFICATION: Target URL: '+subscribeUrl)
        log('WEB: NOTIFICATION: '+updateData);
    }
    var options = {
        data: updateData,
        headers: {
            'CONTENT-TYPE': 'text/xml'
        }
    }
    restler.post(subscribeUrl, options).on('error', function() {
        log('WEB: Notification failed to: '+subscribeUrl);
    });
}

ISYServer.prototype.sendTroubledUpdateWeb = function(subscribeUrl,device)
{
    var textToSend = ""+
"POST / HTTP/1.1\r\n"+
"HOST:10.0.1.4:39500\r\n"+
"CONTENT-TYPE:text/xml\r\n"+
"CONTENT-LENGTH: 147\r\n"+
"Connection: keep-alive\r\n"+
"\r\n"+
'<?xml version="1.0"?><Event seqnum="1" side="uuid:47"><control>ST</control><action>0</action><node>14 47 41 1</node><eventInfo></eventInfo></Event>'

    var net = require('net');

    //var HOST = '10.0.1.44';
    //var PORT = 3001;

    var HOST = '10.0.1.4'
    var PORT = 39500

    var client = new net.Socket();
    client.connect(PORT, HOST, function() {

        console.log('CONNECTED TO: ' + HOST + ':' + PORT);
        // Write a message to the socket as soon as the client is connected, the server will receive it as message from the client
        client.write(textToSend);
        client.destroy();
    });

// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
    client.on('data', function(data) {
        console.log('DATA: ' + data);
        // Close the client socket completely
        client.destroy();
    });

// Add a 'close' event handler for the client socket
    client.on('close', function() {
        console.log('Connection closed');
    });
}

ISYServer.prototype.buildElkZoneUpdate = function(zone, type, value) {
    var updateData = '<?xml version="1.0"?><Event seqnum="';
    updateData += this.getNextSequenceNumber();
    updateData += '" sid="uuid:48"><control>_19</control>';
    updateData += '<action>3</action>';
    updateData += '<node></node>';
    updateData += '<eventInfo>';
    updateData += '<ze type="'+type+'" zone="'+zone+'" val="'+value+'" />';
    updateData += '</eventInfo>';
    updateData += '</Event>';
    return updateData;
}

ISYServer.prototype.sendElkZoneUpdate = function(ws, zone, type, value) {
    var updateData = this.buildElkZoneUpdate(zone,type,value)
    if(this.getConfigSetting(this.CONFIG_LOG_WEBSOCKET_NOTIFICATION)) {
        log('WEBSOCKET: NOTIFICATION: '+updateData);
    }
    ws.send(updateData);
}

ISYServer.prototype.sendElkZoneUpdateWeb = function(subscribeUrl, zone, type, value) {
    var updateData = this.buildElkZoneUpdate(zone,type,value)
    if(this.getConfigSetting(this.CONFIG_LOG_WEB_NOTIFICATION)) {
        log('WEB: NOTIFICATION: '+updateData);
    }
    var options = {
        data: updateData,
        headers: {
            'CONTENT-TYPE': 'text/xml'
        }
    }
    restler.post(subscribeUrl, options).on('error', function() {
        log('WEB: Notification failed to: '+subscribeUrl);
    });
}

ISYServer.prototype.buildElkAreaUpdate = function(type, value) {
    var updateData = '<?xml version="1.0"?><Event seqnum="';
    updateData += this.getNextSequenceNumber();
    updateData += '" sid="uuid:48"><control>_19</control>';
    updateData += '<action>2</action>';
    updateData += '<node></node>';
    updateData += '<eventInfo>';
    updateData += '<ae type="' + type + '" area="1" val="' + value + '" />';
    updateData += '</eventInfo>';
    updateData += '</Event>';
    return updateData;
}

ISYServer.prototype.sendElkAreaUpdate = function(ws, type, value) {
    var updateData = this.buildElkAreaUpdate(type, value);
    if(this.getConfigSetting(this.CONFIG_LOG_WEBSOCKET_NOTIFICATION)) {
        log('WEBSOCKET: NOTIFICATION: '+updateData);
    }
    ws.send(updateData);
}

ISYServer.prototype.sendElkAreaUpdateWeb = function(subscribeUrl,type,value) {
    var updateData = this.buildElkAreaUpdate(type,value);
    if(this.getConfigSetting(this.CONFIG_LOG_WEB_NOTIFICATION)) {
        log('WEB: NOTIFICATION: Target URL: '+subscribeUrl)
        log('WEB: NOTIFICATION: '+updateData);
    }
    var options = {
        data: updateData,
        headers: {
            'CONTENT-TYPE': 'text/xml'
        }
    }
    restler.post(subscribeUrl, options).on('error', function() {
        log('WEB: Notification failed to: '+subscribeUrl);
    });
}

ISYServer.prototype.sendAlarmStatusUpdate = function(ws, alarmStatus) {
    if(value == 0) {
        this.sendElkAreaUpdate(ws, 3, alarmStatus);
        this.sendElkAreaUpdate(ws, 2, 1);
    } else {
        this.sendElkAreaUpdate(ws, 3, alarmStatus);
        this.sendElkAreaUpdate(ws, 2, 4);
        this.sendElkAreaUpdate(ws, 2, 3);
        setTimeout(function () { this.sendElkAreaUpdate(ws, 2, 4); }, 500);
    }
}

ISYServer.prototype.sendDeviceUpdateToAll = function(device) {
    for(var socketIndex = 0; socketIndex < this.webSocketClientList.length; socketIndex++) {
        this.sendDeviceUpdate(this.webSocketClientList[socketIndex],device);
    }
    var tempWebList = this.webSubscriptions.slice()
    for(var webIndex = 0; webIndex < tempWebList.length; webIndex++) {
        this.sendDeviceUpdateWeb(tempWebList[webIndex],device);
    }
}

ISYServer.prototype.sendInitialState = function(ws) {

    /*this.sendElkAreaUpdate(ws, "1", this.elkStatus.getAreaAttribute("1"));
    this.sendElkAreaUpdate(ws, "3", this.elkStatus.getAreaAttribute("3"));
    this.sendElkAreaUpdate(ws, "2", this.elkStatus.getAreaAttribute("2"));*/

    for(var i = 0; i < this.nodeList.length; i++) {
        var device = this.nodeList[i];
        if(device instanceof DeviceNode) {
            this.sendDeviceUpdate(ws,device);     
        }
    }    
}

ISYServer.prototype.sendInitialWebState = function(endpoint) {

    /*this.sendElkAreaUpdateWeb(endpoint, "1", this.elkStatus.getAreaAttribute("1"));
    this.sendElkAreaUpdateWeb(endpoint, "3", this.elkStatus.getAreaAttribute("3"));
    this.sendElkAreaUpdateWeb(endpoint, "2", this.elkStatus.getAreaAttribute("2"));*/

    for(var i = 0; i < this.nodeList.length; i++) {
        var device = this.nodeList[i];
        if(device instanceof DeviceNode) {
            this.sendDeviceUpdateWeb(endpoint,device);
            // this.sendTroubledUpdateWeb(endpoint,device);
        }
    }
}

ISYServer.prototype.configureRoutes = function() {
    var that = this;
    
    this.app.get('/config/reset', function(req, res) {
        that.handleResetNodesRequest(req,res);
    });
    
    this.app.get('/config/:configName/:configValue', function(req, res) {
        that.handleConfigureRequest(req,res);
    });

    this.app.get('/rest/nodes/:address/cmd/:command/:parameter', this.authHandler.bind(this), function (req, res) {
        that.handleCommandRequest(req,res);
    });

    this.app.get('/rest/nodes/:address/cmd/:command', this.authHandler.bind(this), function (req, res) {
        that.handleCommandRequest(req,res);
    });

    this.app.get('/rest/nodes/:address', this.authHandler.bind(this), function (req, res) {
        that.handleNodeRequest(req,res);
    });

    this.app.get('/rest/nodes', this.authHandler.bind(this), function (req, res) {
        that.handleNodesRequest(req,res);
    });

    this.app.get('/rest/status', this.authHandler.bind(this), function (req, res) {
        that.handleStatusRequest(req,res);
    });

    this.app.post('/services', this.authHandler.bind(this), function (req, res) {
       that.handleAddWebSubscription(req,res)
    });
    
    this.app.get('/rest/elk/get/topology', this.authHandler.bind(this), function (req, res) {
        if(!that.getConfigSetting(that.CONFIG_ELK_ENABLED)) {
            res.status(500).send('Elk is disabled');
        } else {
            that.handleElkTopologyRequest(req,res);
        }
    });

    this.app.get('/rest/elk/get/status', this.authHandler.bind(this), function (req,res)  {
        if(!that.getConfigSetting(that.CONFIG_ELK_ENABLED)) {
            res.status(500).send('Elk is disabled');
        } else {
            that.handleElkStatusRequest(req,res);
        }
    });
        
}

ISYServer.prototype.removeSocket = function(ws) {
    for(var socketIndex = 0; socketIndex < this.webSocketClientList.length; socketIndex++) {
        if(this.webSocketClientList[socketIndex] == ws) {
            this.webSocketClientList.splice(socketIndex,1);
            return;
        }
    }
}

ISYServer.prototype.start = function() {
    var that = this;
    this.configureRoutes();
    var server = this.app.listen(this.port, function () {
        var host = server.address().address;
        var port = server.address().port;

        this.ssdpServer = new Ssdp();
        this.ssdpServer.announce({ name: 'urn:udi-com:device:X_Insteon_Lighting_Device:1', port: port});

        console.log('fake-isy-994i app listening at http://%s:%s', host, port);
        
        server.on('upgrade', function(request, socket, body) {
            log('WEBSOCKET: Incoming upgrade request..');
            if (WebSocket.isWebSocket(request)) {
                var ws = new WebSocket(request, socket, body);
                log('WEBSOCKET: Incoming websocket connection request ver='+ws.version+' proto='+ws.protocol);                  
                
                ws.on('close', function(event) {
                    log('WEBSOCKET: close event code='+event.code+" reason="+event.reason);
                    that.removeSocket(ws);
                    ws = null;
                });
                
                that.webSocketClientList.push(ws); 
                that.sendInitialState(ws);                
            } else {
                log('WEBSOCKET: IGNORED: Upgrade request ignored, not a websocket');
            }
        });  
    });    
}

exports.ISYServer = ISYServer;


