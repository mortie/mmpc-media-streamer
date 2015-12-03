var exec = require("child_process").spawn;

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

	console.log("player GUI on port "+this.port.val);

	//Log player output to console
	child.stdout.on("data", function(data) {
		console.log("player: "+data.toString().trim());
	});
	child.stderr.on("data", function(data) {
		console.log("player: error: "+data.toString().trim());
	});

	//Clean up when the player exits
	child.on("exit", function() {
		this.port.free();
		if (this.onexit)
			this.onexit();
	}.bind(this));
}
