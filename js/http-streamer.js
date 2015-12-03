var http = require("http");
var https = require("https");

var util = require("./util");

module.exports = HttpStreamer;

function HttpStreamer(port, file) {
	this.port = port;

	//Serve HTTP streaming things
	this.server = http.createServer(function(req, res) {
		var range = req.headers.range;
		var parts = range.replace("bytes=", "").split("-");

		var start = parseInt(parts[0]);
		var end;
		if (parts[1])
			end = parseInt(parts[1]);
		else
			end = file.length - 1;
		var chunksize = (end - start) + 1;

		res.writeHead(206, {
			"Content-Range": "bytes " + start + "-" + end + "/" + file.length,
			"Accept-Ranges": "bytes",
			"Content-Length": chunksize,
			"Content-Type": util.mimeType(file.name),
			"Icy-Name": file.name
		});

		var stream = file.createReadStream({start: start, end: end});
		stream.pipe(res);
	});
	this.server.listen(port.val);
}
HttpStreamer.prototype.free = function() {
	this.server.close();
	this.port.free();
}
