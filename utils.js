var xmldom = require('xmldom');

function getElementValue(node, childName) {
    return node.getElementsByTagName(childName)[0].textContent;
}

function setElementValue(node, childName, childValue) {
    node.getElementsByTagName(childName)[0].textContent = childValue;
}

function getElementAttributeValue(node, childName, attributeName) {
    return node.getElementsByTagName(childName)[0].getAttribute(attributeName);
}

function setElementAttributeValue(node, childName, attributeName, attributeValue) {
    node.getElementsByTagName(childName)[0].setAttribute(attributeName, attributeValue);
}

function stringStartsWith(string, prefix) {
    return string.slice(0, prefix.length) == prefix;    
}

function isEmptyValue(value) {
    return(value == undefined || value == null || value == ' ' || value == '');
}

exports.getElementValue = getElementValue;
exports.setElementValue = setElementValue;
exports.getElementAttributeValue = getElementAttributeValue;
exports.setElementAttributeValue = setElementAttributeValue;
exports.stringStartsWith = stringStartsWith;
exports.isEmptyValue = isEmptyValue;