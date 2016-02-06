var xmldom = require('xmldom');

var Variable = function(id, name, type) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.value = '0';
    this.ts = new Date();
}

Variable.prototype.setValue = function(value) {
    this.value = value;
    this.ts = new Date();
}

Variable.prototype.getValue = function() {
    return this.value;
}

Variable.prototype.getId = function() {
    return this.id;
}


Variable.prototype.getType = function() {
    return this.type;
}

Variable.prototype.getTs = function() {
    return this.ts;
}

Variable.prototype.getName = function() {
    return this.name;
}

Variable.prototype.getStateXml = function(doc) {
    var varNode = doc.createElement('var');
    varNode.setAttribute('type', this.getType());
    varNode.setAttribute('id', this.getId());

    var initNode = doc.createElement('init');
    initNode.appendChild(doc.createTextNode(this.getValue()));
    varNode.appendChild(initNode);

    var valNode = doc.createElement('val');
    valNode.appendChild(doc.createTextNode(this.getValue()));
    varNode.appendChild(valNode);

    var tsNode = doc.createElement('ts');
    tsNode.appendChild(doc.createTextNode(this.getTs().toString()));
    varNode.appendChild(tsNode);

    return varNode;
}

exports.Variable = Variable;