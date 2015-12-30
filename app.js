var express = require("express");
var path = require("path");
var xmldom = require('xmldom');
var fs = require('fs');
var parser = require('xmldom').DOMParser;
var FolderNode = require('./foldernode.js').FolderNode;
var DeviceNode = require('./devicenode.js').DeviceNode;
var app = express();

var elkEnabled = false;
var extendedErrors = true;
var userName = 'admin';
var password = 'password';
var requireAuthorization = true;
var basicAuth = require('basic-auth');

var fileData = fs.readFileSync('./example-nodes.xml', 'ascii');
var doc = new parser().parseFromString(fileData.substring(2, fileData.length));
var folders = doc.getElementsByTagName('folder');
var nodeIndex = {};



for(var i = 0; i < folders.length; i++) {
    var newNode = new FolderNode(folders[i]);
    console.log(newNode.getName());
    newNode.setName('Foobar');
    console.log(newNode.getName());
    nodeIndex[newNode.getAddress()] = newNode;
}

var devices = doc.getElementsByTagName('node');

for(var j = 0; j < devices.length; j++) {
    var newNode = new DeviceNode(devices[j]);
    console.log(newNode.getName());
    console.log(newNode.getType());
    if(newNode.getType() == '4.15.1.0') {
        continue;
    }
    nodeIndex[newNode.getAddress()] = newNode;
}

var auth = function (req, res, next) {
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.sendStatus(401);
  };

  var user = basicAuth(req);
  
  if(!requireAuthorization) {
      return next();
  }

  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  };

  if (user.name === userName && user.pass === password) {
    return next();
  } else {
    return unauthorized(res);
  };
};

function buildResponse(res, resultSuccess, resultCode, extended) {
    res.status(resultCode);
    res.set('EXT','UCoS, UPnP/1.0, UDI/1.0');
    res.set('Cache-Control', 'no-cache');
    res.set('WWW-Authenticate','Basic realm="/"');
    res.set('Last-Modified', new Date());
    res.set('Connection','Keep-Alive');
    res.set('Content-Type', 'text/xml; charset=UTF-8');
    var resultString = 
        '<?xml version="1.0" encoding="UTF-8"?>\r\n'+
        '<RestResponse succeeded="'+resultSuccess+   '">\r\n'+
        '    <status>'+resultCode+'</status>\r\n';
    if(extendedErrors && extended != undefined && extended != null) {
        resultString += '    <extended>'+extended+'</extended>\r\n';
    }
    resultString += '</RestResponse>\r\n'; 
    res.send(resultString);
}   

app.get('/control/elk/enabled/:enabled', function (req,res) {
    elkEnabled = (req.params.enabled=="true") ? true : false;  
    res.send('Elk status set to: '+elkEnabled);      
});

app.get('/control/errors/extended/:enabled', function (req,res) {
    extendedErrors = (req.params.enabled=="true") ? true : false;  
    res.send('Extended Errors set to: '+elkEnabled);      
});

app.get('/rest/nodes', auth, function (req, res) {
    res.send('Node list');
});

function handleCommandRequest(req, res) {
    var nodeToUpdate = nodeIndex[req.params.address];
    if(nodeToUpdate == undefined || nodeToUpdate == null) {
        buildResponse(res, false, 404);
    } else {
        try {
            nodeToUpdate.simulateExecuteCommand(req.params.command, req.params.parameter);
            buildResponse(res, true, 200);
        }
        catch(err) {
            if(extendedErrors) {
                buildResponse(res, false, 500,err);
            } else {
                buildResponse(res, false, 500);
            }
        }
    }    
}

// Execute a command
app.get('/rest/nodes/:address/cmd/:command/:parameter', auth, function (req, res) {
    handleCommandRequest(req,res);
});

app.get('/rest/nodes/:address/cmd/:command', auth, function (req, res) {
    handleCommandRequest(req,res);
})

app.get('/rest/elk/get/topology', auth, function (req, res) {
    if(!elkEnabled) {
        res.status(500).send('Elk is disabled');
    } else {
        res.send('Elk topology');
    }
});

app.get('/rest/elk/get/status', auth, function (req,res)  {
    if(!elkEnabled) {
        res.status(500).send('Elk is disabled');
    } else {
        res.send('Elk status');
    }
});

var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('fake-isy-994i app listening at http://%s:%s', host, port);
});

