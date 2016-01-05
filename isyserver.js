var express = require("express");
var path = require("path");
var xmldom = require('xmldom');
var fs = require('fs');
var parser = require('xmldom').DOMParser;
var FolderNode = require('./foldernode.js').FolderNode;
var DeviceNode = require('./devicenode.js').DeviceNode;
var SceneNode = require('./scenenode.js').SceneNode;
var WebSocket = require('faye-websocket');
var log = require('./utils').log;
var setLogEnabled = require('./utils').setLogEnabled;

var basicAuth = require('basic-auth');

var ISYServer = function(port, config) {
    this.app = express();
    this.port = port;
    this.config = {};
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
    res.send(this.elkStatus);
    this.logRequestEndDetails(res);    
}

ISYServer.prototype.handleElkTopologyRequest = function(req,res) {
    this.logRequestStartDetails(req);    
    this.setupResponseHeaders(res,200);
    if(this.getConfigSetting(this.CONFIG_LOG_RESPONSE_BODY)) {
        log('Response Body: '+this.elkTopology);
    }
    res.send(this.elkTopology);
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

ISYServer.prototype.logRequestStartDetails = function(req) {
    log("REQUEST. Source="+req.ip+" Url: "+req.originalUrl);   
}

ISYServer.prototype.logRequestEndDetails = function(res) {
    log("RESULT: Code="+res.statusCode);
}

ISYServer.prototype.handleCommandRequest = function(req, res) {
    this.logRequestStartDetails(req);
    var nodeToUpdate = this.nodeIndex[req.params.address];

    if(nodeToUpdate == undefined || nodeToUpdate == null) {
        this.buildCommandResponse(res, false, 404);
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
    this.loadNodeState();    
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
    
    this.elkStatus = fs.readFileSync(this.getConfigSetting(this.CONFIG_ELK_STATUS_FILE));
    this.elkTopology = fs.readFileSync(this.getConfigSetting(this.CONFIG_ELK_TOPOLOGY_FILE));
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

ISYServer.prototype.sendDeviceUpdate = function(ws,device) {
    var updateData = '<?xml version="1.0"?><Event seqnum="';
    updateData += this.getNextSequenceNumber();
    updateData += '" side="uuid:47"><control>ST</control><action>';
    updateData += device.getValue();
    updateData += '</action><node>';
    updateData += device.getAddress();
    updateData += '</node><eventInfo></eventInfo></Event>';
    if(this.getConfigSetting(this.CONFIG_LOG_WEBSOCKET_NOTIFICATION)) {
        log('WEBSOCKET: NOTIFICATION: '+updateData);
    }
    ws.send(updateData);
}

ISYServer.prototype.sendDeviceUpdateToAll = function(device) {
    for(var socketIndex = 0; socketIndex < this.webSocketClientList.length; socketIndex++) {
        this.sendDeviceUpdate(this.webSocketClientList[socketIndex],device);
    }
}

ISYServer.prototype.sendInitialState = function(ws) {
    for(var i = 0; i < this.nodeList.length; i++) {
        var device = this.nodeList[i];
        if(device instanceof DeviceNode) {
            this.sendDeviceUpdate(ws,device);     
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
    
    this.app.get('/rest/nodes', this.authHandler.bind(this), function (req, res) {
        that.handleNodesRequest(req,res);
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


