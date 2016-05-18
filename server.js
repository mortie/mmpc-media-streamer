var spawn = require("child_process").spawn;
var urllib = require("url");
var fs = require("fs");
var Server = require("./kattie");

var conf = JSON.parse(fs.readFileSync("conf.json"));

var server = Server({ port: conf.port, streamPort: conf.stream_port });

server.onstream = function(name, req, res) {
	var from = urllib.parse(req.headers.referer);

	var url = "http://localhost:"+conf.stream_port;
	spawn("notify-send", ["Playing "+name]);

	var child = spawn(conf.player_command, [
		"--fullscreen",
		"--play-and-exit",
		"-I", "http",
		"--http-port", conf.player_port,
		"--http-password", "media",
		"--",
		url
	]);

	child.stdout.pipe(process.stdout);
	child.stderr.pipe(process.stderr);

	setTimeout(() => {
		res.writeHead(302, {
			location: "http://"+from.hostname+":8082"
		});
		res.end();
	}, 1000);
}
