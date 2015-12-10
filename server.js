var atob = require("atob");
var fs = require("fs");
var status = require("statuses");
var formidable = require("formidable");
var wrench = require("wrench");
var express = require("express");
var colors = require("colors");

var util = require("./js/util");
var HttpStreamer = require("./js/http-streamer");
var PortManager = require("./js/port-manager");
var MediaPlayer = require("./js/media-player");
var torrentPlayer = require("./js/torrent-player");

colors.setTheme({
	info: "grey",
	error: "red",
	ok: "green"
});

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
var app = express();
app.use(express.static("web"));

//Helper for form data parsing
function parseFormData(req, res, cb) {
	var form = new formidable.IncomingForm();
	form.parse(req, function(err, fields, files) {
		if (err)
			return res.json({error: err.toString()});

		var rFiles = {};
		for (var i in files) {
			rFiles[i] = new parseFormData.File(files[i]);
		}

		if (!rFiles.subs)
			rFiles.subs = {};

		cb(fields, rFiles);
	});
}
parseFormData.File = function(options) {
	this.path = options.path;
};
parseFormData.File.prototype.read = function(cb, charset) {
	fs.readFile(this.path, charset, cb);
};

//Magnet link endpoint
app.post("/view/magnet/:href", function(req, res) {
	parseFormData(req, res, function(fields, files) {
		var source = decodeURIComponent(req.params.href);
		torrentPlayer.play(source, res, files.subs.path, portManager, conf);
	});
});

//URL endpoint
app.post("/view/url/:href", function(req, res) {
	parseFormData(req, res, function(fields, files) {
		var url = decodeURIComponent(req.params.href);
		var player = new MediaPlayer(url, files.subs.path, portManager.getPort(), conf);
		setTimeout(function() {
			res.json({redirect: "http://"+conf.host+":"+player.port.val});
		}, 2000);
	});
});

//Torrent file endpoint
app.post("/view/torrent", function(req, res) {
	parseFormData(req, res, function(fields, files) {
		files.file.read(function(err, body) {
			if (err)
				return res.json({error: err.toString()});

			torrentPlayer.play(body, res, files.subs.path, portManager, conf);
		});
	});
});

var port = portManager.getPort();
app.listen(port.val);
console.log(("Listening to port "+port.val+".").ok);
