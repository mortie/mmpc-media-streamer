var spawn = require("child_process").spawn;
var urllib = require("url");
var http = require("http");
var fs = require("fs");
var pathlib = require("path");
var OpenSubs = require("opensubtitles-api");
var ProxyServer = require("./js/kickass-proxy");
var heapdump = require("heapdump");

var conf = JSON.parse(fs.readFileSync("conf.json"));

var server = ProxyServer({ port: conf.port, streamPort: conf.stream_port });
var subs = new OpenSubs({ useragent: "mmpc-media-streamer" });

var isApp = process.argv[2] === "app";
if (isApp)
	console.log("Running in app mode.");

function cleanup() {
	function rmdir(path) {
		fs.readdirSync(path).forEach(file => {
			var p = pathlib.join(path, file);
			var stat = fs.statSync(p);
			if (stat.isDirectory()) {
				rmdir(p);
			} else {
				fs.unlinkSync(p);
			}
		});
		fs.rmdirSync(path);
	}

	try {
		fs.unlinkSync("subs.srt");
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
	}
	try {
		rmdir("tmp");
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
	}
}

cleanup();

function findSubs(media, cb) {
	if (!conf.subtitles)
		return cb();

	subs.search({
		sublanguageid: conf.subs_lang,
		filesize: media.length,
		filename: media.name,
	}).then((subtitles) => {
		var subs = subtitles[conf.subs_lang];
		if (!subs || !subs.url)
			return cb();

		// Download subtitle file
		var subsFile = "subs.srt";
		var writeStream = fs.createWriteStream(subsFile);
		http.request(urllib.parse(subs.url), (res) => {
			res
				.on("data", d => writeStream.write(d))
				.on("end", () => {
					writeStream.close();
					cb(subsFile);
				})
				.on("error", err => console.trace(err));
		}).end();
	}).catch(console.trace.bind(console));
}

var vlcProcess;
server.onstream = function(media, req, res) {
	if (!media)
		return;
	if (vlcProcess)
		vlcProcess.kill();

	var from = urllib.parse(req.headers.referer);

	var url = "http://localhost:"+conf.stream_port;
	spawn("notify-send", ["Playing "+media.name]);

	findSubs(media, (subsFile) => {
		var options = [
			"--fullscreen",
			"--play-and-exit",
		];

		// Enable only qt interface if app mode, otherwise
		// enable both http and qt interface
		if (isApp) {
			options = options.concat([
				"-I", "qt"
			]);
		} else {
			options = options.concat([
				"-I", "http",
				"--extraintf", "qt",
				"--http-port", conf.player_port,
				"--http-password", conf.player_password
			]);
		}

		// Add the subs file if it exists
		if (subsFile) {
			options = options.concat([
				"--sub-file", subsFile
			]);
		}

		// Add the URL to be played, and vlc://quit to automatically quit
		// vlc once it's done playing
		options = options.concat([
			"--",
			url, "vlc://quit"
		]);

		vlcProcess = spawn(conf.player_command, options);

		vlcProcess.stdout.pipe(process.stdout);
		vlcProcess.stderr.pipe(process.stderr);

		// Redirect to where you came from if app mode,
		// otherwise redirect to the http interface
		if (isApp) {
			res.writeHead(302, { location: req.referer || "/" });
			res.end();
		} else {
			setTimeout(() => {
				res.writeHead(302, {
					location: "http://"+from.hostname+":"+conf.player_port
				});
				res.end();
			}, 1000);
		}

		// Heapdump
		setTimeout(() => {
			heapdump.writeSnapshot(Date.now()+".heapsnapshot");
			console.log("snapshot written.");
		}, 400000);
	});
}

// Spawn a chrome/chromium window in app mode
if (isApp) {
	var chromeCommands = [
		"google-chrome", "google-chrome-stable",
		"chromium", "chromium-browser"
	];
	var chromeProcess;
	for (var i in chromeCommands) {
		var cmd = chromeCommands[i];

		chromeProcess = spawn(cmd, [
			"--app=http://localhost:"+conf.port
		]);
		chromeProcess.on("error", err => {
			if (err.code !== "ENOENT") console.trace(err)
		});

		if (chromeProcess.pid)
			break;
	}

	chromeProcess.on("exit", () => {
		cleanup();
		process.exit();
	});
}
