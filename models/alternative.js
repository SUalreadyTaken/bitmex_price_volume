const mongoose = require('mongoose');

const schema = mongoose.Schema({
	alternativeApp: Boolean,
	// timestamp in millis when to switch to alternative app
	switchTime: Number
});

const AlternativeModel = mongoose.model('Alternative',schema,'alternative');

module.exports = { AlternativeModel };