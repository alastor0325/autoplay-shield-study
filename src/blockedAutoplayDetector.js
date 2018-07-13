"use strict";

var blockCount = 0;

// Test for replacing original play
HTMLMediaElement.prototype.playDefault = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function playWrapper() {
	console.log("### call play from wrapper");
	this.playDefault().then(function success(resolve) {
		console.log("### success");
	}).catch(function error(e){
		blockCount++;
		console.log(`### play fail count=${blockCount}, reason=${e.message}`);
	});
}

exportFunction(HTMLMediaElement.prototype.play, HTMLMediaElement.prototype,
	{defineAs:'play'});

