var xmldom = require('xmldom');
var utils = require('./utils.js');

var DeviceNode = function(xmlNode) {
    this.node = xmlNode;
}

DeviceNode.prototype.getAddress = function() { 
    return utils.getElementValue(this.node, 'address');
}

DeviceNode.prototype.getName = function() { 
    return utils.getElementValue(this.node, 'name');
}

DeviceNode.prototype.getType = function() { 
    return utils.getElementValue(this.node, 'type');
}

DeviceNode.prototype.getEnabled = function() { 
    return utils.getElementValue(this.node, 'enabled');
}

DeviceNode.prototype.setEnabled = function(enabled) { 
    utils.getElementValue(this.node, 'enabled', enabled);
}

DeviceNode.prototype.hasValue = function() {
    return (this.node.getElementsByTagName("property").length > 0);
}

DeviceNode.prototype.getValue = function() {
    return utils.getElementAttributeValue(this.node, 'property', 'value');
}

DeviceNode.prototype.setValue = function(value) { 
    if(
       (utils.isEmptyValue(value) != utils.isEmptyValue(this.getValue())) ||
       (String(value) != String(this.getValue()))
      ) {
        utils.setElementAttributeValue(this.node, 'property', 'value', value)           
        this.updateFormattedValue();
        return true;
    } else {
        return false;
    }
}

DeviceNode.prototype.simulateExecuteCommand = function(command, value) {
    if(this.isSecureDevice() && command != 'SECMD') {
        throw new Error('Specified device: '+this.getName()+' is a secure device. Must use a secure command');
    }      
    
    // On
    if(command == 'DON') {
        if(utils.isEmptyValue(value)) {
            return this.setValue(255);
        } else if(!this.isDimmable()) {
            throw new Error('Specified device: '+this.getName()+' is not dimmable cannot specify dim value');
        } else {
            var valueAsNumber = Number(value);
            if(valueAsNumber < 0 || valueAsNumber > 255) {
                throw new Error('Invalid value specified. Outside of normal range. Value spcified='+valueAsNumber);
            } else {
                return this.setValue(value);
            }
        }
    // Fast On        
    } else if(command == 'DFON') {
        if(!utils.isEmptyValue(value)) {
            throw new Error('DFON (Fast On) command does not take a parameter');
        }
        return this.setValue(255);
    // Off
    } else if(command == 'DOF') {
        if(!utils.isEmptyValue(value)) {
            throw new Error('DOF (Off) command does not take a parameter');
        }
        return this.setValue(0);
    // Fast Off
    } else if(command == 'DFOF') {
        if(!utils.isEmptyValue(value)) {
            throw new Error('DFOF (Fast Off) command does not take a parameter');
        }
        return this.setValue(0);
    } else if(command == 'BEEP') {
        if(!utils.isEmptyValue(value)) {
            throw new Error('BEEP command does not take a parameter');
        }
        return true;
        // Beep would yah!
    } else if(command == 'SECMD') {
        if(this.isSecureDevice()) {
            if(utils.isEmptyValue(value)) {
                throw new Error('Must specify a value when executing a secure command');
            }
            return this.simulateExecuteSecureCommand(command, value);
        } else {
            throw new Error('Cannot execute secure commad on device');
        }
    } else {
        throw new Error('Un-recognized command on device:'+this.getName()+' command: '+command+' value: '+value);
    }
}

DeviceNode.prototype.simulateExecuteSecureCommand = function(command, value) {
    if(!this.isSecureDevice()) {
        throw new Error('Specified device: '+this.getName()+' is not a secure device');
    }
    var valueAsNumber = Number(value);
    if(valueAsNumber == 0) {
        return this.setValue(0);        
    } else if(valueAsNumber == 1) {
        return this.setValue(100);
    } else {
        throw new Error('Only secure commands with values 0 and 1 are supported');        
    }
}

DeviceNode.prototype.isSecureDevice = function() {
    return utils.stringStartsWith(this.getType(),'4.64');    
}

