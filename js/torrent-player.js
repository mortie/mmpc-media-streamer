var torrentStream = require("torrent-stream");
var pathlib = require("path");
var temp = require("temp");
var fs = require("fs");

var util = require("./util");
var HttpStreamer = require("./http-streamer");
var MediaPlayer = require("./media-player");

exports.play = play;

var extensions = {
	media: "mp4|mkv|avi|ogv",
	subtitles: "srt"
};
regexes = {
	media: new RegExp("("+extensions.media+")$", "i"),
	subtitles: new RegExp("("+extensions.subtitles+")$", "i")
};

function play(source, res, portManager, conf) {
	var engine;
	try {
		engine = torrentStream(source);
	} catch (e) {
		return res.end({error: "Bad torrent: "+e.toString()});
	}

	util.notify("Preparing Media...");

	engine.on("ready", function() {
		util.notify(
			"Playing Media",
			engine.torrent.name
		);

		var media = new MediaTorrent(engine);
		var playerPort = media.play(portManager, conf);
		setTimeout(function() {
			res.json({redirect: "http://"+conf.host+":"+playerPort.val});
		}, 2000);
	});
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
	if (this.file && this.path) {
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
	this.subtitles.makeFile();
}
MediaTorrent.prototype.play = function(portManager, conf) {
	if (!this.media) {
		util.notify(
			"Could not play media.",
			"Torrent doesn't contain a media file."
		);
		this.cleanup();
		return;
	}

	var streamer = new HttpStreamer(portManager.getPort(), {
		name: this.media.file.name,
		length: this.media.file.length,
		createReadStream: function(options) {
			return this.media.file.createReadStream(options);
		}.bind(this)
	});
	this.player = new MediaPlayer(
		"http://localhost:"+streamer.port.val,
		"",
		portManager.getPort(),
		conf
	);

	this.player.onexit = function() {
		streamer.free();
		this.media.cleanup();
		this.subtitles.cleanup();
		this.engine.destroy();
	}.bind(this);

	return this.player.port;
}
