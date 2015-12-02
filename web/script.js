function q() {
	return document.querySelector.apply(document, arguments);
}

function error(err) {
	console.log(err);
	alert(err);
}

function overlay(content) {
	q(".overlay").className += " active";
	q(".overlay .content").innerHTML = content;
}

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
var magnetLink = q("#magnet-link");
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

	if (magnetLink.value) {
		var href = encodeURIComponent(magnetLink.value);
		post("/view/magnet/"+href, formData, function(err, res) {
			handleResponse(err, res);
		});
	} else if (torrentFile.files.length > 0) {
		formData.append("file", torrentFile.files[0]);
		post("/view/torrent", formData, function(err, res) {
			handleResponse(err, res);
		});
	} else {
		return;
	}

	overlay("Loading...");
	form.reset();
});
