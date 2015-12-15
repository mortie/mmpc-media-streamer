var torrentStream = require("torrent-stream");
var pathlib = require("path");
var temp = require("temp");
var fs = require("fs");
var crypto = require("crypto");
var wrench = require("wrench");
var os = require("os");

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

function play(source, res, subtitlesPath, portManager, conf) {
	var id = crypto.randomBytes(16).toString("hex");
	var engine;
	try {
		engine = torrentStream(source, {
			name: "mmpc-"+id
		});
	} catch (e) {
		return res.end({error: "Bad torrent: "+e.toString()});
	}

	util.notify("Preparing Media...");

	engine.on("ready", function() {
		util.notify(
			"Playing Media",
			engine.torrent.name
		);

		var media = new MediaTorrent(engine, subtitlesPath, id);
		var playerPort = media.play(portManager, conf);
		if (playerPort) {
			setTimeout(function() {
				res.json({redirect: "http://"+conf.host+":"+playerPort.val});
			}, 2000);
		} else {
			res.end();
		}
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
};
TorrentFile.prototype.cleanup = function() {
	if (this.file && this.path) {
		fs.unlink(this.path);
	}
};

function MediaTorrent(engine, subtitlesPath, id) {
	this.engine = engine;
	this.files = engine.files;
	this.id = id;

	var media = [];
	var tSubtitles;
	this.files.forEach(function(file) {
		if (regexes.media.test(file.name))
			media.push(new TorrentFile(file));
		else if (regexes.subtitles.test(file.name))
			tSubtitles = file;
		else
			file.deselect();
	}.bind(this));

	this.media = media;

	if (subtitlesPath) {
		this.subtitles = {path: subtitlesPath};
	} else if (tSubtitles) {
		this.subtitles = new TorrentFile(tSubtitles);
		this.subtitles.makeFile();
	} else {
		this.subtitles = "";
	}
}
MediaTorrent.prototype.play = function(portManager, conf) {
	if (!this.media) {
		util.notify(
			"Could not play media.",
			"Torrent doesn't contain a media file."
		);
		return;
	}

	var streamers = [];
	var urls = [];

	this.media.forEach(function(torrentFile) {
		var streamer = new HttpStreamer(portManager.getPort(), {
			name: torrentFile.file.name,
			length: torrentFile.file.length,
			createReadStream: function(options) {
				return torrentFile.file.createReadStream(options);
			}.bind(this)
		});
		streamers.push(streamer);
		urls.push("http://localhost:"+streamer.port.val);
	});
	this.player = new MediaPlayer(
		urls,
		this.subtitles.path,
		portManager.getPort(),
		conf
	);

	this.player.onexit = function() {
		streamers.forEach(function(streamer) {
			streamer.free();
		});
		this.media.forEach(function(f) {
			f.cleanup();
		});
		if (this.subtitles.cleanup) {
			this.subtitles.cleanup();
		}
		this.engine.destroy();

		//Clean up temp files
		wrench.rmdirSyncRecursive(os.tmpdir()+"/mmpc-"+this.id);
	}.bind(this);

	return this.player.port;
};
