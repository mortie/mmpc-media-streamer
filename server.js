var spawn = require("child_process").spawn;
var urllib = require("url");
var http = require("http");
var fs = require("fs");
var OpenSubs = require("opensubtitles-api");
var ProxyServer = require("./js/kickass-proxy");

var conf = JSON.parse(fs.readFileSync("conf.json"));

var server = ProxyServer({ port: conf.port, streamPort: conf.stream_port });
var subs = new OpenSubs({ useragent: "OSTestUserAgent" });

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
	if (vlcProcess)
		vlcProcess.kill();

	var from = urllib.parse(req.headers.referer);

	var url = "http://localhost:"+conf.stream_port;
	spawn("notify-send", ["Playing "+media.name]);

	findSubs(media, (subsFile) => {
		var options = [
			"--fullscreen",
			"--play-and-exit",
			"-I", "http",
			"--extraintf", "qt",
			"--http-port", conf.player_port,
			"--http-password", "media"
		];
		if (subsFile) {
			options.push("--sub-file");
			options.push(subsFile);
		}
		options.push("--");
		options.push(url);
		options.push("vlc://quit");

		vlcProcess = spawn(conf.player_command, options);

		vlcProcess.stdout.pipe(process.stdout);
		vlcProcess.stderr.pipe(process.stderr);

		setTimeout(() => {
			res.writeHead(302, {
				location: "http://"+from.hostname+":"+conf.player_port
			});
			res.end();
		}, 1000);
	});
}
