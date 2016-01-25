var xmldom = require('xmldom');
var utils = require('./utils.js');
var parser = require('xmldom').DOMParser;
var fs = require('fs');

function ElkStatus(statusFile, topologyFile) {
    this.elkStatusContents = fs.readFileSync(statusFile).toString();
    this.elkStatus = new parser().parseFromString(this.elkStatusContents.substring(2, this.elkStatusContents.length));

    this.elkTopologyContents = fs.readFileSync(topologyFile).toString();
    this.elkTopology = new parser().parseFromString(this.elkTopologyContents.substring(2, this.elkTopologyContents.length));

    this.loadZoneList();
}

ElkStatus.prototype.loadZoneList = function() {
    this.zoneMap = {};
    this.zoneList = [];
    var elkZones = this.elkTopology.getElementsByTagName('zone')
    for(var zoneIndex = 0; zoneIndex < elkZones.length; zoneIndex++) {
        var zoneId = elkZones[zoneIndex].getAttribute("id");
        var zoneName = elkZones[zoneIndex].getAttribute("name")
        var zoneAlarmDef = elkZones[zoneIndex].getAttribute("alarmDef")
        var zoneData = { id: zoneId, name: zoneName, alarmDef: zoneAlarmDef};
        this.zoneList.push(zoneData);
        this.zoneMap[zoneId] = zoneData;
    }
}

ElkStatus.prototype.getStatus = function() {
    return this.elkStatus.toString();
}

ElkStatus.prototype.getTopology = function() {
    return this.elkTopology.toString();
}

ElkStatus.prototype.getZones = function() {
    return this.zoneList;
}

ElkStatus.prototype.getZoneData = function(id) {
    var zoneEntry = this.zoneMap[id];
    if(zoneEntry == null) {
        return null;
    }
    var zoneData = {};
    var zoneStatusElements = this.elkStatus.getElementsByTagName('ze');
    for(var index = 0; index < zoneStatusElements.length; index++) {
        var zoneStatusElement = zoneStatusElements[index];
        if(zoneStatusElement.getAttribute("zone")==id) {
            zoneData[zoneStatusElement.getAttribute("type")] = zoneStatusElement.getAttribute("val");
        }
    }
    return zoneData;
}

ElkStatus.prototype.setZoneData = function(id, type, value) {
    var changed = false;
    var zoneEntry = this.zoneMap[id];
    if(zoneEntry == null) {
        return null;
    }
    var zoneStatusElements = this.elkStatus.getElementsByTagName('ze');
    for(var index = 0; index < zoneStatusElements.length; index++) {
        var zoneStatusElement = zoneStatusElements[index];
        if(zoneStatusElement.getAttribute("zone")==id && zoneStatusElement.getAttribute("type")==type) {
            changed = (zoneStatusElement.getAttribute("val")!=value);
            zoneStatusElement.setAttribute("val",value);
            break;
        }
    }
    return changed;
}

ElkStatus.prototype.getAreaAttribute = function(type) {
    var areaElements = this.elkStatus.getElementsByTagName('ae');
    for(var index = 0; index < areaElements.length; index++) {
        if(areaElements[index].getAttribute("type")==type) {
            return areaElements[index].getAttribute("val");
        }
    }
}

ElkStatus.prototype.setAreaAttribute = function(type,value) {
    var areaElements = this.elkStatus.getElementsByTagName('ae');
    for(var index = 0; index < areaElements.length; index++) {
        if(areaElements[index].getAttribute("type")==type) {
            areaElements[index].setAttribute("val",value);
        }
    }
}

ElkStatus.prototype.setAlarmState = function(status) {

}

exports.ElkStatus = ElkStatus;
