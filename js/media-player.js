var exec = require("child_process").spawn;
var colors = require("colors");

module.exports = MediaPlayer;

function MediaPlayer(mediaUrl, subtitlesPath, port, conf) {
	this.port = port;

	//Run player
	var child = exec(conf.player_command, [
		"--fullscreen",
		"--play-and-exit",
		"-I", "http",
		"--http-password", conf.player_password,
		"--http-port", this.port.val,
		"--sub-file", subtitlesPath,
		"--",
		mediaUrl,
		"vlc://quit"
	]);

	console.log(("player GUI on port "+this.port.val).ok);

	//Log player output to console
	child.stdout.on("data", function(data) {
		console.log("player(stdout): ".green+data.toString().trim().info);
	});
	child.stderr.on("data", function(data) {
		console.log("player(stderr): ".red+data.toString().trim().info);
	});

	//Clean up when the player exits
	child.on("exit", function() {
		this.port.free();
		if (this.onexit)
			this.onexit();
	}.bind(this));
}
