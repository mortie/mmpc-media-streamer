var https = require("https");
var http = require("http");
var fs = require("fs");
var zlib = require("zlib");
var Streamer = require("./streamer");

module.exports = Server;

var inject = fs.readFileSync(__dirname+"/inject.html");

function deflate(buf, enc) {
	if (enc === "none" ) {
		return buf.toString();
	} else if (enc === "gzip") {
		try {
			return zlib.gunzipSync(buf).toString();
		} catch (err) {
			console.trace(err);
			return err.toString();
		}
	}
}

function readRes(res, cb) {

	var buf = Buffer.alloc(0);
	res
		.on("data", d => buf = Buffer.concat([buf, d]))
		.on("end", () => cb(null, buf))
		.on("error", err => cb(err));
}

var staticCache = {};
function proxyStatic(inreq, inres) {
	if (staticCache[inreq.url]) {
		console.log("reading "+inreq.url+" from cache");
		return inres.end(staticCache[inreq.url]);
	}

	var agent = new https.Agent({
		host: "kastatic.com",
		port: "443",
		path: inreq.url,
		rejectUnauthorized: false
	});

	delete inreq.headers.host;
	delete inreq.headers.referer;
	var options = {
		method: "GET",
		host: "kastatic.com",
		port: "443",
		path: inreq.url,
		agent: agent
	};

	var outreq = https.request(options, outres => {
		delete outres.headers["content-length"];
		inres.writeHead(outres.statusCode, outres.headers);
		var isCss = outres.headers["content-type"] === "text/css";

		var cacheBuf;
		if (isCss)
			cacheBuf = "";
		else
			cacheBuf = Buffer.alloc(0);

		readRes(outres, (err, buf) => {
			if (err)
				return res.end(err.toString());

			if (isCss) {
				buf = buf
					.toString()
					.replace(/\/\/kastatic\.com/g, "/_kastatic");
			}
			inres.end(buf);
			staticCache[inreq.url] = buf;
		});
	});
	outreq.on("error", err => console.trace(err));
	outreq.end();
}

function proxy(inreq, inres) {
	var agent = new https.Agent({
		host: "kat.cr",
		port: "443",
		path: inreq.url,
		rejectUnauthorized: false
	});

	inreq.headers.host = "kat.cr";
	delete inreq.headers["accept-encoding"];
	var options = {
		method: "GET",
		host: "kat.cr",
		path: inreq.url,
		headers: inreq.headers,
		agent: agent
	};

	var outreq = https.request(options, outres => {
		var statusCode = outres.statusCode;
		if (statusCode === 301)
			statusCode = 302; // Don't want to accidentally 301
		var enc = outres.headers["content-encoding"] || "none";
		delete outres.headers["content-length"];
		delete outres.headers["content-encoding"];

		inres.writeHead(statusCode, outres.headers);
		readRes(outres, (err, buf) => {
			if (err)
				return res.end(err.toString());

			buf = deflate(buf, enc.toLowerCase())
				.replace(/\/\/kastatic\.com/g, "/_kastatic");
			buf += inject;
			inres.end(buf);
		});
	});
	outreq.on("error", err => console.trace(err));
	outreq.end();
}

function Server(conf) {
	var self = {};

	var streamer = Streamer(conf.streamPort);

	http.createServer(function(req, res) {
		if (req.url.indexOf("/_kastatic") === 0) {
			req.url = req.url.substring("/_kastatic".length);
			proxyStatic(req, res);
		} else if (req.url.indexOf("/_stream") === 0) {
			streamer.stream(req.url.substring("/_stream/".length), (media) => {
				self.onstream(media, req, res);
			});
		} else {
			proxy(req, res);
		}
	}).listen(conf.port);

	return self;
}
