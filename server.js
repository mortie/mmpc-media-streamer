var atob = require("atob");
var fs = require("fs");
var crypto = require("crypto");
var exec = require("child_process").spawn;
var status = require("statuses");
var temp = require("temp");
var http = require("http");
var https = require("https");
var urllib = require("url");
var pathlib = require("path");
var formidable = require("formidable");
var wrench = require("wrench");
var express = require("express");
var torrentStream = require("torrent-stream");

var extensions = {
	media: "mp4|mkv|avi|ogv",
	subtitles: "srt"
};
var regexes = {
	media: new RegExp("("+extensions.media+")$", "i"),
	subtitles: new RegExp("("+extensions.subtitles+")$", "i")
};

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

var mimeTypes = {
	".mp4": "video/mp4",
	".mkv": "video/mkv",
	".avi": "video/avi",
	".ogv": "video/ogv"
};
function mimeType(name) {
	return mimeTypes[pathlib.extname(name)];
}

var portManager = {
	startPort: conf.port,
	usedPorts: {},

	getPort: function() {
		var self = this;

		var port = self.startPort;
		while (self.usedPorts[port]) { port += 1; }
		self.usedPorts[port] = true;

		return {
			val: port,
			free: function() {
				self.usedPorts[port] = false;
			}
		}
	}
}

function HttpStreamer(torrentFile) {
	this.port = portManager.getPort();

	//Serve HTTP streaming things
	this.server = http.createServer(function(req, res) {
		var range = req.headers.range;
		var parts = range.replace("bytes=", "").split("-");
		var total = torrentFile.file.length;

		var start = parseInt(parts[0]);
		var end;
		if (parts[1])
			end = parseInt(parts[1]);
		else
			end = total - 1;
		var chunksize = (end - start) + 1;

		res.writeHead(206, {
			"Content-Range": "bytes " + start + "-" + end + "/" + total,
			"Accept-Ranges": "bytes",
			"Content-Length": chunksize,
			"Content-Type": mimeType(torrentFile.file.name),
			"Icy-Name": torrentFile.file.name
		});

		var stream = torrentFile.file.createReadStream({start: start, end: end});
		stream.pipe(res);
	});
	this.server.listen(this.port.val);
}
HttpStreamer.prototype.free = function() {
	this.port.free();
	this.server.close();
}

function TorrentFile(file) {
	if (file) {
		this.extension = pathlib.extname(file.name);
		this.file = file;
		this.readStream = file.createReadStream();
	}
}
TorrentFile.prototype.makeFile = function() {
	this.path = temp.path({dir: "tmp", suffix: this.extension});
	if (this.file) {
		this.writeStream = fs.createWriteStream(this.path);
		this.readStream.pipe(this.writeStream);
	}
}
TorrentFile.prototype.cleanup = function() {
	if (this.file) {
		fs.unlink(this.path);
	}
}

function MediaTorrent(engine) {
	this.engine = engine;
	this.files = engine.files;

	var media = undefined;
	var subtitles = undefined;
	this.files.forEach(function(file) {
		if (regexes.media.test(file.name))
			media = file;
		else if (regexes.subtitles.test(file.name))
			subtitles = file;
		else
			file.deselect();
	}.bind(this));

	this.media = new TorrentFile(media);
	this.subtitles = new TorrentFile(subtitles);
}
MediaTorrent.prototype.play = function() {
	if (!this.media) {
		notify(
			"Could not play media.",
			"Torrent doesn't contain a media file."
		);
		this.cleanup();
		return;
	}

	//Start HTTP stream server
	var streamer = new HttpStreamer(this.media);

	console.log("Stream server started on port "+streamer.port.val);

	var playerPort = portManager.getPort();

	//Run player
	var child = exec(conf.player_command, [
		"--fullscreen",
		"--play-and-exit",
		"-I", "http",
		"--http-password", conf.player_password,
		"--http-port", playerPort.val,
		"--",
		"http://localhost:"+streamer.port.val,
		"vlc://quit"
	]);

	console.log("player GUI on port "+playerPort.val);

	//Log player output to console
	child.stdout.on("data", function(data) {
		console.log("player: "+data.toString().trim());
	});
	child.stderr.on("data", function(data) {
		console.log("player: error: "+data.toString().trim());
	});

	//Clean up when the player exits
	child.on("exit", function() {
		streamer.free();
		playerPort.free();
		this.cleanup();
	}.bind(this));

	return playerPort;
}
MediaTorrent.prototype.cleanup = function() {
	console.log("Cleaning up '"+this.engine.torrent.name+"'...");
	this.media.cleanup();
	this.subtitles.cleanup();
	this.engine.destroy();
}

//Simple HTTP GET requests
function request(url) {
	return new Promise(function(resolve, reject) {
		var options = urllib.parse(url);

		var obj;
		if (options.protocol === "http:")
			obj = http;
		else if (options.protocol === "https:")
			obj = https;

		var req = obj.request(options, function(res) {
			var str = "";
			res.on("data", function(data) {
				str += data;
			});
			res.on("end", function() {
				resolve(str);
			});
		});

		req.on("error", function(err) {
			reject(err);
		});
	});
}

//Notification utility
function notify(title, msg) {
	var args;
	if (msg) {
		args = [
			"--",
			title,
			msg
		];
	} else {
		args = [
			"--",
			title
		];
	}

	exec("notify-send", args);
	console.log("Notification: "+title+(msg ? ": "+msg : ""));
}

//Sha utility
function sha1(str) {
	shasum = crypto.createHash("sha1");
	shasum.update(str);
	return shasum.digest("hex");
}

//Take torrent source (magnet link or buffer), and play it
function playTorrent(source, res) {
	var engine;
	try {
		engine = torrentStream(source);
	} catch (e) {
		return res.end({error: "Bad torrent: "+e.toString()});
	}

	notify("Preparing Media...");

	engine.on("ready", function() {
		notify(
			"Playing Media",
			engine.torrent.name
		);

		var media = new MediaTorrent(engine);
		var playerPort = media.play();
		setTimeout(function() {
			res.json({redirect: "http://"+conf.host+":"+playerPort.val});
		}, 2000);
	});
}

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
	playTorrent(source, res);
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

			var player = playTorrent(body, res);
		});
	});
});

var port = portManager.getPort();
app.listen(port.val);
console.log("Listening to port "+port.val+".");
