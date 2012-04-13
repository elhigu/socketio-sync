/**
 * Utility to make content synchronizable through socket.io
 *
 * TODO: remove jquery dependency and make separate wrapper for it
 */

/**
 * Keeps track incoming patches and applies them in order
 * 
 * TODO: calculate new caret positions and add calls set / get hooks this is a bit tricky.. 
 * need to convert diff format to more applicable format...
 *
 * TODO: keep up count of locally sent patches that has not been seen returned...
 */
function Patcher(doc, rev, on_update) {
	// use as much private variables as possible to
	// help minifier
	var on_update = on_update;
	var dmp = new diff_match_patch();
	
	this.set = function (doc, rev) {
		// TODO: change these to private variables
		// official serverside view to doc
		this.doc = doc;
		// locally edited version after last time when changes were sent to server
		this.local_doc = doc;
		this.rev = rev;
		this.incoming = {};
		this.count = 0;
	}
	
	this.set(doc, rev);
	
	this.add = function (rev, patch) {
		this.incoming[rev] = patch;
		this.count += 1;
		return this.apply();
	}
	
	/**
	 * Applies pending patches and tell if in sync.
     */
	this.apply = function() {
		// iterate at max as many times as there is patches waiting
		for (i in this.incoming) {
			var next_rev = this.rev + 1;
			if (next_rev in this.incoming) {
				patch = this.incoming[next_rev];
				this.count -= 1;
				delete this.incoming[next_rev];
				this.doc = dmp.patch_apply(patch, this.doc)[0];
				// NOTE: if apply patch here fails for some reason 
				// something must be horribly wrong since the server has
				// already done the same patch successfully for the same rev
				this.rev = next_rev;
			} else {
				break;
			}
		}
		
		on_update(this.rev, this.doc);
		
		// pending patches...
		return this.count;
	}
}

/**
 * Default validator to halt if something is really wrong
 * e.g. firebug data is being added to document.
 */
function Validator () {
	this.validate = function (doc) {
		// if anything else create better validator... also do check serverside.
		// stop if firebug is detected messing around.
		if (doc.search("(class='[^']*|class=\"[^\"]*)firebug") != -1) {
			return false;
		} 
		return true;
	}
}

/**
 * Class to monitor certain element with value and keep it in sync with serverside content.
 *
 * TODO: status callbacks e.g. conflict, resync,  ready
 *
 * TODO: interval should probably depend on connection style, or to allos give callback if editor 
 *       wants to send edit event by itself
 * 
 * TODO: official doc and patch queue. Keep up doc sync with server separately, which can be used to
 *
 * TODO: Allow delivering connected user specific metadata. And strategy how to apply patches to 
 * metadata so that e.g. selections etc. will be correctly transformed.
 */
function SynchronizeContent (content_url, options) {
	var dmp = new diff_match_patch();

	var start = false;
	var interval = options['interval'];
	var get_content = options['content'];
	var set_content = options['set_content'];
	var get_caret = options['caret'];
	var set_caret = options['set_caret'];
	var on_who = options['on_who'];
	var patches = new Patcher("", 0, options['on_update']);
	var validate = new Validator();

	var checkChanges = function () {
		var self = this;
		var new_text = get_content();
		// TODO: validator should probably be called in patcher..
		if (start && validate.validate(new_text)) {
			if (typeof new_text != 'string') {
				// TODO: ifx this to be less visible...
				alert("Error: content callback should return string!");
			}
			var diff = dmp.patch_make(patches.local_doc, new_text);
			if (diff.length > 0) {
				socket.emit('patch', dmp.patch_toText(diff));
				// NOTE: also bad API here...
				patches.local_doc = new_text;
			}
		} else {
			// TODO: some nicer fix... currently just reset to last stable..
			set_content(patches.doc);
		}
	}

	// Start monitoring "thread" TODO: add this as callback on content change if wanted..
	var diff_thread = this.intervalID = setInterval(
		(function(self) { return function() {checkChanges();} })(this), interval);

//	var socket = io.connect(content_url, {secure: true});
	var socket = io.connect(content_url);

	// make obj visible to it's sockets callbacks and check that location does not have earlier connection created.
	if (socket.parent != undefined) {
		console.error("You have defined various sockets to same namespace:" + content_url);		
	}
	
	socket.on('connect', function (socket) {
		// Maybe set status or something... probably can be asked from socket as well...
	});

	/**
	* Read and apply remote patches from content server.
	*/
	socket.on('patch', function (update) {
		var diff = dmp.patch_fromText(update['data']);
		var patch_rev = update['rev'];
		var pending = patches.add(patch_rev, diff);

		if (pending == 0) {
			var caret_pos = get_caret();
			patches.local_doc = patches.doc;
			set_content(patches.doc);
			set_caret(caret_pos[0], caret_pos[1]);
			// TODO: for making minify more efficient pass this callback to patcher and store private
		} else if (pending > 5) {
			// NOTE: If there are lots of patches pending consider:
			// * informing user
			// * copy work in progress text to other field
			// * update synched version of document to other test field that is read only
			alert("There are too many changes that cannot be applied to your document, please refresh.");
			// TODO: add callback here too
		}		
	});

	/**
	 * Backend returned your patch with revision info where to put it in official document
	 */
	socket.on('success', function (update) {
		var diff = dmp.patch_fromText(update['data']);
		var patch_rev = update['rev'];
		var pending = patches.add(patch_rev, diff);
		// TODO: check pending count that we are ok..
	});

	/**
	* Patch sent by you caused conflict in document state.
	*/
	socket.on('conflict', function () {
		// TODO: restore rev and document from pathed version
		alert("Conflict was what you did... your changes were rejected.");
	});

	/**
	* Complete update was read from server.
	*/
	socket.on('current', function (update) {
		var official_doc = update['data'];
		var rev = update['rev'];
		patches.set(official_doc, rev);
		set_content(patches.doc);
		start = true;
	});

	/**
	* Information about connected users was received
	*/
	socket.on('who', function (viewers) {
		var connections = [];
		for (var key in viewers) {
		    connections.push(key);
		}
		on_who(connections);
	});
}

