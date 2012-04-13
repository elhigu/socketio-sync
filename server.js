var fs = require('fs');

var https = require('https');
var privateKey = fs.readFileSync('ssl/keys/server.key').toString();
var certificate = fs.readFileSync('ssl/certs/server.crt').toString();
var ca = fs.readFileSync('ssl/ca/ca.crt').toString();

var jsp = require("uglify-js").parser;
var pro = require("uglify-js").uglify;
var diff_match_patch = require('diff_match_patch');
var dmp = new (require('diff_match_patch').diff_match_patch)(); 
var express = require('express');
var app = express.createServer({key:privateKey,cert:certificate,ca:ca });
var io = require('socket.io').listen(app, {key:privateKey,cert:certificate,ca:ca});

app.use(express.static(__dirname + '/public'));
app.listen(5001);

app.get('/', function (req, res) {
	res.redirect('/index.html');
});

app.get('/main.js', function (req, res) {
	// Minify and send to prevent stealing for now and to amaze!.
	var orig_code= fs.readFileSync(__dirname + '/main.js').toString();
	var ast = jsp.parse(orig_code);
	ast = pro.ast_mangle(ast);
	ast = pro.ast_squeeze(ast); 
	var final_code = pro.gen_code(ast); 
	res.send(final_code);
//	res.sendfile(__dirname + '/main.js');
});

// write some data storage for actually holding the data more permanent basis.
// Also since we are dealing with js better to write class to handle atomic operations
// when applying changes etc. to document.
var official_doc = "This is some stored document <b>official</b> starting state";
var current_viewers = {};
var rev = 0;

function is_patch_ok(patch) {
	console.log(patch);
	for (var result in patch[1]) {
		if (!result) {
			return false;
		}
	}
	return true;
}

io.sockets.on('connection', function (socket) {
	var address = socket.handshake.address;
	var key = address.address + ":" + address.port;
	current_viewers[key] = true;
	console.log("Someone connected from: " + address.address + ":" + address.port);
	socket.emit('current', { data: official_doc, rev: rev });
	io.sockets.emit('who', current_viewers);
	
	/**
	 * Got patch... apply and broadcast to everyone.
	 */
	socket.on('patch', function (text_diff) {
		var diffs = dmp.patch_fromText(text_diff);
		var old_text = official_doc;
		var patch = dmp.patch_apply(diffs, old_text);
				
		// check if patch can be applied and if so update official version 
		if (is_patch_ok(patch)) {
			rev += 1;
			official_doc = patch[0];
			console.log(official_doc);
			socket.broadcast.emit('patch', { data: text_diff, rev: rev });
			socket.emit('success', { data: text_diff, rev: rev });
		} else {
			// emit to sender that they had conflict so that they can restore their doc
			socket.emit('conflict', {});
		}
	});
	
	socket.on('disconnect', function () {
		var address = socket.handshake.address;
		var key = address.address + ":" + address.port;
		delete current_viewers[key];
		console.log("Disconnect from: " + address.address + ":" + address.port);
		io.sockets.emit('who', current_viewers);
	});

});
