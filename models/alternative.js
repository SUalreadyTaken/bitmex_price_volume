const mongoose = require('mongoose');

const schema = mongoose.Schema({
	alternativeApp: Boolean
});

const AlternativeModel = mongoose.model('Alternative',schema,'alternative');

module.exports = { AlternativeModel };