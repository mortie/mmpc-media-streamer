function q() {
	return document.querySelector.apply(document, arguments);
}

function error(err) {
	console.log(err);
	alert(err);
}

function overlay(content) {
	if (content === undefined) content = "";

	q(".overlay").className += " active";
	q(".overlay .content").innerHTML = content;
}

function deoverlay() {
	q(".overlay").className = q(".overlay").className.replace(/\s*active/, "");
}

window.addEventListener("popstate", function() {
	deoverlay();
});

function post(url, payload, cb) {
	if (cb === undefined) {
		cb = payload;
		payload = undefined;
	}

	console.log(url, payload);

	var xhr = new XMLHttpRequest();
	xhr.open("POST", url);
	xhr.overrideMimeType("application/json");
	xhr.send(payload);

	xhr.onload = function() {
		if (xhr.responseText && cb) {
			try {
				var obj = JSON.parse(xhr.responseText);
				cb(obj.error, obj);
			} catch (e) {
				console.log(xhr.responseText);
				cb(e);
			}
		}
	};
}

var form = q("#form");
var link = q("#link");
var torrentFile = q("#torrent-file");

form.reset();

function handleResponse(err, res) {
	if (err) return error(err);
	
	if (res.redirect) {
		location.href = res.redirect;
	}
}

form.addEventListener("submit", function(evt) {
	evt.preventDefault();

	var formData = new FormData();

	//Linx if link field is filled
	if (link.value) {
		var href = encodeURIComponent(link.value);
		if (link.indexOf("magnet:") === 0) {
			post("/view/magnet/"+href, formData, handleResponse);
		} else if (link.indexOf("youtube.com/watch") !== -1) {
			post("/view/youtube/"+href, formData, handleResponse);

	//Torrent if torrent files are supplied
	} else if (torrentFile.files.length > 0) {
		formData.append("file", torrentFile.files[0]);
		post("/view/torrent", formData, handleResponse);

	} else {
		overlay("Loading...");
		return;
	}

	form.reset();
});
