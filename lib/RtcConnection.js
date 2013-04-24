var protocol = require('./protocol.js');
var MESSAGE_TYPE = protocol.MESSAGE_TYPE;
var PROTOCOL_NAME = protocol.NAME;
var Connection = require('./Connection.js');

var DEFAULT_CONFIGURATION = null;
var DEFAULT_CONSTRAINTS = {optional: [{RtpDataChannels: true}]};
var MEDIA_CONSTRAINTS = {
    optional: [],
    mandatory: {
        OfferToReceiveAudio: false,
        OfferToReceiveVideo: false
    }
};

var RtcConnection = module.exports = function(connection, rtcConnection){
	this.connection = connection;
	connection.sendToSocket = this.sendToSocket.bind(this);
	connection.createRtcConnection = RtcConnection.create;

	this.rtcConnection = rtcConnection;
	this.rtcConnection.onicecandidate = this.iceCandidateHandler.bind(this);

	this.socket = rtcConnection.createDataChannel(PROTOCOL_NAME, {reliable: false});
	this.socket.onmessage = this.connection.messageHandler.bind(this.connection);
	this.socket.onopen = this.openHandler.bind(this);
	this.socket.onclose = this.closeHandler.bind(this);
	this.socket.onerror = this.errorHandler.bind(this);
};

RtcConnection.create = function(relay, remoteId, options){
	options = options || {};

	var configuration = options.configuration || DEFAULT_CONFIGURATION,
		constraints = options.constraints || DEFAULT_CONSTRAINTS,
		rtcConnection = options.rtcConnection || new webkitRTCPeerConnection(configuration, constraints),
		connection = new Connection(),
		peerConnection = new RtcConnection(connection, rtcConnection);

	peerConnection.setRelay(relay, remoteId);

	return peerConnection;
};

RtcConnection.prototype.getApi = function(){
	return this.connection.getApi();
};

RtcConnection.prototype.sendToSocket = function(message){
	switch(this.socket.readyState){
		case "connecting":
			throw new Error("Can't send a message while RTCDataChannel connecting");
			break;
		case "open":
			this.socket.send(message);
			break;
		case "closing":
		case "closed":
			throw new Error("Can't send a message while RTCDataChannel is closing or closed");
			break;
	}
};

RtcConnection.prototype.errorHandler = function(event){
	this.connection.emit('error', event);
};

RtcConnection.prototype.openHandler = function(event){
	this.connection.emit('open');
};

RtcConnection.prototype.closeHandler = function(event){
	this.connection.emit('close');
};

RtcConnection.prototype.setRelay = function(relay, remoteId){
	if(this.relay) this.relay.relay(this, this.remoteId);
	
	this.relay = relay;
	this.remoteId = remoteId;
	this.relay.relayFor(this, remoteId);
};

RtcConnection.prototype.iceCandidateHandler = function(event){
	var candidate = event.candidate;
	if(candidate){
		this.relay.relay(this.remoteId,
			[
				MESSAGE_TYPE.RTC_ICE_CANDIDATE,
				candidate
			]
		);
	}
};

RtcConnection.prototype.createOffer = function(){
	var self = this;
	
	this.rtcConnection.createOffer(function(description){
		self.rtcConnection.setLocalDescription(description);
		self.relay.relay(self.remoteId,
			[
				MESSAGE_TYPE.RTC_OFFER,
				description
			]
		);
	}, null, MEDIA_CONSTRAINTS);
};

RtcConnection.prototype.createAnswer = function(remoteDescription){
	var self = this;

	this.rtcConnection.setRemoteDescription(new RTCSessionDescription(remoteDescription));
	this.rtcConnection.createAnswer(function(description){
		self.rtcConnection.setLocalDescription(description);
		self.relay.relay(self.remoteId,
			[
				MESSAGE_TYPE.RTC_ANSWER,
				description
			]
		);
	});
};

RtcConnection.prototype.receiveAnswer = function(description){
	this.rtcConnection.setRemoteDescription(new RTCSessionDescription(description));
}

RtcConnection.prototype.addIceCandidate = function(candidate){
	this.rtcConnection.addIceCandidate(new RTCIceCandidate(candidate));
};