var http = require("http");
var pathlib = require("path");
var torrentStream = require("torrent-stream");

module.exports = Streamer;

function mimeType(name) {
	var ext = pathlib.extname(name).substring(1);
	switch (ext) {
	case "mp4":
	case "mkv":
	case "avi":
	case "ogv":
		return "video/"+ext;
	}
}

function Streamer(port) {
	var self = {};

	var engine = null;
	var media = null;
	var mediaRx = /\.(mp4|mkv|avi|ogv)$/;
	var uploaded = 0;
	var interval;

	self.stream = function(magnet, cb) {
		if (engine)
			engine.destroy();

		media = null;
		uploaded = 0;
		clearInterval(interval);
		engine = torrentStream(magnet);

		engine.on("ready", () => {
			engine.files.forEach(file => {
				if ((!media || file.length > media.length) && mediaRx.test(file.name))
					media = file;
			});

			if (media) {
				media.select();

				// We need a way for the consumer to destroy the torrenting
				// engine
				media.destroy = function() {
					engine.destroy();
					engine = null;
				}
			}

			cb(media);
		});
	}

	http.createServer((req, res) => {
		if (!media) {
			res.end("No media playing!\n");
			return;
		}

		var range = req.headers.range;
		var contentRange;
		var chunksize;
		var start;
		var end;
		if (range) {
			var parts = range.replace("bytes=", "").split("-");

			start = parseInt(parts[0]);
			end;
			if (parts[1])
				end = parseInt(parts[1]);
			else
				end = media.length - 1;
		} else {
			start = 0;
			end = media.length - 1;
		}

		contentRange = "bytes " + start + "-" + end + "/" + media.length;
		chunksize = (end - start) + 1;

		var statusCode = (range ? 206 : 200);
		res.writeHead(statusCode, {
			"Content-Range": contentRange,
			"Accept-Ranges": "bytes",
			"Content-Length": chunksize,
			"Content-Type": mimeType(media.name),
			"Icy-Name": media.name
		});

		// Don't bother actually sending anything if it's a HEAD request
		if (req.method === "HEAD") {
			res.end();
			return;
		}

		var stream = media.createReadStream({start: start, end: end});
		stream
			.on("data", d => res.write(d))
			.on("end", () => res.end())
			.on("error", err => console.trace(err));
	}).listen(port);

	return self;
}
