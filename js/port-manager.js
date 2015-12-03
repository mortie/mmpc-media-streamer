module.exports = PortManager;

function Port(val, manager) {
	this.val = val;
	this.manager = manager;
}
Port.prototype.free = function() {
	this.manager.usedPorts[this.val] = false;
}

function PortManager(startPort) {
	this.startPort = startPort;
	this.usedPorts = {};
}
PortManager.prototype.getPort = function() {
	var val = this.startPort;
	while (this.usedPorts[val]) { val += 1; }

	this.usedPorts[val] = true;
	return new Port(val, this);
}
