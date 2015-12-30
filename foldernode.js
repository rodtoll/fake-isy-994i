var xmldom = require('xmldom');
var utils = require('./utils.js');

var FolderNode = function(xmlNode) {
    this.node = xmlNode;
}

FolderNode.prototype.setFlag = function(flag) { 
    this.node.setAttribute('flag', flag);
}

FolderNode.prototype.getFlag = function() {
    return this.node.getAttribute('flag');
}

FolderNode.prototype.setAddress = function(address) { 
    utils.setElementValue(this.node, 'address', address);
}

FolderNode.prototype.getAddress = function() { 
    return utils.getElementValue(this.node, 'address');
}

FolderNode.prototype.setName = function(name) { 
    utils.setElementValue(this.node, 'name', name);
}

FolderNode.prototype.getName = function() { 
    return utils.getElementValue(this.node, 'name');
}

exports.FolderNode = FolderNode;