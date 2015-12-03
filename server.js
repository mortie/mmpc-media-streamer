var atob = require("atob");
var fs = require("fs");
var status = require("statuses");
var formidable = require("formidable");
var wrench = require("wrench");
var express = require("express");

var util = require("./js/util");
var HttpStreamer = require("./js/http-streamer");
var PortManager = require("./js/port-manager");
var torrentPlayer = require("./js/torrent-player");

var conf = JSON.parse(fs.readFileSync("conf.json", "utf8"));

//Create tmp/ if necessary, and clear it if it's not already empty
try {
	fs.mkdirSync("tmp");
} catch (err) {
	if (err && err.code !== "EEXIST")
		throw err;
}
fs.readdirSync("tmp").forEach(function(file) {
	fs.unlinkSync("tmp/"+file);
});

var portManager = new PortManager(conf.port);

//Initialize web app
express.static("web");
var app = express();

//Init static resources
[
	["/", "/index.html"],
	"/style.css",
	"/script.js"
].forEach(function(ep) {
	var path;
	var file;
	if (typeof ep == "string") {
		path = ep;
		file = ep;
	} else {
		path = ep[0];
		file = ep[1];
	}

	//Cache static resources in RAM
	fs.readFile("web"+file, function(err, str) {
		if (err) throw err;

		app.get(path, function(req, res) {
			if (err)
				res.end(err.code+": "+path);
			else
				res.end(str);
		});
	});
});

//Magnet link endpoint
app.post("/view/magnet/:href", function(req, res) {
	var source = decodeURIComponent(req.params.href);
	torrentPlayer.play(source, res, portManager, conf);
});

//Torrent file endpoint
app.post("/view/torrent", function(req, res) {
	var form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files) {
		if (err)
			return res.json({error: err.toString()});

		fs.readFile(files.file.path, function(err, body) {
			if (err)
				return res.json({error: err.toString()});

			torrentPlayer.play(body, res, portManager, conf);
		});
	});
});

var port = portManager.getPort();
app.listen(port.val);
console.log("Listening to port "+port.val+".");
