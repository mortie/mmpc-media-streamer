var pathlib = require("path");
var urllib = require("url");
var http = require("http");
var https = require("https");
var crypto = require("crypto");
var spawn = require("child_process").spawn;
var colors = require("colors");

exports.mimeType = mimeType;
exports.request = request;
exports.notify = notify;
exports.sha1 = sha1;

function mimeType(name) {
	return mimeType.types[pathlib.extname(name)];
}
mimeType.types = {
	".mp4": "video/mp4",
	".mkv": "video/mkv",
	".avi": "video/avi",
	".ogv": "video/ogv"
};

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

	spawn("notify-send", args);
	console.log(("Notification: "+title+(msg ? ": "+msg : "")).info)
}

function sha1(str) {
	shasum = crypto.createHash("sha1");
	shasum.update(str);
	return shasum.digest("hex");
}