DeviceNode.prototype.isDimmable = function() {
    // Fans take dim commands so either fan or dimmable light    
    return(
        utils.stringStartsWith(this.getPotentialValues(),'%') ||
        this.getPotentialValues() == 'off/low/med/high');
}

DeviceNode.prototype.updateFormattedValue = function() {
    var potentialValues = this.getPotentialValues();
    var currentValueAsString = this.getValue();
    
    // Shortcut for unknown statuses
    if(currentValueAsString == ' ' || currentValueAsString == '') {
        this.setValueFormatted(' ');
        return;
    }
    
    var currentValue = Number(currentValueAsString);
    
    // Dimmable Switches
    if(potentialValues == '%/on/off') {
        if(currentValue == 0) {
            this.setValueFormatted('Off');            
        } else if(currentValue == 255) {
            this.setValueFormatted('On');
        } else if(currentValue > 0 && currentValue < 255) {
            this.setValueFormatted((100*currentValue)/255);
        } else {
            throw new Error('Invalid value specified for node: '+this.getName()+' value: '+currentValue);
        }
    // ZWave Door Lock
    } else if(potentialValues == '11') {
        if(currentValue == 0) {
            this.setValueFormatted('Unlocked');
        } else if(currentValue == 100) {
            this.setValueFormatted('Locked');
        } else {
            throw new Error('Invalid status for a door device: '+this.getName()+' value: '+currentValue);
        }
    // Ceiling fans
    } else if(potentialValues == 'off/low/med/high') {
        if(currentValue == 0) {
            this.setValueFormatted('off');
        } else if(currentValue == 63) {
            this.setValueFormatted('low');
        } else if(currentValue == 191) {
            this.setValueFormatted('med');
        } else if(currentValue == 255) {
            this.setValueFormatted('high');
        } else {
            throw new Error('Invalid status for fan device: '+this.getName()+' value: '+currentValue);
        }
    // On/Off only and this is a light
    } else if(potentialValues == 'on/off') {
        if(utils.stringStartsWith(this.getType(),'15')) {
            if(currentValue == 0) {
                this.setValueFormatted('unlocked');
            } else if(currentValue == 255) {
                this.setValueFormatted('locked');
            } else {
                throw new Error('Invalid status for a morninglinc lock device: '+this.getName()+' value:'+currentValue);
            }
        } else {
            if(currentValue == 0) {
                this.setValueFormatted('Off');
            } else if(currentValue == 255) {
                this.setValueFormatted('On');
            } else {
                throw new Error('Invalid status for an on/off device: '+this.getName()+' value:'+currentValue);                
            }
        }
    } else {
        throw new Error('Unknown device type, cannot set friendly status: '+this.getName()+' type: '+this.getType()+' value: '+currentValue);
    }
}

DeviceNode.prototype.getValueFormatted = function() {
    return utils.getElementAttributeValue(this.node, 'property', 'formatted');
}

DeviceNode.prototype.setValueFormatted = function(value) {
    utils.setElementAttributeValue(this.node, 'property', 'formatted',value);
}

DeviceNode.prototype.getPotentialValues = function() {
    return utils.getElementAttributeValue(this.node, 'property', 'uom');
}

DeviceNode.prototype.getStatusNode = function(doc) {
    var statusNode = doc.createElement('node');
    statusNode.setAttribute('id', this.getAddress());
    if(this.node.getElementsByTagName('property').length > 0) {
        var propertyNode = doc.createElement('property');
        propertyNode.setAttribute('id', 'ST');
        propertyNode.setAttribute('value', this.getValue());
        propertyNode.setAttribute('formatted', this.getValueFormatted());
        propertyNode.setAttribute('uom', this.getPotentialValues());
        statusNode.appendChild(propertyNode);
    }
    doc.createAttribute('id', this.getAddress());
    return statusNode;
}

exports.DeviceNode = DeviceNode;