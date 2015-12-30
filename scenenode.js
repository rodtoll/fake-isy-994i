var xmldom = require('xmldom');
var utils = require('./utils.js');

var SceneNode = function(xmlNode,deviceMap) {
    this.node = xmlNode;
    this.children = [];
    var links = this.node.getElementsByTagName('link');
    for(var i = 0; i < links.length; i++) {
        var linkNode = links[i];
        var linkAddress = linkNode.textContent;
        this.children.push(deviceMap[linkAddress]);
    }
}

SceneNode.prototype.getAddress = function() { 
    return utils.getElementValue(this.node, 'address');
}

SceneNode.prototype.getName = function() { 
    return utils.getElementValue(this.node, 'name`');
}



exports.SceneNode = SceneNode;