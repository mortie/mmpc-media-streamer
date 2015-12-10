var spawn = require("child_process").spawn;
var colors = require("colors");

module.exports = MediaPlayer;

function MediaPlayer(mediaUrls, subtitlesPath, port, conf) {
	this.port = port;

	if (typeof mediaUrls === "string")
		mediaUrls = [mediaUrls];

	mediaUrls.push("vlc://quit");

	//Run player
	var options = [
		"--fullscreen",
		"--play-and-exit",
		"-I", "http",
		"--http-password", conf.player_password,
		"--http-port", this.port.val,
		"--sub-file", subtitlesPath,
		"--"
	].concat(mediaUrls);
	var child = spawn(conf.player_command, options);

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
